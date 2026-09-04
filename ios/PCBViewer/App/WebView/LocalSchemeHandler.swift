import WebKit

/// Serves the app itself and the currently-open project folder from a single
/// custom-scheme origin ("pcbapp://local/..."), matching the literal URL
/// webapp/src/fs/nativeProjectFileSystem.ts hardcodes for project files
/// ("pcbapp://local/project/...") and the one WebViewRepresentable loads the
/// app from ("pcbapp://local/app/..."). Both MUST share scheme+host --
/// WKWebView treats a mismatch as cross-origin and the app's plain fetch()
/// calls (no CORS handshake possible against a custom scheme) fail silently.
final class LocalSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "pcbapp"
    static let host = "local"

    private let webAssetsURL: URL
    private let queue = DispatchQueue(label: "com.csmeby.pcbviewer.localscheme", qos: .userInitiated)
    private let lock = NSLock()
    private var cancelledTasks = Set<ObjectIdentifier>()

    override init() {
        guard let resourceURL = Bundle.main.url(forResource: "WebAssets", withExtension: nil) else {
            fatalError("WebAssets is missing from the app bundle -- run Scripts/copy-web-assets.sh (or the CI step that mirrors it) before building.")
        }
        webAssetsURL = resourceURL
        super.init()
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url,
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        let path = components.path

        let fileURL: URL
        if path.hasPrefix("/app/") {
            fileURL = webAssetsURL.appendingPathComponent(String(path.dropFirst("/app/".count)))
        } else if path.hasPrefix("/project/") {
            guard let root = BookmarkStore.shared.currentProjectRoot else {
                task.didFailWithError(URLError(.fileDoesNotExist))
                return
            }
            let relative = String(path.dropFirst("/project/".count))
                .split(separator: "/", omittingEmptySubsequences: false)
                .map { $0.removingPercentEncoding ?? String($0) }
                .joined(separator: "/")
            fileURL = root.appendingPathComponent(relative)
        } else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }

        let id = ObjectIdentifier(task)
        queue.async { [weak self] in
            guard let self else { return }
            do {
                let data = try Data(contentsOf: fileURL)
                // Must be an HTTPURLResponse, not a plain URLResponse -- the
                // page's fetch() reads response.status/response.ok, and a
                // bare URLResponse has no status code (JS sees status 0,
                // ok=false), which is exactly what made
                // NativeProjectFileSystem.get() fail with "HTTP 0" for every
                // project file. Only the JS-visible fetch() path (project
                // files) hits this -- webView.load()'s own navigation for
                // /app/* doesn't inspect response.status, which is why the
                // app itself loaded fine despite this bug.
                guard let response = HTTPURLResponse(
                    url: url,
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: [
                        "Content-Type": Self.mimeType(for: fileURL.pathExtension),
                        "Content-Length": String(data.count),
                    ]
                ) else {
                    self.finish(id: id) { task.didFailWithError(URLError(.badServerResponse)) }
                    return
                }
                self.finish(id: id) {
                    task.didReceive(response)
                    task.didReceive(data)
                    task.didFinish()
                }
            } catch {
                self.finish(id: id) {
                    task.didFailWithError(error)
                }
            }
        }
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        lock.lock()
        cancelledTasks.insert(ObjectIdentifier(task))
        lock.unlock()
    }

    /// WKURLSchemeTask throws a fatal API-violation error if its methods are
    /// called after `stop` -- route every completion through here so a task
    /// cancelled mid-read (e.g. the WebView navigated away) is dropped instead.
    private func finish(id: ObjectIdentifier, _ body: @escaping () -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.lock.lock()
            let wasCancelled = self.cancelledTasks.remove(id) != nil
            self.lock.unlock()
            if wasCancelled { return }
            body()
        }
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        // occt-import-js (STEP parser for 3D component models) needs this
        // exact MIME type for its WASM streaming-compile fast path -- a
        // generic octet-stream response makes it fall back to a slower
        // (but still correct) ArrayBuffer path, so this isn't strictly
        // required for correctness, just performance, but it's a one-line
        // fix for a demonstrated real failure mode in bundler contexts.
        case "wasm": return "application/wasm"
        case "kicad_pcb", "kicad_sch", "kicad_pro", "kicad_wks", "kicad_mod": return "text/plain"
        default: return "application/octet-stream"
        }
    }
}

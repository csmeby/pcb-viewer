import UIKit
import WebKit
import os.log

/// Mirrors webapp/src/bridge/nativeBridge.ts and android/.../WebAppBridge.kt:
/// the JS side posts to window.webkit.messageHandlers.pcbBridge, we call back
/// into window.__pcbviewer.*. Message vocabulary is intentionally small --
/// exactly what nativeBridge.ts sends: "ready", "pickFolder", "jsError".
final class NativeBridge: NSObject, WKScriptMessageHandler {
    static let messageHandlerName = "pcbBridge"

    private static let log = Logger(subsystem: "com.csmeby.pcbviewer", category: "NativeBridge")

    weak var webView: WKWebView?
    weak var presentingViewController: UIViewController?

    private let folderPicker = ProjectFolderPicker()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == Self.messageHandlerName else { return }
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            Self.log.error("Received a pcbBridge message with no \"type\": \(String(describing: message.body))")
            return
        }

        switch type {
        case "ready":
            handleReady()
        case "pickFolder":
            handlePickFolder()
        case "jsError":
            let text = (body["message"] as? String) ?? "(no message)"
            // This is the app's own crash/diagnostic channel (see
            // ErrorBoundary.tsx and index.html's early-diagnostic script) --
            // surfacing it to the system log is the whole point, there's no
            // richer place to show it since the WebView itself may be blank.
            Self.log.error("[JS] \(text, privacy: .public)")
        default:
            Self.log.error("Unknown pcbBridge message type: \(type, privacy: .public)")
        }
    }

    private func handleReady() {
        do {
            if let root = try BookmarkStore.shared.resolveLastProjectRoot() {
                pushManifest(for: root)
            }
        } catch {
            sendProjectError("Couldn't reopen the last project folder: \(error.localizedDescription)")
        }
    }

    private func handlePickFolder() {
        guard let presentingViewController else { return }
        folderPicker.present(from: presentingViewController) { [weak self] url in
            guard let self, let url else { return } // nil == user cancelled; leave current state alone
            do {
                try BookmarkStore.shared.setProjectRoot(url)
                self.pushManifest(for: url)
            } catch {
                self.sendProjectError("Couldn't open that folder: \(error.localizedDescription)")
            }
        }
    }

    private func pushManifest(for root: URL) {
        do {
            let manifest = try ProjectFolderPicker.buildManifest(root: root)
            let payload: [String: Any] = ["projectName": manifest.projectName, "files": manifest.files]
            let data = try JSONSerialization.data(withJSONObject: payload)
            let json = String(data: data, encoding: .utf8) ?? "null"
            callJS("window.__pcbviewer.onProjectManifest(\(json));")
        } catch {
            sendProjectError("Couldn't read that project folder: \(error.localizedDescription)")
        }
    }

    private func sendProjectError(_ message: String) {
        callJS("window.__pcbviewer.onProjectError(\(Self.jsonStringLiteral(message)));")
    }

    private func callJS(_ script: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    /// Safely embeds an arbitrary Swift string as a JS string literal by
    /// round-tripping it through JSONSerialization (wrap-in-array is the
    /// standard trick, since JSONSerialization requires an array/dict root).
    private static func jsonStringLiteral(_ string: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [string]),
              let array = String(data: data, encoding: .utf8) else {
            return "\"\""
        }
        return String(array.dropFirst().dropLast())
    }
}

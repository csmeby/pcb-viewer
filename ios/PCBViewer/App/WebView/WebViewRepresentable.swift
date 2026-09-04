import SwiftUI
import WebKit

/// A UIViewControllerRepresentable (not a plain UIViewRepresentable) so the
/// WKWebView has a real presenting UIViewController to hand to NativeBridge
/// for UIDocumentPickerViewController -- SwiftUI doesn't hand one to a bare
/// UIViewRepresentable's makeUIView.
struct WebViewRepresentable: UIViewControllerRepresentable {
    let bridge: NativeBridge

    func makeUIViewController(context: Context) -> UIViewController {
        let controller = UIViewController()

        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(LocalSchemeHandler(), forURLScheme: LocalSchemeHandler.scheme)
        configuration.userContentController.add(bridge, name: NativeBridge.messageHandlerName)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .black

        // The page has its own pinch-to-zoom/pan on the schematic and PCB
        // canvases (KiCanvas) -- WKWebView's own page-zoom gesture recognizer
        // sits on top and steals two-finger touches before they reach the
        // canvas, making the in-app zoom unusable. Disable the native page
        // zoom entirely so every pinch goes to the web content instead.
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 1.0
        webView.scrollView.bouncesZoom = false
        if #available(iOS 16.4, *) {
            // Lets Safari's Web Inspector attach to this WKWebView on a
            // connected iPad -- useful for confirming the app renders
            // identically to the plain web build.
            webView.isInspectable = true
        }

        controller.view.backgroundColor = .black
        controller.view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: controller.view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: controller.view.bottomAnchor),
        ])

        bridge.webView = webView
        bridge.presentingViewController = controller

        let url = URL(string: "\(LocalSchemeHandler.scheme)://\(LocalSchemeHandler.host)/app/index.html")!
        webView.load(URLRequest(url: url))

        return controller
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}

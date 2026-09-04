import SwiftUI

struct ContentView: View {
    // Owned here (not inside WebViewRepresentable) so it survives
    // makeUIViewController being called again if SwiftUI ever recreates the
    // representable -- the picked-project state lives in BookmarkStore.shared
    // regardless, but the WKScriptMessageHandler identity should stay stable.
    private let bridge = NativeBridge()

    // Background fills edge-to-edge (so there's no white flash behind the
    // status bar / home indicator), but the WebView itself is NOT
    // .ignoresSafeArea() -- the web page's own top bar ("Open Project...")
    // sits flush at the top of its content, and ignoring the safe area put
    // it directly under the status bar's clock/time display. Same fix as
    // Android's MainActivity.kt (pad a container instead of going fully
    // edge-to-edge on the interactive content).
    var body: some View {
        ZStack {
            Color(red: 0x0B / 255, green: 0x0D / 255, blue: 0x0C / 255)
                .ignoresSafeArea()
            WebViewRepresentable(bridge: bridge)
        }
    }
}

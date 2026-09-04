import SwiftUI

struct ContentView: View {
    // Owned here (not inside WebViewRepresentable) so it survives
    // makeUIViewController being called again if SwiftUI ever recreates the
    // representable -- the picked-project state lives in BookmarkStore.shared
    // regardless, but the WKScriptMessageHandler identity should stay stable.
    private let bridge = NativeBridge()

    var body: some View {
        WebViewRepresentable(bridge: bridge)
            .ignoresSafeArea()
    }
}

package com.csmeby.pcbviewer

import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: WebAppBridge
    private lateinit var folderStore: ProjectFolderStore

    private val openTreeLauncher = registerForActivityResult(
        ActivityResultContracts.OpenDocumentTree()
    ) { uri ->
        if (uri == null) return@registerForActivityResult // user cancelled the picker
        folderStore.adoptPickedTree(uri) { result ->
            result.fold(
                onSuccess = { manifest -> bridge.sendProjectManifest(manifest) },
                onFailure = { error -> bridge.sendProjectError("Couldn't open that folder: ${error.message}") },
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        folderStore = ProjectFolderStore(applicationContext)

        webView = WebView(this)
        webView.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.setBackgroundColor(android.graphics.Color.parseColor("#0B0D0C"))
        if (0 != (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)) {
            // Lets `chrome://inspect` attach to this WebView on a connected
            // device -- useful for confirming the app renders identically to
            // the plain web build.
            WebView.setWebContentsDebuggingEnabled(true)
        }

        // Apps targeting API 35+ draw edge-to-edge unconditionally (there's
        // no opting out on API 36) -- but the status bar is still a real
        // overlay window that eats touches in its strip regardless of what's
        // drawn beneath it ("PhoneStatusBarView: onTouch: No touch handler
        // provided; eating gesture"), which made the app's own top bar
        // (right at the top of the page) untappable. WebView.setPadding()
        // doesn't reliably resize its content viewport (a known WebView
        // quirk), so the inset padding goes on a plain container instead --
        // ordinary ViewGroup layout DOES shrink a MATCH_PARENT child to its
        // parent's padded bounds. The window itself stays edge-to-edge (its
        // background shows through behind both bars).
        val root = FrameLayout(this)
        root.addView(webView)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        setContentView(root)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/project/", ProjectPathHandler(applicationContext, folderStore))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        bridge = WebAppBridge(
            webView = webView,
            onReady = {
                folderStore.reopenLastTree { result ->
                    result?.fold(
                        onSuccess = { manifest -> bridge.sendProjectManifest(manifest) },
                        onFailure = { error -> bridge.sendProjectError("Couldn't reopen the last project folder: ${error.message}") },
                    )
                }
            },
            onPickFolder = { openTreeLauncher.launch(null) },
        )
        webView.addJavascriptInterface(bridge, "AndroidPcbBridge")

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
    }
}

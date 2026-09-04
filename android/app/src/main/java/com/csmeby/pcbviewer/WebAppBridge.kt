package com.csmeby.pcbviewer

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mirrors webapp/src/bridge/nativeBridge.ts and iOS's NativeBridge.swift. JS
 * posts a JSON *string* here -- addJavascriptInterface only marshals
 * primitives/strings, not objects, unlike WKWebView's message handler -- and
 * we call back into window.__pcbviewer.* via evaluateJavascript. Message
 * vocabulary matches nativeBridge.ts exactly: "ready", "pickFolder", "jsError".
 *
 * @JavascriptInterface methods run on a WebView-owned background thread, not
 * the UI thread, so every callback here hops back via webView.post {}.
 */
class WebAppBridge(
    private val webView: WebView,
    private val onReady: () -> Unit,
    private val onPickFolder: () -> Unit,
) {
    @JavascriptInterface
    fun postMessage(json: String) {
        val body = try {
            JSONObject(json)
        } catch (error: Exception) {
            Log.e(TAG, "Received a non-JSON pcbBridge message: $json", error)
            return
        }
        when (body.optString("type")) {
            "ready" -> webView.post { onReady() }
            "pickFolder" -> webView.post { onPickFolder() }
            "jsError" -> Log.e(TAG, "[JS] " + body.optString("message", "(no message)"))
            else -> Log.w(TAG, "Unknown pcbBridge message type: $json")
        }
    }

    fun sendProjectManifest(manifest: ProjectManifest) {
        val payload = JSONObject()
        payload.put("projectName", manifest.projectName)
        payload.put("files", JSONArray(manifest.files))
        callJS("window.__pcbviewer.onProjectManifest($payload);")
    }

    fun sendProjectError(message: String) {
        callJS("window.__pcbviewer.onProjectError(${JSONObject.quote(message)});")
    }

    private fun callJS(script: String) {
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private companion object {
        const val TAG = "WebAppBridge"
    }
}

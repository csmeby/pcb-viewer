package com.csmeby.pcbviewer

import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader

/**
 * Serves the currently open project's files under
 * https://appassets.androidplatform.net/project/<relative path> --
 * deliberately the same origin the app itself loads from (WebViewAssetLoader's
 * fixed domain), matching the Android branch of
 * webapp/src/fs/nativeProjectFileSystem.ts's projectFileURL(). This is the
 * native side of NativeProjectFileSystem.get()'s fetch().
 *
 * WebViewAssetLoader calls handle() with the prefix ("/project/") already
 * stripped, so `path` here is exactly one of the manifest's relative paths
 * (percent-decoded per segment, matching how the JS side encoded it).
 */
class ProjectPathHandler(
    private val context: Context,
    private val folderStore: ProjectFolderStore,
) : WebViewAssetLoader.PathHandler {

    override fun handle(path: String): WebResourceResponse? {
        val decoded = path.split("/").joinToString("/") { Uri.decode(it) }
        val uri = folderStore.resolve(decoded) ?: return null
        val stream = try {
            context.contentResolver.openInputStream(uri)
        } catch (error: Exception) {
            null
        } ?: return null

        val mimeType = MimeTypeMap.getFileExtensionFromUrl(decoded)
            ?.let { MimeTypeMap.getSingleton().getMimeTypeFromExtension(it) }
            ?: "application/octet-stream"
        return WebResourceResponse(mimeType, null, stream)
    }
}

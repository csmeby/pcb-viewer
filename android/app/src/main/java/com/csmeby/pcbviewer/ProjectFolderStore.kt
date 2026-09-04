package com.csmeby.pcbviewer

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import java.util.concurrent.Executors

data class ProjectManifest(val projectName: String, val files: List<String>)

/**
 * Persists the SAF tree Uri for the picked project folder (survives app
 * restarts via takePersistableUriPermission, mirroring iOS's security-scoped
 * bookmark in BookmarkStore.swift) and maintains a relative-path -> content
 * Uri map so ProjectPathHandler can serve file bytes back to the WebView
 * without re-walking the tree on every fetch().
 */
class ProjectFolderStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("project_folder_store", Context.MODE_PRIVATE)
    private val executor = Executors.newSingleThreadExecutor()

    @Volatile
    private var pathToUri: Map<String, Uri> = emptyMap()

    fun adoptPickedTree(treeUri: Uri, callback: (Result<ProjectManifest>) -> Unit) {
        context.contentResolver.takePersistableUriPermission(
            treeUri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
        )
        prefs.edit().putString(KEY_TREE_URI, treeUri.toString()).apply()
        walk(treeUri, callback)
    }

    /** null means "no folder was ever picked" (not an error, stay in the default empty state). */
    fun reopenLastTree(callback: (Result<ProjectManifest>?) -> Unit) {
        val stored = prefs.getString(KEY_TREE_URI, null)
        if (stored == null) {
            callback(null)
            return
        }
        val treeUri = Uri.parse(stored)
        val stillGranted = context.contentResolver.persistedUriPermissions.any {
            it.uri == treeUri && it.isReadPermission
        }
        if (!stillGranted) {
            callback(Result.failure(IllegalStateException("Access to the last project folder was revoked.")))
            return
        }
        walk(treeUri, callback)
    }

    fun resolve(relativePath: String): Uri? = pathToUri[relativePath]

    private fun walk(treeUri: Uri, callback: (Result<ProjectManifest>) -> Unit) {
        executor.execute {
            try {
                val root = DocumentFile.fromTreeUri(context, treeUri)
                    ?: throw IllegalStateException("Couldn't open the selected folder.")
                val map = LinkedHashMap<String, Uri>()
                walkInto(root, "", map)
                pathToUri = map
                callback(Result.success(ProjectManifest(projectName = root.name ?: "Project", files = map.keys.sorted())))
            } catch (error: Exception) {
                callback(Result.failure(error))
            }
        }
    }

    private fun walkInto(dir: DocumentFile, prefix: String, out: MutableMap<String, Uri>) {
        for (child in dir.listFiles()) {
            val name = child.name ?: continue
            if (name.startsWith(".")) continue
            val relativePath = if (prefix.isEmpty()) name else "$prefix/$name"
            if (child.isDirectory) {
                walkInto(child, relativePath, out)
            } else if (child.isFile) {
                out[relativePath] = child.uri
            }
        }
    }

    private companion object {
        const val KEY_TREE_URI = "tree_uri"
    }
}

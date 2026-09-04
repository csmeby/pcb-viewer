import Foundation

/// Persists the picked project folder as a security-scoped bookmark so it
/// can be silently reopened on the next launch (App.tsx's "ready" handshake
/// is what triggers NativeBridge to try this) without re-prompting the user
/// with the folder picker every time.
final class BookmarkStore {
    static let shared = BookmarkStore()

    private let defaultsKey = "lastProjectBookmark"
    private(set) var currentProjectRoot: URL?

    private init() {}

    func setProjectRoot(_ url: URL) throws {
        _ = url.startAccessingSecurityScopedResource()
        let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        UserDefaults.standard.set(bookmark, forKey: defaultsKey)
        replaceCurrentRoot(with: url)
    }

    /// Returns nil if there's no persisted bookmark (first launch, or the
    /// user never picked a folder) -- that's not an error, the app just
    /// stays in its default empty state. Throws if a bookmark exists but can
    /// no longer be resolved (folder moved/deleted, access revoked).
    @discardableResult
    func resolveLastProjectRoot() throws -> URL? {
        guard let bookmark = UserDefaults.standard.data(forKey: defaultsKey) else {
            return nil
        }
        var isStale = false
        let url = try URL(resolvingBookmarkData: bookmark, options: [], relativeTo: nil, bookmarkDataIsStale: &isStale)
        _ = url.startAccessingSecurityScopedResource()
        if isStale, let refreshed = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
            UserDefaults.standard.set(refreshed, forKey: defaultsKey)
        }
        replaceCurrentRoot(with: url)
        return url
    }

    private func replaceCurrentRoot(with url: URL) {
        if let previous = currentProjectRoot, previous != url {
            previous.stopAccessingSecurityScopedResource()
        }
        currentProjectRoot = url
    }
}

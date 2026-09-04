import UIKit
import UniformTypeIdentifiers

struct ProjectManifestPayload {
    let projectName: String
    let files: [String]
}

/// Presents UIDocumentPickerViewController (folder mode) and builds the
/// {projectName, files} manifest the same shape webapp/src/fs/browserFileSystem.ts
/// produces client-side -- a flat, sorted list of relative file paths with
/// dot-files skipped, directories omitted (KiCanvas/NativeProjectFileSystem
/// only ever needs to `fetch()` individual files, never list directories).
final class ProjectFolderPicker: NSObject, UIDocumentPickerDelegate {
    private var completion: ((URL?) -> Void)?

    func present(from viewController: UIViewController, completion: @escaping (URL?) -> Void) {
        self.completion = completion
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        picker.allowsMultipleSelection = false
        picker.delegate = self
        viewController.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        let completion = self.completion
        self.completion = nil
        completion?(urls.first)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        let completion = self.completion
        self.completion = nil
        completion?(nil)
    }

    static func buildManifest(root: URL) throws -> ProjectManifestPayload {
        let rootPath = root.standardizedFileURL.path
        var files: [String] = []

        let keys: [URLResourceKey] = [.isDirectoryKey]
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles],
            errorHandler: nil
        ) else {
            throw NSError(
                domain: "ProjectFolderPicker",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Couldn't read the selected folder."]
            )
        }

        for case let fileURL as URL in enumerator {
            let name = fileURL.lastPathComponent
            if name.hasPrefix(".") { continue }
            let values = try fileURL.resourceValues(forKeys: Set(keys))
            if values.isDirectory == true { continue }

            let fullPath = fileURL.standardizedFileURL.path
            guard fullPath.hasPrefix(rootPath) else { continue }
            var relative = String(fullPath.dropFirst(rootPath.count))
            if relative.hasPrefix("/") { relative.removeFirst() }
            files.append(relative)
        }

        return ProjectManifestPayload(projectName: root.lastPathComponent, files: files.sorted())
    }
}

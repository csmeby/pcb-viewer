import { DragAndDropFileSystem, LocalFileSystemBase } from "../../../web/vendor/kicanvas/src/kicanvas/services/vfs";

export interface OpenedProject {
  projectName: string;
  fileSystem: LocalFileSystemBase;
}

/** Chromium-family only (not Safari/Firefox) -- callers should offer drag-and-drop as a fallback. */
export function isDirectoryPickerSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/**
 * Opens the browser's native folder picker and walks the chosen directory
 * into a flat file map, exactly like `ProjectFileIndexer` did natively --
 * except this can hand the files themselves straight to `LocalFileSystemBase`
 * (the vendored KiCanvas `IFileSystem` implementation backing a plain
 * `Map<string, File>`) with no async fetch-by-path round trip needed, since
 * the browser already gave us real `File` objects up front.
 *
 * Returns null if the user cancels the picker (thrown as an AbortError by
 * showDirectoryPicker) rather than treating that as an error.
 */
export async function pickProjectFolder(): Promise<OpenedProject | null> {
  if (!isDirectoryPickerSupported()) {
    throw new Error("This browser doesn't support the folder picker. Try dragging a project folder onto the window instead.");
  }

  let rootHandle: FileSystemDirectoryHandle;
  try {
    rootHandle = await window.showDirectoryPicker!({ id: "pcb-viewer-project", mode: "read" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    throw error;
  }

  const files = new Map<string, File>();
  await collectFiles(rootHandle, "", files);

  return {
    projectName: rootHandle.name,
    fileSystem: new LocalFileSystemBase(files),
  };
}

async function collectFiles(dir: FileSystemDirectoryHandle, prefix: string, out: Map<string, File>): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) {
      continue;
    }
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      out.set(path, await handle.getFile());
    } else {
      await collectFiles(handle, path, out);
    }
  }
}

/**
 * Fallback for browsers without the File System Access API (notably
 * Safari): builds the same kind of `IFileSystem` from a drop event's
 * `DataTransfer` instead, using KiCanvas's own vendored implementation
 * directly -- no reason to reimplement directory-entry walking twice.
 */
export async function openProjectFromDrop(dataTransfer: DataTransfer): Promise<OpenedProject> {
  const fileSystem = await DragAndDropFileSystem.fromDataTransfer(dataTransfer);
  return { projectName: "Dropped project", fileSystem };
}

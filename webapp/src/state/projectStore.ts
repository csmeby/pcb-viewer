import { create } from "zustand";
import type { IFileSystem } from "../../../web/vendor/kicanvas/src/kicanvas/services/vfs";
import { isDirectoryPickerSupported, openProjectFromDrop, pickProjectFolder } from "../fs/browserFileSystem";
import { nativeBridge } from "../bridge/nativeBridge";
import { NativeProjectFileSystem } from "../fs/nativeProjectFileSystem";

export type ProjectStatus = "empty" | "ready" | "error";

export interface ProjectManifest {
  projectName: string;
  files: string[];
}

interface ProjectState {
  status: ProjectStatus;
  manifest: ProjectManifest | null;
  fileSystem: IFileSystem | null;
  errorMessage: string | null;
  openFolder: () => void;
  openFromDrop: (dataTransfer: DataTransfer) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  status: "empty",
  manifest: null,
  fileSystem: null,
  errorMessage: null,

  openFolder: () => {
    // Running inside the native iOS shell: hand off to the native folder
    // picker (UIDocumentPickerViewController) instead of the browser's --
    // WKWebView doesn't support the File System Access API at all. Native
    // drives the rest of this via the onProjectManifest/onProjectError
    // subscriptions wired below, not a promise here.
    if (nativeBridge.isAvailable()) {
      nativeBridge.pickFolder();
      return;
    }

    if (!isDirectoryPickerSupported()) {
      set({
        status: "error",
        errorMessage: "This browser doesn't support the folder picker. Try dragging a project folder onto the window instead.",
      });
      return;
    }
    pickProjectFolder()
      .then((opened) => {
        if (!opened) {
          // User cancelled the picker -- leave whatever was already open alone.
          return;
        }
        applyOpenedProject(set, opened.projectName, opened.fileSystem);
      })
      .catch((error) => {
        set({ status: "error", errorMessage: error instanceof Error ? error.message : String(error) });
      });
  },

  openFromDrop: (dataTransfer) => {
    openProjectFromDrop(dataTransfer)
      .then((opened) => applyOpenedProject(set, opened.projectName, opened.fileSystem))
      .catch((error) => {
        set({ status: "error", errorMessage: error instanceof Error ? error.message : String(error) });
      });
  },
}));

function applyOpenedProject(set: (state: Partial<ProjectState>) => void, projectName: string, fileSystem: IFileSystem): void {
  const files = [...fileSystem.list()].sort();
  set({
    status: "ready",
    manifest: { projectName, files },
    fileSystem,
    errorMessage: null,
  });
}

// Wired once at module load (not inside a React effect) so a manifest/error
// pushed by native before any component has mounted -- e.g. an auto-reopened
// last project firing right after the "ready" handshake -- isn't missed.
// No-ops forever in a plain browser (nativeBridge never calls these there).
nativeBridge.onProjectManifest((manifest) => {
  if (manifest === null) {
    useProjectStore.setState({ status: "empty", manifest: null, fileSystem: null, errorMessage: null });
    return;
  }
  useProjectStore.setState({
    status: "ready",
    manifest,
    fileSystem: new NativeProjectFileSystem(manifest.files),
    errorMessage: null,
  });
});

nativeBridge.onProjectError((message) => {
  useProjectStore.setState({ status: "error", errorMessage: message });
});

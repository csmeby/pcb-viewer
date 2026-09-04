import type { IFileSystem } from "../../../web/vendor/kicanvas/src/kicanvas/services/vfs";
import { nativeBridge } from "../bridge/nativeBridge";

// Implements the vendored `IFileSystem`, backed by a native URL that serves
// raw file bytes -- deliberately the SAME origin (scheme+host) the app
// itself is served from on each platform, not a separate one. Both WKWebView
// and Android's WebViewAssetLoader treat a different scheme/host as a
// different origin, and this fetch() runs in default CORS mode; a
// cross-origin mismatch here fails every file fetch silently.
//   iOS:     app at pcbapp://local/app/...        -> files at pcbapp://local/project/...
//            (native side: LocalSchemeHandler.swift)
//   Android: app at https://appassets.androidplatform.net/assets/...
//            -> files at https://appassets.androidplatform.net/project/...
//            (native side: ProjectPathHandler.kt)
//
// `list()`/`has()` are answered synchronously from the manifest native
// already pushed over the bridge; `get()` is async/lazy, fetching bytes on
// demand -- exactly the split vfs.ts's interface is shaped for.
export function projectFileURL(relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = nativeBridge.platform() === "android" ? "https://appassets.androidplatform.net/project/" : "pcbapp://local/project/";
  return `${base}${encoded}`;
}

export class NativeProjectFileSystem implements IFileSystem {
  constructor(private readonly manifestFiles: readonly string[]) {}

  async setup(): Promise<void> {
    // Nothing to do -- native already has the project open by the time a
    // manifest exists for us to be constructed from.
  }

  *list(): Generator<string> {
    yield* this.manifestFiles;
  }

  async has(path: string): Promise<boolean> {
    return this.manifestFiles.includes(path);
  }

  async get(path: string): Promise<File> {
    const response = await fetch(projectFileURL(path));
    if (!response.ok) {
      throw new Error(`Failed to fetch project file "${path}": HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return new File([blob], path);
  }

  async download(): Promise<void> {
    throw new Error("download() is not supported for a native-bridged project folder");
  }
}

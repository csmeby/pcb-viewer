// JS <-> native messaging surface. Mirrors ios/PCBViewer/App/WebView/NativeBridge.swift
// and android/app/.../WebAppBridge.kt: on iOS we post to
// window.webkit.messageHandlers.pcbBridge, on Android to
// window.AndroidPcbBridge.postMessage (a JSON string, since WebView's
// addJavascriptInterface only marshals primitives/strings, not objects) --
// either way native calls back into the same window.__pcbviewer.*. Kept
// dependency-free (no React import) so it works identically in a plain
// browser tab during `npm run dev` (where neither bridge is present) and
// inside the real WKWebView/WebView.

export interface NativeMessage {
  type: string;
  payload?: unknown;
  /** Used by "jsError" -- matches the key NativeBridge.swift's "jsError" case reads (`body["message"]`). */
  message?: string;
}

export interface ProjectManifest {
  projectName: string;
  files: string[];
}

type StatusListener = (text: string) => void;
type ManifestListener = (manifest: ProjectManifest | null) => void;
type ErrorListener = (message: string) => void;

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        pcbBridge?: {
          postMessage: (message: unknown) => void;
        };
      };
    };
    __pcbviewer?: {
      onNativeMessage: (text: string) => void;
      onProjectManifest: (manifest: ProjectManifest | null) => void;
      onProjectError: (message: string) => void;
    };
    AndroidPcbBridge?: {
      postMessage: (json: string) => void;
    };
  }
}

const statusListeners = new Set<StatusListener>();
const manifestListeners = new Set<ManifestListener>();
const errorListeners = new Set<ErrorListener>();

window.__pcbviewer = {
  onNativeMessage(text: string) {
    statusListeners.forEach((listener) => listener(text));
  },
  onProjectManifest(manifest: ProjectManifest | null) {
    manifestListeners.forEach((listener) => listener(manifest));
  },
  onProjectError(message: string) {
    errorListeners.forEach((listener) => listener(message));
  },
};

function isAvailable(): boolean {
  return typeof window !== "undefined" && !!(window.webkit?.messageHandlers?.pcbBridge || window.AndroidPcbBridge);
}

/** Which native shell (if any) this page is running inside -- used where a URL/behavior must differ by platform (see nativeProjectFileSystem.ts). */
function platform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") {
    return "web";
  }
  if (window.webkit?.messageHandlers?.pcbBridge) {
    return "ios";
  }
  if (window.AndroidPcbBridge) {
    return "android";
  }
  return "web";
}

function send(message: NativeMessage): void {
  if (typeof window !== "undefined" && window.webkit?.messageHandlers?.pcbBridge) {
    window.webkit.messageHandlers.pcbBridge.postMessage(message);
  } else if (typeof window !== "undefined" && window.AndroidPcbBridge) {
    window.AndroidPcbBridge.postMessage(JSON.stringify(message));
  } else {
    console.warn("[nativeBridge] no native bridge available (running outside WKWebView/WebView)", message);
  }
}

function subscribe<T>(set: Set<(value: T) => void>, listener: (value: T) => void): () => void {
  set.add(listener);
  return () => set.delete(listener);
}

export const nativeBridge = {
  isAvailable,
  platform,
  onMessage: (listener: StatusListener) => subscribe(statusListeners, listener),
  onProjectManifest: (listener: ManifestListener) => subscribe(manifestListeners, listener),
  onProjectError: (listener: ErrorListener) => subscribe(errorListeners, listener),
  send,
  pickFolder: () => send({ type: "pickFolder" }),
};

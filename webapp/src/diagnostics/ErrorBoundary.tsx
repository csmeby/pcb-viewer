import { Component, type ErrorInfo, type ReactNode } from "react";
import { nativeBridge } from "../bridge/nativeBridge";

interface Props {
  /** Shown in the fallback UI and forwarded to native diagnostics, so a crash in one panel is identifiable. */
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an uncaught throw anywhere in the render tree below it
 * unmounts EVERYTHING React was rendering, with no visible trace -- inside
 * the native iOS shell's WKWebView, that's indistinguishable from a plain
 * black screen, with no remote inspector available to see why. This keeps
 * the rest of the app usable when one panel breaks AND forwards what broke
 * to native Diagnostics (see NativeBridge.swift's "jsError" case) in
 * addition to the console, instead of failing silently.
 *
 * One of these wraps the whole app (so a truly unexpected crash still shows
 * something instead of nothing), and one wraps each individual panel (so a
 * crash specific to one panel -- e.g. a KiCad file edge case only a real
 * project hits -- doesn't take down the other three panels with it).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`React crash in "${this.props.label}":`, error, info.componentStack);
    nativeBridge.send({
      type: "jsError",
      message: `React crash in "${this.props.label}": ${error.message}\n${info.componentStack ?? ""}`,
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            color: "var(--danger)",
            fontSize: 13,
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
          }}
        >
          {this.props.label} crashed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

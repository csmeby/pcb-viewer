import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useProjectStore } from "../state/projectStore";
import { BoardViewer } from "../../../web/vendor/kicanvas/src/viewers/board/viewer";
import { KicadPCB } from "../../../web/vendor/kicanvas/src/kicad";
import themes from "../../../web/vendor/kicanvas/src/kicanvas/themes";
import { extractComponentReference, useKiCanvasSelectSync } from "./useKiCanvasSelectSync";
import { BoardLayersPanel } from "./BoardLayersPanel";

/**
 * Thin React wrapper around KiCanvas's (vendored) BoardViewer: React only
 * owns the <canvas> element's lifecycle, the vendored viewer owns everything
 * drawn on it. No React reactivity crosses into the vendored code path.
 */
export function BoardViewerPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { fileSystem, manifest } = useProjectStore();
  const [viewer, setViewer] = useState<BoardViewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fileSystem || !manifest) {
      return;
    }

    setError(null);
    let disposed = false;
    const nextViewer = new BoardViewer(canvas, true, themes.by_name("kicad").board);

    async function run() {
      try {
        await nextViewer.setup();

        const pcbPath = manifest!.files.find((path) => path.endsWith(".kicad_pcb"));
        if (!pcbPath) {
          setError("No .kicad_pcb file found in this project.");
          return;
        }

        const file = await fileSystem!.get(pcbPath);
        const text = await file.text();
        if (disposed) {
          return;
        }

        const board = new KicadPCB(pcbPath, text);
        await nextViewer.load(board);
        if (!disposed) {
          setViewer(nextViewer);
          if (typeof window !== "undefined") {
            window.__pcbviewerDebug = { ...window.__pcbviewerDebug!, boardViewer: nextViewer };
          }
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    run();

    return () => {
      disposed = true;
      setViewer(null);
      nextViewer.dispose();
    };
  }, [fileSystem, manifest]);

  useKiCanvasSelectSync(viewer, "board", extractComponentReference);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      <BoardLayersPanel viewer={viewer} />
      {!fileSystem && (
        <div style={overlayStyle}>Open a project to view its board.</div>
      )}
      {error && <div style={{ ...overlayStyle, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  color: "var(--text-secondary)",
  fontSize: 13,
};

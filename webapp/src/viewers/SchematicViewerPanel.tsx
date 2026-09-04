import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useProjectStore } from "../state/projectStore";
import { SchematicViewer } from "../../../web/vendor/kicanvas/src/viewers/schematic/viewer";
import { KicadSch } from "../../../web/vendor/kicanvas/src/kicad";
import themes from "../../../web/vendor/kicanvas/src/kicanvas/themes";
import { extractComponentReference, useKiCanvasSelectSync } from "./useKiCanvasSelectSync";

/**
 * Thin React wrapper around KiCanvas's (vendored) SchematicViewer -- same
 * pattern as BoardViewerPanel. Only loads the root schematic sheet for now;
 * hierarchical multi-sheet navigation (via the vendored Project class) is a
 * later addition, not required for basic rendering + selection sync.
 */
export function SchematicViewerPanel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { fileSystem, manifest } = useProjectStore();
  const [viewer, setViewer] = useState<SchematicViewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fileSystem || !manifest) {
      return;
    }

    setError(null);
    let disposed = false;
    const nextViewer = new SchematicViewer(canvas, true, themes.by_name("kicad").schematic);

    async function run() {
      try {
        await nextViewer.setup();

        const schPath = manifest!.files.find((path) => path.endsWith(".kicad_sch"));
        if (!schPath) {
          setError("No .kicad_sch file found in this project.");
          return;
        }

        const file = await fileSystem!.get(schPath);
        const text = await file.text();
        if (disposed) {
          return;
        }

        const schematic = new KicadSch(schPath, text);
        await nextViewer.load(schematic);
        if (!disposed) {
          setViewer(nextViewer);
          if (typeof window !== "undefined") {
            window.__pcbviewerDebug = { ...window.__pcbviewerDebug!, schematicViewer: nextViewer };
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

  useKiCanvasSelectSync(viewer, "schematic", extractComponentReference);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={canvasRef} style={canvasStyle} />
      {!fileSystem && (
        <div style={overlayStyle}>Open a project to view its schematic.</div>
      )}
      {error && <div style={{ ...overlayStyle, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

// See BoardViewerPanel.tsx's identical constant for why touchAction: "none" matters here.
const canvasStyle: CSSProperties = { width: "100%", height: "100%", display: "block", touchAction: "none" };

const overlayStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  color: "var(--text-secondary)",
  fontSize: 13,
};

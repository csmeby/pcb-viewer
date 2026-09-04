import { useEffect, useState, type CSSProperties } from "react";
import { PanelLayout } from "./layout/PanelLayout";
import { TopBar } from "./layout/TopBar";
import { BoardViewerPanel } from "./viewers/BoardViewerPanel";
import { Board3DViewerPanel } from "./viewers/Board3DViewerPanel";
import { SchematicViewerPanel } from "./viewers/SchematicViewerPanel";
import { BomPanel } from "./bom/BomPanel";
import { ErrorBoundary } from "./diagnostics/ErrorBoundary";
import { useProjectStore } from "./state/projectStore";
import { nativeBridge } from "./bridge/nativeBridge";

export function App() {
  const openFromDrop = useProjectStore((state) => state.openFromDrop);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    // No-op in a plain browser -- this is what tells the native iOS shell
    // it's safe to push an auto-reopened last project's manifest.
    nativeBridge.send({ type: "ready" });
  }, []);

  return (
    <div
      style={{ height: "100vh", display: "flex", flexDirection: "column" }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) {
          setIsDragOver(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        openFromDrop(event.dataTransfer);
      }}
    >
      <TopBar />
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <PanelLayout
          panels={[
            {
              id: "schematic",
              title: "Schematic",
              noPadding: true,
              content: (
                <ErrorBoundary label="Schematic">
                  <SchematicViewerPanel />
                </ErrorBoundary>
              ),
            },
            {
              id: "pcb",
              title: "PCB",
              noPadding: true,
              content: (
                <ErrorBoundary label="PCB">
                  <BoardViewerPanel />
                </ErrorBoundary>
              ),
            },
            {
              id: "3d",
              title: "3D",
              noPadding: true,
              defaultClosed: true,
              content: (
                <ErrorBoundary label="3D">
                  <Board3DViewerPanel />
                </ErrorBoundary>
              ),
            },
            {
              id: "bom",
              title: "Bill of Materials",
              content: (
                <ErrorBoundary label="BOM">
                  <BomPanel />
                </ErrorBoundary>
              ),
            },
          ]}
        />
        {isDragOver && <div style={dropOverlayStyle}>Drop a KiCad project folder to open it</div>}
      </div>
    </div>
  );
}

const dropOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(11, 13, 12, 0.75)",
  border: "2px dashed var(--accent)",
  color: "var(--text-primary)",
  fontSize: 15,
  fontWeight: 500,
  pointerEvents: "none",
  zIndex: 10,
};

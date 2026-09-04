import { useEffect, useState, type CSSProperties } from "react";
import type { BoardViewer } from "../../../web/vendor/kicanvas/src/viewers/board/viewer";
import type { ViewLayer } from "../../../web/vendor/kicanvas/src/viewers/base/view-layers";
import { LayerNames } from "../../../web/vendor/kicanvas/src/viewers/board/layers";

/**
 * KiCad-style per-layer visibility toggles for the board viewer, floated
 * over the canvas rather than a dedicated resizable column -- this only
 * matters while looking at the PCB, so it doesn't need to permanently claim
 * layout space the way the schematic/board/BOM panels do.
 */
export function BoardLayersPanel({ viewer }: { viewer: BoardViewer | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [layers, setLayers] = useState<ViewLayer[]>([]);
  // Layer visibility is mutated directly on the vendored ViewLayer objects
  // (there's no React state backing it), so this just forces a re-render
  // after each mutation to keep the toggle list in sync with what's drawn.
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    setLayers(viewer ? [...viewer.layers.in_ui_order()] : []);
    setIsOpen(false);
  }, [viewer]);

  if (!viewer || layers.length === 0) {
    return null;
  }

  function redraw() {
    viewer!.draw();
    forceUpdate((n) => n + 1);
  }

  function setLayersVisible(predicate: (layer: ViewLayer) => boolean) {
    for (const layer of layers) {
      layer.visible = predicate(layer);
    }
    redraw();
  }

  return (
    <div style={containerStyle}>
      <button
        type="button"
        className="pcb-icon-button"
        style={toggleButtonStyle}
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Toggle layers panel"
        title="Layers"
      >
        ▤
      </button>
      {isOpen && (
        <div style={panelStyle}>
          <div style={presetsRowStyle}>
            <button className="pcb-button" style={presetButtonStyle} onClick={() => setLayersVisible(() => true)}>
              All
            </button>
            <button className="pcb-button" style={presetButtonStyle} onClick={() => setLayersVisible(() => false)}>
              None
            </button>
            <button
              className="pcb-button"
              style={presetButtonStyle}
              onClick={() => setLayersVisible((l) => l.name.startsWith("F.") || l.name === LayerNames.edge_cuts)}
            >
              Front
            </button>
            <button
              className="pcb-button"
              style={presetButtonStyle}
              onClick={() => setLayersVisible((l) => l.name.startsWith("B.") || l.name === LayerNames.edge_cuts)}
            >
              Back
            </button>
            <button
              className="pcb-button"
              style={presetButtonStyle}
              onClick={() => setLayersVisible((l) => l.name.includes(".Cu") || l.name === LayerNames.edge_cuts)}
            >
              Copper
            </button>
          </div>
          <div style={listStyle}>
            {layers.map((layer) => (
              <button
                key={layer.name}
                type="button"
                className="pcb-layer-row"
                style={{ ...layerRowStyle, opacity: layer.visible ? 1 : 0.45 }}
                onClick={() => {
                  layer.visible = !layer.visible;
                  redraw();
                }}
              >
                <span style={{ ...swatchStyle, background: layer.color.to_css() }} />
                <span style={layerNameStyle}>{layer.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  zIndex: 5,
};

const toggleButtonStyle: CSSProperties = {
  background: "var(--bg-panel)",
  width: 30,
  height: 30,
  fontSize: 15,
};

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 36,
  right: 0,
  width: 200,
  maxHeight: "70vh",
  overflow: "auto",
  background: "var(--bg-panel)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  padding: 10,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
};

const presetsRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border)",
};

const presetButtonStyle: CSSProperties = {
  padding: "3px 8px",
  fontSize: 11,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
};

const layerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "transparent",
  border: "none",
  borderRadius: 5,
  padding: "5px 6px",
  cursor: "pointer",
  color: "var(--text-primary)",
  textAlign: "left",
};

const swatchStyle: CSSProperties = {
  flexShrink: 0,
  width: 11,
  height: 11,
  borderRadius: 2,
};

const layerNameStyle: CSSProperties = {
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

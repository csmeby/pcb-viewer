import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelGroupHandle,
} from "react-resizable-panels";

export interface PanelSpec {
  id: string;
  title: string;
  content: ReactNode;
  defaultSize?: number;
  /** Skip the default body padding -- for content (canvases, 3D views) that should fill edge to edge. */
  noPadding?: boolean;
}

const MIN_SIZE = 12;

/**
 * Horizontal group of resizable panels that can be closed and reopened (a
 * "reopen" bar of buttons for anything currently closed).
 *
 * Every panel stays mounted at all times -- "closed" just means resized to
 * 0% width -- specifically so closing/reopening the schematic or board
 * panel never tears down (and re-parses/re-renders) the vendored KiCanvas
 * viewer living inside it, which is slow on a large board.
 *
 * Closing/opening a panel is done by computing a full new layout ourselves
 * and applying it in one shot via the PanelGroup's imperative `setLayout`,
 * rather than calling a Panel's own `.collapse()`/`.expand()`. Those
 * delegate to react-resizable-panels' internal redistribution algorithm,
 * which (per a known upstream quirk) can push an unrelated sibling panel's
 * size below ITS OWN minSize while redistributing freed/reclaimed space --
 * and since every panel here is collapsible, that reads to the library as
 * "the user collapsed this panel too". That's what caused closing or
 * opening one panel to sometimes close/open another one as a side effect.
 * Computing the target layout ourselves (closing only ever *adds* space to
 * other panels; opening only ever takes space down to exactly their own
 * MIN_SIZE floor, never below) makes that impossible by construction.
 */
export function PanelLayout({ panels }: { panels: PanelSpec[] }) {
  const groupRef = useRef<ImperativePanelGroupHandle>(null);
  const lastOpenSize = useRef<Map<string, number>>(new Map());
  const [closedIds, setClosedIds] = useState<Set<string>>(new Set());

  function currentLayout(): number[] {
    return groupRef.current?.getLayout() ?? panels.map((panel) => panel.defaultSize ?? 100 / panels.length);
  }

  function applyLayout(sizes: number[]) {
    const total = sizes.reduce((sum, size) => sum + size, 0);
    const normalized = total > 0 ? sizes.map((size) => (size / total) * 100) : sizes;
    groupRef.current?.setLayout(normalized);
  }

  function close(id: string) {
    const index = panels.findIndex((panel) => panel.id === id);
    if (index === -1 || closedIds.has(id)) {
      return;
    }

    const sizes = [...currentLayout()];
    const freed = sizes[index] ?? 0;
    lastOpenSize.current.set(id, freed);
    sizes[index] = 0;

    // Give the freed space to every other currently-open panel, proportional
    // to its current size -- growing a panel can never push it below its
    // floor, so this step can never trigger another panel's collapse.
    const openIndices = sizes.map((_, i) => i).filter((i) => i !== index && sizes[i]! > 0);
    const openTotal = openIndices.reduce((sum, i) => sum + sizes[i]!, 0);
    for (const i of openIndices) {
      sizes[i] = sizes[i]! + (sizes[i]! / openTotal) * freed;
    }

    applyLayout(sizes);
    setClosedIds((prev) => new Set(prev).add(id));
  }

  function open(id: string) {
    const index = panels.findIndex((panel) => panel.id === id);
    if (index === -1 || !closedIds.has(id)) {
      return;
    }

    const sizes = [...currentLayout()];
    const desired = Math.max(lastOpenSize.current.get(id) ?? 100 / panels.length, MIN_SIZE);

    // Only ever take space down to each other panel's own floor, split
    // proportionally to how much slack each currently has -- so no other
    // panel can be pushed below MIN_SIZE (and thus can't look "collapsed").
    const otherIndices = panels.map((_, i) => i).filter((i) => i !== index);
    const slack = otherIndices.map((i) => Math.max(sizes[i]! - MIN_SIZE, 0));
    const totalSlack = slack.reduce((sum, s) => sum + s, 0);
    const toTake = Math.min(desired, totalSlack);

    if (totalSlack > 0) {
      otherIndices.forEach((i, k) => {
        sizes[i] = sizes[i]! - (slack[k]! / totalSlack) * toTake;
      });
    }
    sizes[index] = toTake;

    applyLayout(sizes);
    setClosedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-app)" }}>
      {closedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 12px",
            background: "var(--bg-panel-header)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {panels
            .filter((panel) => closedIds.has(panel.id))
            .map((panel) => (
              <button key={panel.id} className="pcb-button" onClick={() => open(panel.id)}>
                + {panel.title}
              </button>
            ))}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <PanelGroup direction="horizontal" ref={groupRef}>
          {panels.map((panel, index) => (
            <Fragment key={panel.id}>
              {index > 0 && (
                <PanelResizeHandle style={resizeHandleStyle}>
                  <div style={resizeGripStyle} />
                </PanelResizeHandle>
              )}
              <Panel
                id={panel.id}
                defaultSize={panel.defaultSize ?? 100 / panels.length}
                minSize={MIN_SIZE}
                collapsible
                collapsedSize={0}
              >
                <div style={panelStyle}>
                  <div className="pcb-panel-header">
                    <span className="pcb-panel-title">{panel.title}</span>
                    <button
                      className="pcb-icon-button"
                      aria-label={`Close ${panel.title}`}
                      onClick={() => close(panel.id)}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={panel.noPadding ? panelBodyNoPaddingStyle : panelBodyStyle}>{panel.content}</div>
                </div>
              </Panel>
            </Fragment>
          ))}
        </PanelGroup>
      </div>
    </div>
  );
}

// Wider than it looks (a bigger touch target than the visible line) --
// on a touchscreen a 1px hairline is effectively ungrabbable with a finger.
const resizeHandleStyle: CSSProperties = {
  width: 12,
  marginLeft: -6,
  marginRight: -6,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "col-resize",
};

const resizeGripStyle: CSSProperties = {
  width: 3,
  height: 36,
  borderRadius: 2,
  background: "var(--border-strong)",
};

const panelStyle: CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-panel)",
  borderRight: "1px solid var(--border)",
};

const panelBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: 14,
  color: "var(--text-primary)",
  fontSize: 13.5,
};

const panelBodyNoPaddingStyle: CSSProperties = {
  ...panelBodyStyle,
  padding: 0,
  overflow: "hidden",
};

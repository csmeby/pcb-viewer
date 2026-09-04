import type { CSSProperties } from "react";
import { useProjectStore } from "../state/projectStore";

/**
 * Replaces the old file-list/preview sidebar panel -- there's no real use
 * for browsing raw file contents once the actual viewers (schematic/board/
 * BOM) exist, so the project panel's only remaining job (open a project,
 * show its name/errors) lives in a slim top bar instead, leaving the full
 * window height for the viewers.
 */
export function TopBar() {
  const { status, manifest, errorMessage, openFolder } = useProjectStore();

  return (
    <div style={barStyle}>
      <button className="pcb-button pcb-button--primary" onClick={openFolder}>
        Open Project…
      </button>
      <span style={titleStyle}>PCB Viewer</span>
      <div style={statusStyle}>
        {status === "ready" && manifest && <span style={projectNameStyle}>{manifest.projectName}</span>}
        {status === "empty" && <span style={emptyHintStyle}>No project open — pick a folder, or drag one anywhere onto the window.</span>}
        {status === "error" && errorMessage && <span style={errorStyle}>{errorMessage}</span>}
      </div>
    </div>
  );
}

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "10px 14px",
  background: "var(--bg-panel-header)",
  borderBottom: "1px solid var(--border)",
  flexShrink: 0,
};

const titleStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

const statusStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textAlign: "right",
  fontSize: 13,
};

const projectNameStyle: CSSProperties = {
  color: "var(--text-primary)",
  fontWeight: 500,
};

const emptyHintStyle: CSSProperties = {
  color: "var(--text-muted)",
};

const errorStyle: CSSProperties = {
  color: "var(--danger)",
};

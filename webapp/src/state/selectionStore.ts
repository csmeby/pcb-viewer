import { create } from "zustand";

export type SelectionSource = "schematic" | "board" | "bom";

interface SelectionState {
  /** Reference designator (e.g. "R14") of the currently selected component, or null for none. */
  reference: string | null;
  /** Which panel most recently produced this selection -- lets each panel avoid re-selecting itself. */
  source: SelectionSource | null;
  select: (reference: string | null, source: SelectionSource) => void;
}

// Cross-domain sync key is the reference designator string, not the raw
// KiCanvas model object: the schematic viewer's KicadSch and the board
// viewer's KicadPCB are separate parsed documents with no shared object
// identity, but both Footprint and SchematicSymbol expose the same
// `.reference` getter, and both viewers' `select()` methods accept a
// reference-designator string directly.
export const useSelectionStore = create<SelectionState>((set) => ({
  reference: null,
  source: null,
  select: (reference, source) => set({ reference, source }),
}));

export interface PcbViewerDebugHooks {
  selectionStore: typeof useSelectionStore;
  /** Set by each viewer panel once its vendored KiCanvas Viewer is loaded. */
  schematicViewer?: unknown;
  boardViewer?: unknown;
}

declare global {
  interface Window {
    __pcbviewerDebug?: PcbViewerDebugHooks;
  }
}

// Dev/debug aid only (harmless in production): lets an external driver --
// or a developer's own console -- inspect/trigger selection without needing
// a UI element wired up for it yet.
if (typeof window !== "undefined") {
  window.__pcbviewerDebug = { selectionStore: useSelectionStore };
}

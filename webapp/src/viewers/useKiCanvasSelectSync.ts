import { useEffect } from "react";
import { useSelectionStore, type SelectionSource } from "../state/selectionStore";
import type { Viewer } from "../../../web/vendor/kicanvas/src/viewers/base/viewer";

/**
 * BoardViewer/SchematicViewer both override `select()` to additionally
 * accept a reference-designator/uuid string (the base Viewer's `select()` is
 * typed narrowly as `BBox | null`), which is exactly what this hook needs --
 * expressed structurally so it works with either concrete viewer type
 * without this file depending on both.
 */
type SelectSyncableViewer = Pick<Viewer, "addEventListener" | "removeEventListener" | "zoom_to_selection"> & {
  select(item: string | null): void;
};

/**
 * Wires a vendored KiCanvas Viewer instance into the shared selectionStore,
 * both directions: a click inside this viewer publishes its reference
 * designator to the store, and a selection published by any OTHER panel
 * (schematic, board, or BOM) is applied back onto this viewer via its own
 * `select(reference)`. The `source` guard is what stops a panel from
 * re-selecting (and re-dispatching an event for) the click it just made.
 */
export function useKiCanvasSelectSync(
  viewer: SelectSyncableViewer | null,
  panelId: SelectionSource,
  extractReference: (item: unknown) => string | null,
) {
  useEffect(() => {
    if (!viewer) {
      return;
    }

    // Viewer.select() dispatches "kicanvas:select" unconditionally, whether
    // the selection came from a user click or from us calling select()
    // programmatically below to apply another panel's selection. Without
    // this guard, applying an external selection makes this panel's own
    // listener immediately re-publish it as if it had originated here,
    // relabeling its `source` and defeating the other panels' same guard.
    let applyingExternalSelection = false;

    function handleSelect(event: Event) {
      if (applyingExternalSelection) {
        return;
      }
      const detail = (event as CustomEvent<{ item: unknown }>).detail;
      const reference = extractReference(detail.item);
      if (reference) {
        useSelectionStore.getState().select(reference, panelId);
      }
    }

    function applyExternalSelection(reference: string | null) {
      applyingExternalSelection = true;
      try {
        viewer!.select(reference);
        // Pan/zoom to whatever another panel (schematic, board, or BOM)
        // just selected, so clicking a BOM row (or a component in the other
        // viewer) brings the component into view here instead of leaving
        // the user to hunt for the highlight themselves.
        if (reference) {
          viewer!.zoom_to_selection();
        }
      } finally {
        applyingExternalSelection = false;
      }
    }

    viewer.addEventListener("kicanvas:select", handleSelect);

    // Apply whatever's already selected (from another panel) at mount time,
    // not just future changes.
    const initial = useSelectionStore.getState();
    if (initial.source !== panelId) {
      applyExternalSelection(initial.reference);
    }

    const unsubscribe = useSelectionStore.subscribe((state, previous) => {
      if (state.source === panelId) {
        return;
      }
      if (state.reference === previous.reference) {
        return;
      }
      applyExternalSelection(state.reference);
    });

    return () => {
      viewer.removeEventListener("kicanvas:select", handleSelect);
      unsubscribe();
    };
  }, [viewer, panelId, extractReference]);
}

/** Shared by both viewer panels: Footprint and SchematicSymbol both expose `.reference`. */
export function extractComponentReference(item: unknown): string | null {
  if (item && typeof item === "object" && "reference" in item) {
    const reference = (item as { reference?: unknown }).reference;
    return typeof reference === "string" ? reference : null;
  }
  return null;
}

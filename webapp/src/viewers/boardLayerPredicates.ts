import type { ViewLayer } from "../../../web/vendor/kicanvas/src/viewers/base/view-layers";
import { LayerNames } from "../../../web/vendor/kicanvas/src/viewers/board/layers";

/** Shared with BoardLayersPanel.tsx's "Front"/"Back" preset buttons -- also used to build the top/bottom textures for the 3D board slab (see viewers/board3d/renderLayerTexture.ts). */
export const isFrontLayer = (layer: ViewLayer): boolean => layer.name.startsWith("F.") || layer.name === LayerNames.edge_cuts;
export const isBackLayer = (layer: ViewLayer): boolean => layer.name.startsWith("B.") || layer.name === LayerNames.edge_cuts;

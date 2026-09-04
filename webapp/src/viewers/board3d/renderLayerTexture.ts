import * as THREE from "three";
import { BBox } from "../../../../web/vendor/kicanvas/src/base/math";
import { BoardViewer } from "../../../../web/vendor/kicanvas/src/viewers/board/viewer";
import type { KicadPCB } from "../../../../web/vendor/kicanvas/src/kicad/board";
import type { ViewLayer } from "../../../../web/vendor/kicanvas/src/viewers/base/view-layers";
import type { BoardTheme } from "../../../../web/vendor/kicanvas/src/kicad";
import type { BoardOutline } from "./edgeCutsToShape";

const TARGET_LONG_EDGE_PX = 1024;

/**
 * Renders the board's front and back faces through a single offscreen
 * BoardViewer (the same vendored 2D renderer the PCB panel uses), toggling
 * layer visibility between the two passes, and hands back each as an
 * independent THREE.CanvasTexture -- this is how the 3D slab gets real
 * copper/silkscreen/soldermask detail on its top/bottom faces without
 * reimplementing that rendering for 3D.
 *
 * Deliberately ONE BoardViewer/WebGL context for both passes, not one each
 * -- multiple instances alongside each other corrupted shared state in the
 * vendored renderer/shader setup in testing. Each pass's pixels are copied
 * out to their own plain 2D canvas (via drawImage) immediately after
 * drawing, since reusing one GL canvas across both textures would otherwise
 * leave them both showing whichever pass drew last.
 *
 * The offscreen canvas's CSS size is set to the board outline's own aspect
 * ratio (not a fixed square) and the camera is framed to the outline's exact
 * bbox (no margin) so the render fills the canvas edge-to-edge -- required
 * for the plain 0..1 UV mapping buildBoardMesh.ts uses to line up correctly.
 */
export async function renderFrontAndBackTextures(
  board: KicadPCB,
  outline: BoardOutline,
  theme: BoardTheme,
  isFrontLayer: (layer: ViewLayer) => boolean,
  isBackLayer: (layer: ViewLayer) => boolean,
): Promise<{ front: THREE.CanvasTexture; back: THREE.CanvasTexture }> {
  const width = outline.maxX - outline.minX;
  const height = outline.maxY - outline.minY;
  const aspect = width / height;
  const pixelWidth = aspect >= 1 ? TARGET_LONG_EDGE_PX : Math.round(TARGET_LONG_EDGE_PX * aspect);
  const pixelHeight = aspect >= 1 ? Math.round(TARGET_LONG_EDGE_PX / aspect) : TARGET_LONG_EDGE_PX;

  const canvas = document.createElement("canvas");
  // Off-DOM canvases report a 0x0 getBoundingClientRect (which the vendored
  // WebGL2Renderer sizes itself from), so this has to actually be laid out
  // -- kept within normal viewport bounds and hidden via opacity rather than
  // positioned far off-screen, which is invisible enough for our purposes
  // without relying on any particular engine's culling behavior for
  // extremely-offset elements.
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.opacity = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "-1";
  canvas.style.width = `${pixelWidth}px`;
  canvas.style.height = `${pixelHeight}px`;
  document.body.appendChild(canvas);

  try {
    const viewer = new BoardViewer(canvas, false, theme);
    try {
      await viewer.setup();
      // viewer.layers doesn't exist until load() -> paint() creates it
      // (DocumentViewer.paint()), so visibility can only be set after this.
      await viewer.load(board);
      // load() also kicks off its own async zoom-to-page + draw internally
      // (not awaited by load() itself -- see DocumentViewer.load()), which
      // resolves `viewer.loaded` once done -- wait for it before framing our
      // own camera below, rather than racing it.
      await viewer.loaded;
      viewer.viewport.camera.bbox = new BBox(outline.minX, outline.minY, width, height);

      // Viewer.draw() (viewers/base/viewer.ts) doesn't render synchronously
      // -- it just schedules the actual paint via requestAnimationFrame and
      // returns immediately. Reading the canvas (or disposing the viewer)
      // right after calling draw() raced that scheduled frame: the
      // dispose() below ran first, nulling the renderer's GL context, and
      // the deferred paint then threw "Uncaught Error: Uninitialized" when
      // *it* finally ran a frame later. Waiting a frame ourselves after each
      // draw() call -- queued right behind draw()'s own rAF callback, so it
      // resolves after that callback has actually run -- fixes both the
      // crash and would otherwise have also meant snapshotting a stale/blank
      // canvas before the real content was ever painted.
      const front = await drawAndSnapshot(viewer, canvas, isFrontLayer);
      const back = await drawAndSnapshot(viewer, canvas, isBackLayer);
      return { front, back };
    } finally {
      viewer.dispose();
    }
  } finally {
    canvas.remove();
  }
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function drawAndSnapshot(
  viewer: BoardViewer,
  canvas: HTMLCanvasElement,
  layerPredicate: (layer: ViewLayer) => boolean,
): Promise<THREE.CanvasTexture> {
  for (const layer of viewer.layers.in_ui_order()) {
    layer.visible = layerPredicate(layer);
  }
  viewer.draw();
  await nextAnimationFrame();

  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext("2d")!.drawImage(canvas, 0, 0);

  const texture = new THREE.CanvasTexture(snapshot);
  texture.colorSpace = THREE.SRGBColorSpace;
  // buildBoardMesh.ts's UV generator maps v=0 to the board outline's minY
  // (the top of the rendered canvas, row 0) directly -- flipY's default
  // (true) would sample from the bottom row instead and mirror the result
  // vertically.
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

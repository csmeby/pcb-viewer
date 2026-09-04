import * as THREE from "three";
import type { KicadPCB } from "../../../../web/vendor/kicanvas/src/kicad/board";
import type { BoardTheme } from "../../../../web/vendor/kicanvas/src/kicad";
import { edgeCutsToShape, type BoardOutline } from "./edgeCutsToShape";
import { renderFrontAndBackTextures } from "./renderLayerTexture";
import { isFrontLayer, isBackLayer } from "../boardLayerPredicates";

/** mm -> scene units. 1:1 -- there's nothing else in the scene to be consistent with, so real millimeters is the simplest choice. */
const MM = 1;

/**
 * Builds the extruded 3D board slab: true thickness (KicadPCB.general.thickness,
 * default 1.6mm), with the top/bottom faces textured from the existing 2D
 * renderer's own front/back render (see renderLayerTexture.ts) so real
 * copper/silkscreen/soldermask detail shows up in 3D, and the side walls
 * colored from the board theme's edge_cuts color.
 *
 * No component models yet (Phase A) -- see the 3D-viewer plan for the
 * project-bundled and network-fetched-standard-library follow-up phases.
 */
export async function buildBoardMesh(board: KicadPCB, theme: BoardTheme): Promise<THREE.Group> {
  const outline = edgeCutsToShape(board) ?? rectangleFallback(board);
  const thickness = (board.general?.thickness ?? 1.6) * MM;

  const { front: topTexture, back: bottomTexture } = await renderFrontAndBackTextures(
    board,
    outline,
    theme,
    isFrontLayer,
    isBackLayer,
  );

  const uvGenerator: THREE.ExtrudeGeometryOptions["UVGenerator"] = {
    generateTopUV(_geometry, vertices, indexA, indexB, indexC) {
      return [indexA, indexB, indexC].map((i) => worldToUV(vertices[i * 3]!, vertices[i * 3 + 1]!, outline));
    },
    generateSideWallUV(_geometry, vertices, indexA, indexB, indexC, indexD) {
      // Side walls get the plain board-edge color (a Color, not a texture),
      // so the UVs here don't need to mean anything -- just return something
      // in-range.
      return [indexA, indexB, indexC, indexD].map(() => new THREE.Vector2(0, 0));
    },
  };

  const geometry = new THREE.ExtrudeGeometry(outline.shape, {
    depth: thickness,
    bevelEnabled: false,
    steps: 1,
    UVGenerator: uvGenerator,
  });

  // ExtrudeGeometry (bevelEnabled: false) emits exactly two groups: group 0
  // is EVERY cap triangle (bottom half first, top half second, equal
  // counts), group 1 is the side walls. Split group 0 in half so the top and
  // bottom faces can each get their own texture/material.
  const capGroup = geometry.groups.find((g) => g.materialIndex === 0);
  const sideGroup = geometry.groups.find((g) => g.materialIndex === 1);
  if (!capGroup || !sideGroup) {
    throw new Error("Unexpected ExtrudeGeometry group layout -- three.js internals may have changed.");
  }
  const halfCount = capGroup.count / 2;
  geometry.groups = [
    { start: capGroup.start, count: halfCount, materialIndex: 0 }, // bottom cap
    { start: capGroup.start + halfCount, count: halfCount, materialIndex: 1 }, // top cap
    { start: sideGroup.start, count: sideGroup.count, materialIndex: 2 }, // side walls
  ];

  const edgeColor = new THREE.Color(theme.edge_cuts.to_css());
  const bottomMaterial = new THREE.MeshStandardMaterial({ map: bottomTexture, roughness: 0.8 });
  const topMaterial = new THREE.MeshStandardMaterial({ map: topTexture, roughness: 0.8 });
  const sideMaterial = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.9 });

  const mesh = new THREE.Mesh(geometry, [bottomMaterial, topMaterial, sideMaterial]);
  // Board space is X-right/Y-down (screen-like, matching the 2D viewer);
  // three.js is X-right/Y-up/Z-toward-viewer by convention for OrbitControls'
  // default up vector, so rotate into that instead of fighting the camera.
  mesh.rotation.x = -Math.PI / 2;

  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

function worldToUV(x: number, y: number, outline: BoardOutline): THREE.Vector2 {
  const u = (x - outline.minX) / (outline.maxX - outline.minX || 1);
  const v = (y - outline.minY) / (outline.maxY - outline.minY || 1);
  return new THREE.Vector2(u, v);
}

function rectangleFallback(board: KicadPCB): BoardOutline {
  const bbox = board.edge_cuts_bbox;
  const shape = new THREE.Shape([
    new THREE.Vector2(bbox.x, bbox.y),
    new THREE.Vector2(bbox.x + bbox.w, bbox.y),
    new THREE.Vector2(bbox.x + bbox.w, bbox.y + bbox.h),
    new THREE.Vector2(bbox.x, bbox.y + bbox.h),
  ]);
  return { shape, minX: bbox.x, maxX: bbox.x + bbox.w, minY: bbox.y, maxY: bbox.y + bbox.h };
}

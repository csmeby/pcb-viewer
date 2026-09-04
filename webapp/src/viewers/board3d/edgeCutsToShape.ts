import * as THREE from "three";
import { Vec2 } from "../../../../web/vendor/kicanvas/src/base/math";
import {
  GrArc,
  GrLine,
  GrPoly,
  GrRect,
  type Drawing,
  type KicadPCB,
} from "../../../../web/vendor/kicanvas/src/kicad/board";

export interface BoardOutline {
  shape: THREE.Shape;
  /** mm, matching the board file's own coordinate space -- used to frame the offscreen 2D camera and to build UVs that line up with it (see renderLayerTexture.ts / buildBoardMesh.ts). */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Edge {
  a: Vec2;
  b: Vec2;
}

/**
 * Turns the board's Edge.Cuts drawings into a closed THREE.Shape (with holes
 * for any additional closed loops, e.g. board cutouts) by chaining line/arc/
 * rect/poly segments together at matching endpoints. Real-world board files
 * aren't guaranteed to produce one clean closed loop (gaps, stray geometry) --
 * returns null in that case so the caller can fall back to a simple
 * rectangle from KicadPCB.edge_cuts_bbox instead of crashing.
 */
export function edgeCutsToShape(board: KicadPCB): BoardOutline | null {
  const edges: Edge[] = [];
  for (const item of board.drawings) {
    if (item.layer !== "Edge.Cuts") continue;
    edges.push(...drawingToEdges(item));
  }

  const loops = findClosedLoops(edges);
  if (loops.length === 0) {
    return null;
  }

  // Outer boundary = the loop with the largest bounding-box area; any other
  // closed loops (cutouts, mounting-hole slots drawn as their own loop) become holes.
  loops.sort((a, b) => loopArea(b) - loopArea(a));
  const [outer, ...holes] = loops;

  const shape = new THREE.Shape(outer!.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const hole of holes) {
    shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y))));
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of outer!) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  return { shape, minX, maxX, minY, maxY };
}

function drawingToEdges(item: Drawing): Edge[] {
  if (item instanceof GrLine) {
    return [{ a: item.start, b: item.end }];
  }
  if (item instanceof GrArc) {
    return polylineToEdges(item.arc.to_polyline());
  }
  if (item instanceof GrRect) {
    const { start, end } = item;
    const corners = [start, new Vec2(end.x, start.y), end, new Vec2(start.x, end.y)];
    return polylineToEdges([...corners, start]);
  }
  if (item instanceof GrPoly) {
    const pts = item.polyline;
    if (pts.length < 2) return [];
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const alreadyClosed = key(first) === key(last);
    const closed = alreadyClosed ? pts : [...pts, first];
    return polylineToEdges(closed);
  }
  // GrCircle, GrText, Dimension: not part of a chainable outline path.
  return [];
}

function polylineToEdges(pts: Vec2[]): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    edges.push({ a: pts[i]!, b: pts[i + 1]! });
  }
  return edges;
}

/** Quantized to 1 micron (0.001mm) so segments meant to connect match despite float rounding. */
function key(v: Vec2): string {
  return `${Math.round(v.x * 1000)},${Math.round(v.y * 1000)}`;
}

function findClosedLoops(edges: Edge[]): Vec2[][] {
  const used = new Array(edges.length).fill(false);
  const byPoint = new Map<string, number[]>();
  for (let i = 0; i < edges.length; i++) {
    for (const p of [edges[i]!.a, edges[i]!.b]) {
      const k = key(p);
      const list = byPoint.get(k);
      if (list) list.push(i);
      else byPoint.set(k, [i]);
    }
  }

  const loops: Vec2[][] = [];

  for (let startIdx = 0; startIdx < edges.length; startIdx++) {
    if (used[startIdx]) continue;

    const startPoint = edges[startIdx]!.a;
    const loop: Vec2[] = [startPoint];
    let current = edges[startIdx]!.b;
    used[startIdx] = true;
    let closed = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (key(current) === key(startPoint)) {
        closed = true;
        break;
      }
      const candidates = byPoint.get(key(current)) ?? [];
      const nextIdx = candidates.find((i) => !used[i]);
      if (nextIdx === undefined) break; // dead end -- not a closed loop

      used[nextIdx] = true;
      const edge = edges[nextIdx]!;
      const next = key(edge.a) === key(current) ? edge.b : edge.a;
      loop.push(current);
      current = next;
    }

    if (closed && loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function loopArea(loop: Vec2[]): number {
  // Shoelace formula -- sign doesn't matter here, only magnitude for ranking outer vs. holes.
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const p1 = loop[i]!;
    const p2 = loop[(i + 1) % loop.length]!;
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area / 2);
}

import * as THREE from "three";
import type { KicadPCB, Footprint, Model } from "../../../../web/vendor/kicanvas/src/kicad/board";
import type { IFileSystem } from "../../../../web/vendor/kicanvas/src/kicanvas/services/vfs";
import { resolveModelSource, type ModelSource } from "./resolveModelSource";
import { getModelBytes } from "./modelCache";
import { parseStepFile } from "./occtLoader";

const PLACEHOLDER_HEIGHT_MM = 2;
const PLACEHOLDER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x808080,
  transparent: true,
  opacity: 0.45,
  roughness: 0.8,
});

/**
 * Places every footprint's 3D model(s) on the board, matching KiCad
 * desktop's own 3D Viewer's placement exactly -- but expressed in *this*
 * codebase's board-space convention, not copied verbatim from KiCad's.
 *
 * KiCad's own source (3d-viewer/3d_rendering/opengl/render_3d_opengl.cpp)
 * computes, in ITS OWN 3D world basis:
 *   footprintWorld = Translate(pos.x, -pos.y, zpos) * RotateZ(at.rotation) * [B.Cu: RotateX(180)]
 *   modelWorld = footprintWorld * Translate(offset) * RotateZ(-rot.z) * RotateY(-rot.y) * RotateX(-rot.x) * Scale(scale)
 * Note the negated Y translate and the asymmetric negated model rotation --
 * that's KiCad converting its own board-Y-down file convention into ITS OWN
 * reflected (mirrored) 3D world basis for its own camera setup.
 *
 * buildBoardMesh.ts's slab, by contrast, uses *raw, unreflected* board-space
 * (built directly from the file's own X/Y, Z = 0..thickness) and applies ONE
 * shared rotation at the very end to reach three.js scene space (see the
 * comment on the returned group in buildBoardMesh.ts). Feeding KiCad's own
 * (reflected) coordinates through that same shared rotation would mirror
 * every component relative to the board. So this file instead uses the
 * *conjugate* of KiCad's transform by the Y-reflection it applies (i.e. the
 * equivalent operations in an unreflected frame) -- worked out by hand via
 * matrix conjugation (a Y-reflection negates the angle of any X or Z
 * rotation conjugated through it, leaves Y rotations and translations'
 * non-Y components unchanged, and only flips the sign of Y components):
 *
 *   footprintWorld = Translate(pos.x, pos.y, zpos)
 *                   * RotateZ(-at.rotation)             // negated (vs. KiCad's un-negated)
 *                   * [ if B.Cu: RotateX(180deg) ]        // unchanged -- self-inverse at 180deg
 *   modelWorld = footprintWorld
 *              * Translate(offset.x, -offset.y, offset.z) // Y component negated
 *              * RotateZ(model.rotate.z)                  // sign flipped vs. KiCad (double negation)
 *              * RotateY(-model.rotate.y)                  // unchanged (rotating about the
 *              *                                            //   reflected axis itself)
 *              * RotateX(model.rotate.x)                  // sign flipped vs. KiCad
 *              * Scale(model.scale.xyz)                   // unchanged (diagonal, commutes)
 *
 * Verify against KiCad's own 3D viewer on a real board if component
 * orientation ever looks suspect -- this was derived by hand, not lifted
 * from a reference implementation.
 *
 * Models are resolved (resolveModelSource.ts), fetched/cached (modelCache.ts,
 * covers both project-local and network-fetched-from-GitLab sources
 * uniformly), and parsed (occtLoader.ts, STEP only -- KiCad's library is now
 * almost entirely STEP, .wrl is legacy/deprecated upstream and out of scope
 * here). Anything unresolvable, unfetchable, or unparseable renders as a
 * plain translucent box sized to the footprint's own courtyard bbox instead
 * of leaving a silent gap.
 *
 * Parsed geometry is cached and cloned per footprint instance (most boards
 * repeat the same resistor/cap/connector model many times over) -- both to
 * avoid redundant network fetches and because STEP parsing runs on the main
 * thread (occt-import-js's own primary supported usage pattern) and is not
 * cheap to repeat.
 */
export async function placeFootprintModels(
  board: KicadPCB,
  thickness: number,
  fileSystem: IFileSystem,
  onProgress?: (done: number, total: number) => void,
): Promise<THREE.Group> {
  const group = new THREE.Group();
  const templates = new Map<string, THREE.Group | null>();

  const instances = board.footprints.flatMap((footprint) =>
    footprint.models.filter((model) => !model.hide).map((model) => ({ footprint, model })),
  );

  let done = 0;
  for (const { footprint, model } of instances) {
    const zpos = footprint.layer === "B.Cu" ? 0 : thickness;

    let template = templates.get(model.filename);
    if (template === undefined) {
      template = await buildTemplate(model, fileSystem);
      templates.set(model.filename, template);
    }

    if (template) {
      const instance = template.clone(true);
      instance.name = `${footprint.reference}:${model.filename}`;
      instance.applyMatrix4(buildModelMatrix(footprint, model, zpos));
      group.add(instance);
    } else {
      const placeholder = buildPlaceholder(footprint, thickness);
      placeholder.name = `${footprint.reference}:placeholder`;
      group.add(placeholder);
    }

    done += 1;
    onProgress?.(done, instances.length);
  }

  return group;
}

async function buildTemplate(model: Model, fileSystem: IFileSystem): Promise<THREE.Group | null> {
  // Every failure mode here (unresolvable path, missing local file, network
  // error, non-2xx HTTP status, corrupt/unparseable STEP data) must fall
  // back to a placeholder for just this one model, never propagate out and
  // fail the whole board -- a single missing/unreachable part (very common:
  // offline use, an unmapped custom library path, a 404) shouldn't blank
  // out everything else that DID resolve.
  try {
    const lower = model.filename.toLowerCase();
    if (!lower.endsWith(".step") && !lower.endsWith(".stp")) {
      // .wrl and anything else: not supported -- see the file-level comment.
      return null;
    }

    const source = resolveModelSource(model.filename);
    const bytes = await getBytesForSource(source, fileSystem);
    if (!bytes) {
      return null;
    }

    const meshes = await parseStepFile(new Uint8Array(bytes));
    const group = new THREE.Group();
    for (const { geometry, color } of meshes) {
      const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
      group.add(new THREE.Mesh(geometry, material));
    }
    return group;
  } catch (err) {
    // Not a bug report -- expected in normal offline/no-match use (missing
    // network, an unmapped custom library path, a 404 for a since-renamed
    // part). Logged (not surfaced in the UI) so a genuinely wrong/missing
    // component is diagnosable without spamming the panel with per-part errors.
    // eslint-disable-next-line no-console
    console.warn("[3d] Falling back to a placeholder box for", model.filename, "--", err instanceof Error ? err.message : err);
    return null;
  }
}

async function getBytesForSource(source: ModelSource, fileSystem: IFileSystem): Promise<ArrayBuffer | null> {
  if (source.type === "unresolvable") {
    return null;
  }

  if (source.type === "local") {
    if (!(await fileSystem.has(source.path))) {
      return null;
    }
    return getModelBytes(`local:${source.path}`, async () => {
      const file = await fileSystem.get(source.path);
      return file.arrayBuffer();
    });
  }

  return getModelBytes(source.url, async () => {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch model: HTTP ${response.status}`);
    }
    return response.arrayBuffer();
  });
}

function buildModelMatrix(footprint: Footprint, model: Model, zpos: number): THREE.Matrix4 {
  const [ox, oy, oz] = model.offset.xyz;
  const [rx, ry, rz] = model.rotate.xyz;
  const [sx, sy, sz] = model.scale.xyz;

  const m = new THREE.Matrix4();
  m.multiply(new THREE.Matrix4().makeTranslation(footprint.at.position.x, footprint.at.position.y, zpos));
  m.multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(-footprint.at.rotation)));
  if (footprint.layer === "B.Cu") {
    m.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
  }
  m.multiply(new THREE.Matrix4().makeTranslation(ox ?? 0, -(oy ?? 0), oz ?? 0));
  m.multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(rz ?? 0)));
  m.multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(-(ry ?? 0))));
  m.multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(rx ?? 0)));
  m.multiply(new THREE.Matrix4().makeScale(sx ?? 1, sy ?? 1, sz ?? 1));
  return m;
}

function buildPlaceholder(footprint: Footprint, thickness: number): THREE.Mesh {
  const bbox = footprint.bbox;
  const geometry = new THREE.BoxGeometry(bbox.w || 1, bbox.h || 1, PLACEHOLDER_HEIGHT_MM);
  const mesh = new THREE.Mesh(geometry, PLACEHOLDER_MATERIAL);
  const centerX = bbox.x + bbox.w / 2;
  const centerY = bbox.y + bbox.h / 2;
  const zCenter = footprint.layer === "B.Cu" ? -PLACEHOLDER_HEIGHT_MM / 2 : thickness + PLACEHOLDER_HEIGHT_MM / 2;
  // Raw board-space (unreflected) -- see the file-level comment on
  // buildModelMatrix for why this codebase doesn't use KiCad's own
  // Y-negated world convention.
  mesh.position.set(centerX, centerY, zCenter);
  return mesh;
}

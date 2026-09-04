import * as THREE from "three";
import occtimportjs from "occt-import-js";
// Vite can't statically locate occt-import-js's own runtime string-concat
// wasm lookup (it's plain Emscripten `scriptDirectory + path`, not a static
// import it can rehome into dist/assets) -- resolve the URL ourselves and
// hand it back via `locateFile` instead.
import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";

export interface ParsedMesh {
  geometry: THREE.BufferGeometry;
  color: THREE.Color;
}

const DEFAULT_COLOR = new THREE.Color(0x999999);

let occtPromise: ReturnType<typeof occtimportjs> | null = null;

function getOcct() {
  occtPromise ??= occtimportjs({
    locateFile: (path) => (path.endsWith(".wasm") ? wasmUrl : path),
  });
  return occtPromise;
}

/** Parses STEP file bytes into plain three.js geometries -- one per mesh in the model, each with its own color if the file specifies one. */
export async function parseStepFile(bytes: Uint8Array): Promise<ParsedMesh[]> {
  const occt = await getOcct();
  const result = occt.ReadStepFile(bytes, null);
  if (!result.success) {
    throw new Error("Failed to parse STEP file");
  }

  return result.meshes.map((mesh) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
    if (mesh.attributes.normal) {
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
    } else {
      geometry.computeVertexNormals();
    }
    geometry.setIndex(mesh.index.array);

    const color = mesh.color ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]) : DEFAULT_COLOR;
    return { geometry, color };
  });
}

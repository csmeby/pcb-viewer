// occt-import-js ships no TypeScript types (confirmed -- open, unresolved
// upstream issue). Minimal ambient declaration covering only what
// occtLoader.ts actually uses, derived from the package's README and its
// maintainer's own examples/three_viewer.html.
declare module "occt-import-js" {
  interface OcctMeshAttributeArray {
    array: number[];
  }

  interface OcctMesh {
    name?: string;
    /** 0-1 floats, feed straight into THREE.Color(r, g, b). */
    color?: [number, number, number];
    attributes: {
      position: OcctMeshAttributeArray;
      normal?: OcctMeshAttributeArray;
    };
    index: OcctMeshAttributeArray;
  }

  interface OcctReadResult {
    success: boolean;
    meshes: OcctMesh[];
  }

  interface OcctInstance {
    ReadStepFile(buffer: Uint8Array, params: unknown): OcctReadResult;
  }

  interface OcctInitOptions {
    locateFile?: (path: string, scriptDirectory: string) => string;
  }

  export default function occtimportjs(options?: OcctInitOptions): Promise<OcctInstance>;
}

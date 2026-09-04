export type ModelSource =
  | { type: "local"; path: string }
  | { type: "remote"; url: string }
  | { type: "unresolvable"; reason: string };

const GITLAB_API_BASE = "https://gitlab.com/api/v4/projects/kicad%2Flibraries%2Fkicad-packages3D/repository/files";

/**
 * Resolves a Model.filename (board.ts) like
 * "${KICAD6_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0402_1005Metric.step" or
 * "${KIPRJMOD}/myproj.pretty/Custom.step" into where its bytes can actually
 * come from:
 *  - "${KIPRJMOD}/..." -> local, relative to the already-open project's own
 *    root -- resolved against the same IFileSystem board/schematic files
 *    come from, no network involved.
 *  - "${KICAD6_3DMODEL_DIR}/..." (and KICAD7/8/9, KiCad's standard 3D
 *    library, versioned per KiCad release but all pointing at the same
 *    library content) -> remote, fetched from KiCad's own GitLab-hosted
 *    library via its CORS-enabled REST API (confirmed working; the plain
 *    /-/raw/ URL and jsdelivr are NOT CORS-enabled for this repo).
 *  - any other ${VAR} (a user's own custom KiCad environment variable,
 *    e.g. a project-specific library path) -> unresolvable, its value isn't
 *    knowable from inside a picked project folder.
 *  - no ${VAR} prefix at all -> treat as already relative to the project
 *    root and try local resolution the same as KIPRJMOD.
 */
export function resolveModelSource(filename: string): ModelSource {
  const match = filename.match(/^\$\{([A-Z0-9_]+)\}\/(.*)$/);
  if (!match) {
    return { type: "local", path: filename };
  }

  const [, varName, rest] = match as [string, string, string];

  if (varName === "KIPRJMOD") {
    return { type: "local", path: rest };
  }

  if (/^KICAD\d*_3DMODEL_DIR$/.test(varName)) {
    const encodedPath = rest
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return { type: "remote", url: `${GITLAB_API_BASE}/${encodedPath}/raw?ref=master` };
  }

  return { type: "unresolvable", reason: `Unknown path variable \${${varName}} (a custom KiCad environment variable this app has no way to resolve)` };
}

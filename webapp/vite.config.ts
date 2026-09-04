import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * KiCanvas's own esbuild-based build treats a handful of non-JS extensions
 * (shader sources, its default drawing-sheet worksheet file) as raw-text
 * modules -- see web/vendor/kicanvas/scripts/bundle.js's `loader` map.
 * Vite/Rollup has no built-in equivalent, so this mirrors just the two
 * extensions actually reachable from the viewers we vendor (WebGL shaders
 * via graphics/webgl/vector.ts, the default worksheet via DrawingSheet),
 * scoped to the vendored tree only so it can't affect our own app's assets.
 */
function kicanvasRawTextPlugin(): Plugin {
  const rawTextExtensions = [".glsl", ".kicad_wks"];

  function matches(id: string): boolean {
    return id.includes("/vendor/kicanvas/") && rawTextExtensions.some((ext) => id.endsWith(ext));
  }

  return {
    name: "kicanvas-raw-text",
    enforce: "pre",
    load(id) {
      if (!matches(id)) {
        return null;
      }
      const contents = readFileSync(id, "utf-8");
      return `export default ${JSON.stringify(contents)};`;
    },
  };
}

/**
 * Vite's build always emits `crossorigin` on the entry `<script type="module">`
 * and `<link rel="stylesheet">` tags, which forces a CORS-mode fetch for both.
 * That's harmless over real HTTP(S), but this same build is also loaded from
 * the native shells' custom-scheme origins (iOS's `pcbapp://`, Android's
 * `https://appassets.androidplatform.net`) -- and a CORS-mode fetch against a
 * non-standard origin is exactly the kind of request real-device WebKit has
 * been seen to police more strictly than the Simulator does, with no error
 * surfaced anywhere (LocalSchemeHandler never even sees the request). Nothing
 * here needs CORS mode -- these are same-origin loads on every target
 * (website, iOS shell, Android shell) -- so drop the attribute entirely
 * rather than debug per-platform CORS behavior for a mode we don't need.
 */
function stripCrossoriginPlugin(): Plugin {
  return {
    name: "strip-crossorigin",
    enforce: "post",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin(=""|="[^"]*")?/g, "");
    },
  };
}

export default defineConfig({
  plugins: [kicanvasRawTextPlugin(), react(), stripCrossoriginPlugin()],
  // Relative asset URLs (./assets/... instead of /assets/...) rather than a
  // second, differently-built production bundle -- this is the exact same
  // `vite build` output a normal static-hosting deploy would get, it just
  // also happens to work when mounted under the native iOS shell's
  // `pcbapp://local/app/...` root instead of a domain root, since relative
  // paths resolve correctly under either.
  base: "./",
  server: {
    fs: {
      // The vendored KiCanvas submodule lives at ../web/vendor/kicanvas,
      // outside this project's root -- Vite's dev server otherwise refuses
      // to serve files from outside root. (web/'s own standalone app was
      // retired once this app -- the one embedded in the native iOS shell --
      // replaced it; only the vendored submodule is still used from there.)
      allow: [resolve(__dirname, ".."), resolve(__dirname, "../web")],
    },
  },
  build: {
    outDir: "dist",
  },
});

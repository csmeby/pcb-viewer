import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useProjectStore } from "../state/projectStore";
import { KicadPCB } from "../../../web/vendor/kicanvas/src/kicad";
import themes from "../../../web/vendor/kicanvas/src/kicanvas/themes";
import { buildBoardMesh } from "./board3d/buildBoardMesh";

/**
 * 3D board viewer -- Phase A: an extruded slab textured from the existing 2D
 * renderer's own front/back render (see board3d/buildBoardMesh.ts), no
 * component models yet. Follows BoardViewerPanel.tsx's conventions (manifest/
 * fileSystem from the project store, same loading/error/empty overlays), but
 * owns a three.js scene instead of handing the canvas to the vendored 2D viewer.
 */
export function Board3DViewerPanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { fileSystem, manifest } = useProjectStore();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !fileSystem || !manifest) {
      return;
    }

    setError(null);
    let disposed = false;
    let started = false;

    // Everything below (the WebGL context, the board build) is created
    // lazily on first becoming visible, not on mount -- PanelLayout keeps
    // every panel mounted at all times (this one starts closed/0-width), so
    // building unconditionally on mount ran a second and third full board
    // parse + offscreen 2D render concurrently with the PCB panel's own
    // (already-open) viewer, which corrupted shared state in the vendored
    // renderer and crashed with "Uncaught Error: Uninitialized". Building
    // only once actually shown avoids that entirely, and also just avoids
    // wasting the work for the common case of never opening this tab.
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer;
    let controls: OrbitControls;
    let animationHandle = 0;

    function resize() {
      if (!started) return;
      const { clientWidth, clientHeight } = container!;
      if (clientWidth === 0 || clientHeight === 0) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    }

    async function run() {
      try {
        const pcbPath = manifest!.files.find((path) => path.endsWith(".kicad_pcb"));
        if (!pcbPath) {
          setError("No .kicad_pcb file found in this project.");
          return;
        }

        const file = await fileSystem!.get(pcbPath);
        const text = await file.text();
        if (disposed) return;

        const board = new KicadPCB(pcbPath, text);
        const boardGroup = await buildBoardMesh(board, themes.by_name("kicad").board);
        if (disposed) {
          return;
        }

        scene.add(boardGroup);

        // Frame the camera on the board: an orbit distance derived from its
        // bounding sphere, looking at its center, matching the "just show me
        // the whole board" default the 2D viewer's zoom_to_board() gives.
        const bounds = new THREE.Box3().setFromObject(boardGroup);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const distance = sphere.radius / Math.sin((camera.fov * Math.PI) / 360) || 100;
        camera.position.set(sphere.center.x, sphere.center.y + distance * 0.5, sphere.center.z + distance);
        camera.near = Math.max(distance / 100, 0.1);
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(sphere.center);
        controls.update();
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    }

    function start() {
      if (started) return;
      started = true;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(themes.by_name("kicad").board.background.to_css());

      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      container!.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const directional = new THREE.DirectionalLight(0xffffff, 1.2);
      directional.position.set(50, 100, 75);
      scene.add(directional);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;

      resize();

      function animate() {
        animationHandle = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      }
      animate();

      setLoading(true);
      run();
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        start();
        resize();
      }
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      cancelAnimationFrame(animationHandle);
      if (started) {
        controls.dispose();
        renderer.dispose();
        container.removeChild(renderer.domElement);
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const material of materials) {
              if (material instanceof THREE.MeshStandardMaterial) {
                material.map?.dispose();
              }
              material.dispose();
            }
          }
        });
      }
    };
  }, [fileSystem, manifest]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {!fileSystem && <div style={overlayStyle}>Open a project to view its board in 3D.</div>}
      {loading && !error && <div style={overlayStyle}>Building 3D view&hellip;</div>}
      {error && <div style={{ ...overlayStyle, color: "var(--danger)" }}>{error}</div>}
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  color: "var(--text-secondary)",
  fontSize: 13,
};

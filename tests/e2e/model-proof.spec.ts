import { test, expect } from "./fixtures";
import { testGLB } from "../glb-fixture";
test("real GLB renders two isolated materials from one cached source with uniform calibration", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle");
  const proof = await page.evaluate(async (base64) => {
    const modulePath = "/src/features/items/model-cache.ts",
      threePath = "/node_modules/.vite/deps/three.js";
    const cache = await import(/* @vite-ignore */ modulePath),
      THREE = await import(/* @vite-ignore */ threePath);
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    let loads = 0;
    const source = await cache.loadModel("browser-proof", async () => {
      loads++;
      return bytes.buffer;
    });
    await cache.loadModel("browser-proof", async () => {
      loads++;
      return bytes.buffer;
    });
    const a = cache.cloneModel(source),
      b = cache.cloneModel(source);
    const bm = b.scene.getObjectByName("Fabric").material;
    const item = {
      baseModelAssetId: "browser-proof",
      bindings: [
        {
          modelAssetId: "browser-proof",
          materialIndex: 0,
          nodeIndex: null,
          slotId: "FABRIC",
        },
      ],
      materials: [],
    };
    const blueVariant = {
      modelAssetId: null,
      overrides: [{ slotId: "FABRIC", baseColor: "#0000ff", materialId: null }],
    };
    const whiteVariant = {
      modelAssetId: null,
      overrides: [{ slotId: "FABRIC", baseColor: "#ffffff", materialId: null }],
    };
    await cache.applyVariant(a, item, blueVariant);
    await cache.applyVariant(b, item, whiteVariant);
    a.scene.position.x = -1.5;
    b.scene.position.x = 1.5;
    const scene = new THREE.Scene();
    scene.add(a.scene, b.scene);
    scene.add(new THREE.AmbientLight(0xffffff, 3));
    const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.set(0, 3, 7);
    camera.lookAt(0, 0.4, 0);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(400, 200);
    renderer.render(scene, camera);
    const gl = renderer.getContext(),
      pixels = new Uint8Array(400 * 200 * 4);
    gl.readPixels(0, 0, 400, 200, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const blue = pixels.some(
      (v: number, i: number) => i % 4 === 2 && v > 100 && pixels[i - 2] < 50,
    );
    const white = pixels.some(
      (v: number, i: number) =>
        i % 4 === 0 && v > 150 && pixels[i + 1] > 150 && pixels[i + 2] > 150,
    );
    await cache.applyVariant(a, item, {
      modelAssetId: null,
      overrides: [{ slotId: "FABRIC", baseColor: "#00ff00", materialId: null }],
    });
    renderer.render(scene, camera);
    const whiteUnchanged = bm.color.getHexString() === "ffffff";
    const size = new THREE.Vector3();
    a.scene.scale.setScalar(2);
    new THREE.Box3().setFromObject(a.scene).getSize(size);
    const result = {
      loads,
      blue,
      white,
      whiteUnchanged,
      width: size.x,
      height: size.y,
      depth: size.z,
      calls: renderer.info.render.calls,
    };
    renderer.dispose();
    a.dispose();
    b.dispose();
    cache.clearModelCache();
    return result;
  }, testGLB().toString("base64"));
  expect(proof.loads).toBe(1);
  expect(proof.calls).toBeGreaterThanOrEqual(4);
  expect(proof.blue).toBe(true);
  expect(proof.white).toBe(true);
  expect(proof.whiteUnchanged).toBe(true);
  expect(proof.width).toBeCloseTo(4.8);
  expect(proof.height).toBeCloseTo(1.64);
  expect(proof.depth).toBeCloseTo(1.9);
});

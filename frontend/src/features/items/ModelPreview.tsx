import { useDisplayPreferences } from "../../display/context";
import { themes } from "../../display/themes";
import { useEffect, useState, useRef, useMemo } from "react";
import { Mesh, MeshStandardMaterial, Vector3, type Group } from "three";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import {
  OrbitControls,
  Bounds,
  useBounds,
  ContactShadows,
} from "@react-three/drei";
import type { Item, ItemVariant } from "@habitat/domain";
import { calibratedModel, renderedModelBounds } from "./model-transform";
import { loadModel, cloneModel, applyVariant } from "./model-cache";
export type ColorTarget = { materialIndex: number; nodeIndex: number | null };
export function ItemModel({
  item,
  variant,
  onError,
  targets,
  onTarget,
  onReady,
  onBounds,
  previewOrientation,
  ghost = false,
}: {
  item: Item;
  variant: ItemVariant;
  ghost?: boolean;
  onError?: (message: string) => void;
  targets?: ColorTarget[];
  onTarget?: (target: ColorTarget) => void;
  onReady?: () => void;
  previewOrientation?: number;
  onBounds?: (bounds: import("@habitat/domain").WorldBoundsMeters) => void;
}) {
  const [model, setModel] = useState<Group | null>(null);
  const [instance, setInstance] = useState<ReturnType<
    typeof cloneModel
  > | null>(null);
  const asset = item.assets.find((a) => a.id === item.baseModelAssetId);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);
  const errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    let active = true,
      owned: ReturnType<typeof cloneModel> | null = null;
    if (!asset) return;
    void loadModel(asset.id)
      .then(async (source) => {
        owned = cloneModel(source);
        await applyVariant(owned, item, variant);
        if (ghost)
          owned.scene.traverse((node) => {
            if (!(node instanceof Mesh)) return;
            node.raycast = () => {};
            for (const material of Array.isArray(node.material)
              ? node.material
              : [node.material]) {
              material.transparent = true;
              material.opacity *= 0.45;
              material.depthWrite = false;
            }
          });
        if (active) {
          const transformed = calibratedModel(owned.scene, asset);
          if (previewOrientation !== undefined)
            transformed.rotation.y = (previewOrientation * Math.PI) / 180;
          setModel(transformed);
          setInstance(owned);
          readyRef.current?.();
        } else owned.dispose();
      })
      .catch((error) => {
        if (active)
          errorRef.current?.(
            error instanceof Error ? error.message : "Model unavailable",
          );
      });
    return () => {
      active = false;
      owned?.dispose();
    };
  }, [item, variant, asset, previewOrientation, ghost]);
  useEffect(() => {
    if (!instance) return;
    instance.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        if (!(m instanceof MeshStandardMaterial)) continue;
        if (!m.userData.originalEmissive)
          m.userData.originalEmissive = m.emissive.clone();
        const selected = targets?.some(
          (t) =>
            t.materialIndex === m.userData.catalogMaterialIndex &&
            (t.nodeIndex === null ||
              t.nodeIndex === node.userData.catalogNodeIndex),
        );
        if (selected) m.emissive.set("#ed9b20");
        else m.emissive.copy(m.userData.originalEmissive);
      }
    });
  }, [instance, targets]);
  useEffect(() => {
    if (model) onBounds?.(renderedModelBounds(model));
  }, [model, onBounds]);
  const select = (event: ThreeEvent<MouseEvent>) => {
    if (!onTarget || !(event.object instanceof Mesh)) return;
    event.stopPropagation();
    const material = Array.isArray(event.object.material)
      ? event.object.material[event.face?.materialIndex ?? 0]
      : event.object.material;
    const materialIndex = material?.userData.catalogMaterialIndex,
      nodeIndex = event.object.userData.catalogNodeIndex;
    if (typeof materialIndex !== "number" || typeof nodeIndex !== "number") {
      errorRef.current?.(
        "This region cannot be mapped safely. Inspect the model under Advanced.",
      );
      return;
    }
    onTarget({ materialIndex, nodeIndex });
  };
  if (!instance || !asset?.inspection) return null;
  return model ? <primitive object={model} onClick={select} /> : null;
}
export default function ModelPreview({
  item,
  variant,
  targets,
  onTarget,
  previewOrientation,
}: {
  item: Item;
  previewOrientation?: number;
  variant?: ItemVariant;
  targets?: ColorTarget[];
  onTarget?: (target: ColorTarget) => void;
}) {
  const palette = themes[useDisplayPreferences().theme].tokens;
  const modelKey = JSON.stringify([
    item.baseModelAssetId,
    previewOrientation,
    item.assets.find((a) => a.id === item.baseModelAssetId)?.calibration,
  ]);
  const [readyKey, setReadyKey] = useState("");
  const [worldBounds, setWorldBounds] = useState<
    import("@habitat/domain").WorldBoundsMeters | null
  >(null);
  const [loaded, setLoaded] = useState(false);
  const [framed, setFramed] = useState(false);
  const [view, setView] = useState({ name: "Reset", revision: 0 });
  const [error, setError] = useState("");
  const fallback = useMemo<ItemVariant>(
    () => ({
      id: "preview",
      itemId: item.id,
      name: "Model",
      sku: null,
      priceOverrideMinor: null,
      currencyOverride: null,
      effectiveSku: null,
      priceMinor: 0,
      currency: "ILS",
      width: 1,
      depth: 1,
      height: 1,
      color: null,
      finish: null,
      modelAssetId: null,
      thumbnailAssetId: null,
      status: "ACTIVE",
      overrides: [],
      createdAt: "",
      updatedAt: "",
    }),
    [item.id],
  );
  const chosen = variant ?? fallback;
  if (!item.baseModelAssetId)
    return (
      <div className="item-preview-empty">
        Upload a model to begin previewing.
      </div>
    );
  return (
    <div
      className="item-preview"
      data-world-bounds={worldBounds ? JSON.stringify(worldBounds) : undefined}
    >
      <div className="viewer-label">
        <span className="eyebrow">Studio view</span>
        <span>
          {onTarget
            ? "Click a surface to select"
            : "Drag to orbit · Scroll to zoom"}
        </span>
      </div>
      <div className="viewer-toolbar" role="group" aria-label="Camera views">
        {["Fit", "Front", "Side", "Top", "Reset"].map((name) => (
          <button
            type="button"
            key={name}
            aria-label={name === "Reset" ? "Reset camera" : `${name} view`}
            onClick={() => setView((v) => ({ name, revision: v.revision + 1 }))}
          >
            {name}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="model-load-state" role="status">
        {loaded && framed ? "Model loaded" : "Loading model…"}
      </p>
      <Canvas camera={{ position: [4, 3, 5], fov: 42 }}>
        <color attach="background" args={[palette["--surface-secondary"]]} />
        <ambientLight intensity={2} />
        <directionalLight position={[4, 8, 5]} intensity={3} />
        <Bounds margin={1.4} maxDuration={0}>
          <FitLoadedModel
            loaded={loaded}
            revision={readyKey}
            view={view}
            onFramed={setFramed}
          />
          <ItemModel
            item={item}
            previewOrientation={previewOrientation}
            variant={chosen}
            onError={setError}
            onBounds={setWorldBounds}
            targets={targets}
            onTarget={onTarget}
            onReady={() => {
              if (readyKey !== modelKey) setFramed(false);
              setReadyKey(modelKey);
              setLoaded(true);
            }}
          />
        </Bounds>
        {worldBounds && (
          <ContactShadows
            position={[0, -0.00001, 0]}
            scale={
              Math.max(
                worldBounds.max[0] - worldBounds.min[0],
                worldBounds.max[2] - worldBounds.min[2],
              ) * 2.5
            }
            far={Math.max(worldBounds.max[1], 0.001) * 2}
            opacity={0.22}
            blur={2.5}
            resolution={128}
            frames={1}
            key={modelKey}
          />
        )}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

function FitLoadedModel({
  revision,
  view,
  loaded,
  onFramed,
}: {
  loaded: boolean;
  revision: string;
  view: { name: string; revision: number };
  onFramed: (ready: boolean) => void;
}) {
  const { camera, controls } = useThree();
  const bounds = useBounds(),
    frames = useRef(0);
  useEffect(() => {
    if (loaded) {
      bounds.refresh();
      if (view.name !== "Fit") {
        const { center, distance } = bounds.getSize();
        const direction =
          view.name === "Front"
            ? [0, 0, 1]
            : view.name === "Side"
              ? [1, 0, 0]
              : view.name === "Top"
                ? [0, 1, 0.0001]
                : [4, 3, 5];
        camera.up.set(0, 1, 0);
        camera.position
          .copy(center)
          .add(new Vector3(...direction).normalize().multiplyScalar(distance));
        camera.lookAt(center);
        const orbit = controls as unknown as {
          target: Vector3;
          update: () => void;
        } | null;
        orbit?.target.copy(center);
        orbit?.update();
      }
      bounds.refresh().clip().fit();
      frames.current = 3;
    }
  }, [bounds, loaded, revision, view, camera, controls]);
  // Bounds applies a zero-duration fit across two render frames; readiness means the camera has settled.
  useFrame(() => {
    if (frames.current > 0 && --frames.current === 0) onFramed(true);
  });
  return null;
}

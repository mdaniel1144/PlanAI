import { useEffect, useState, useRef, useMemo } from "react";
import { Mesh, MeshStandardMaterial, type Group } from "three";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Bounds, useBounds } from "@react-three/drei";
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
}: {
  item: Item;
  variant: ItemVariant;
  onError?: (message: string) => void;
  targets?: ColorTarget[];
  onTarget?: (target: ColorTarget) => void;
  onReady?: () => void;
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
        if (active) {
          setModel(calibratedModel(owned.scene, asset));
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
  }, [item, variant, asset]);
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
}: {
  item: Item;
  variant?: ItemVariant;
  targets?: ColorTarget[];
  onTarget?: (target: ColorTarget) => void;
}) {
  const modelKey = JSON.stringify([
    item.baseModelAssetId,
    item.assets.find((a) => a.id === item.baseModelAssetId)?.calibration,
  ]);
  const [readyKey, setReadyKey] = useState("");
  const [worldBounds, setWorldBounds] = useState<
    import("@habitat/domain").WorldBoundsMeters | null
  >(null);
  const [loaded, setLoaded] = useState(false);
  const [framed, setFramed] = useState(false);
  const [reset, setReset] = useState(0),
    [error, setError] = useState("");
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
      <button
        className="button secondary preview-reset"
        onClick={() => {
          setLoaded(false);
          setFramed(false);
          setReset((r) => r + 1);
        }}
      >
        Reset camera
      </button>
      {error && <p role="alert">{error}</p>}
      <p className="model-load-state" role="status">
        {loaded && framed ? "Model loaded" : "Loading model…"}
      </p>
      <Canvas key={reset} camera={{ position: [4, 3, 5], fov: 42 }}>
        <color attach="background" args={["#eeeee8"]} />
        <ambientLight intensity={2} />
        <directionalLight position={[4, 8, 5]} intensity={3} />
        <Bounds margin={1.4} maxDuration={0}>
          <FitLoadedModel
            loaded={loaded}
            revision={readyKey}
            onFramed={setFramed}
          />
          <ItemModel
            item={item}
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
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

function FitLoadedModel({
  revision,
  loaded,
  onFramed,
}: {
  loaded: boolean;
  revision: string;
  onFramed: (ready: boolean) => void;
}) {
  const bounds = useBounds(),
    frames = useRef(0);
  useEffect(() => {
    if (loaded) {
      bounds.refresh().clip().fit();
      frames.current = 3;
    }
  }, [bounds, loaded, revision]);
  // Bounds applies a zero-duration fit across two render frames; readiness means the camera has settled.
  useFrame(() => {
    if (frames.current > 0 && --frames.current === 0) onFramed(true);
  });
  return null;
}

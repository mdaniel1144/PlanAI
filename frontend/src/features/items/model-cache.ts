import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import {
  Mesh,
  MeshStandardMaterial,
  TextureLoader,
  SRGBColorSpace,
  Texture,
} from "three";
import type { Item, ItemVariant } from "@habitat/domain";
const sources = new Map<string, Promise<GLTF>>();
const textures = new Map<string, Promise<Texture>>();
type Lease = { refs: number; retired: boolean };
const sourceLeases = new WeakMap<GLTF, Lease>();
const textureLeases = new WeakMap<Texture, Lease>();
function disposeSource(source: GLTF) {
  const embedded = new Set<Texture>(),
    geometries = new Set<import("three").BufferGeometry>(),
    materials = new Set<import("three").Material>();
  source.scene.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material)
      ? node.material
      : [node.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof Texture) embedded.add(value);
    material.dispose();
  }
  for (const texture of embedded) texture.dispose();
}

function retireSource(source: GLTF) {
  const lease = sourceLeases.get(source);
  if (lease) {
    lease.retired = true;
    if (!lease.refs) disposeSource(source);
  }
}
function retireTexture(t: Texture) {
  const lease = textureLeases.get(t);
  if (lease) {
    lease.retired = true;
    if (!lease.refs) t.dispose();
  }
}
function boundCache<T>(
  cache: Map<string, Promise<T>>,
  max: number,
  retire: (value: T) => void,
) {
  while (cache.size > max) {
    const key = cache.keys().next().value!;
    const value = cache.get(key)!;
    cache.delete(key);
    void value.then(retire).catch(() => {});
  }
}

export function parseModel(bytes: ArrayBuffer) {
  return new GLTFLoader().parseAsync(bytes, "");
}
export function loadModel(
  assetId: string,
  fetchBytes: () => Promise<ArrayBuffer> = async () => {
    const response = await fetch(`/api/item-assets/${assetId}`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Model could not be loaded");
    return response.arrayBuffer();
  },
) {
  let source = sources.get(assetId);
  if (!source) {
    source = fetchBytes()
      .then(parseModel)
      .then((source) => {
        sourceLeases.set(source, { refs: 0, retired: false });
        return source;
      })
      .catch((error) => {
        sources.delete(assetId);
        throw error;
      });
    sources.set(assetId, source);
    boundCache(sources, 16, retireSource);
  } else {
    sources.delete(assetId);
    sources.set(assetId, source);
  }
  return source;
}
export function cloneModel(source: GLTF) {
  const lease = sourceLeases.get(source);
  if (lease) lease.refs++;
  const heldTextures = new Set<Texture>();
  let disposed = false;
  const scene = clone(source.scene),
    materials: MeshStandardMaterial[] = [];
  const sourceNodes: import("three").Object3D[] = [];
  source.scene.traverse((n) => sourceNodes.push(n));
  let cursor = 0;
  scene.traverse((node) => {
    const originalNode = sourceNodes[cursor++];
    let ancestor: import("three").Object3D | null = originalNode;
    let nodeIndex: number | undefined;
    while (ancestor && nodeIndex === undefined) {
      nodeIndex = source.parser.associations.get(ancestor)?.nodes;
      ancestor = ancestor.parent;
    }
    node.userData = { ...node.userData, catalogNodeIndex: nodeIndex };
    if (!(node instanceof Mesh)) return;
    const original = node.material;
    const copy = (m: MeshStandardMaterial) => {
      const cloned = m.clone();
      cloned.userData = {
        ...cloned.userData,
        catalogMaterialIndex: source.parser.associations.get(m)?.materials,
      };
      materials.push(cloned);
      return cloned;
    };
    node.material = Array.isArray(original)
      ? original.map(copy)
      : copy(original);
  });
  return {
    scene,
    retainTexture: (t: Texture) => {
      if (disposed || heldTextures.has(t)) return;
      heldTextures.add(t);
      const lease = textureLeases.get(t);
      if (lease) lease.refs++;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      materials.forEach((m) => m.dispose());
      if (lease) {
        lease.refs--;
        if (lease.retired && !lease.refs) disposeSource(source);
      }
      for (const t of heldTextures) {
        const l = textureLeases.get(t);
        if (l) {
          l.refs--;
          if (l.retired && !l.refs) t.dispose();
        }
      }
    },
  };
}
function texture(id: string, channel: string) {
  const key = `${id}:${channel}`;
  let promise = textures.get(key);
  if (!promise) {
    promise = new TextureLoader()
      .loadAsync(`/api/item-assets/${id}`)
      .then((t) => {
        textureLeases.set(t, { refs: 0, retired: false });
        t.flipY = false;
        if (channel === "BASE_COLOR") t.colorSpace = SRGBColorSpace;
        return t;
      })
      .catch((error) => {
        textures.delete(key);
        throw error;
      });
    textures.set(key, promise);
    boundCache(textures, 64, retireTexture);
  } else {
    textures.delete(key);
    textures.set(key, promise);
  }
  return promise;
}
export async function applyVariant(
  instance: ReturnType<typeof cloneModel>,
  item: Item,
  variant: ItemVariant,
) {
  const assetId = item.baseModelAssetId;
  for (const binding of item.bindings.filter(
    (b) => b.modelAssetId === assetId,
  )) {
    const override = variant.overrides.find((o) => o.slotId === binding.slotId);
    if (!override) continue;
    const definition = item.materials.find((m) => m.id === override.materialId);
    const maps = await Promise.all(
      (definition?.textures ?? []).map(async (t) => ({
        ...t,
        texture: await texture(t.assetId, t.channel),
      })),
    );
    for (const map of maps) instance.retainTexture(map.texture);
    instance.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      if (
        binding.nodeIndex !== null &&
        node.userData.catalogNodeIndex !== binding.nodeIndex
      )
        return;
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        if (
          !(material instanceof MeshStandardMaterial) ||
          material.userData.catalogMaterialIndex !== binding.materialIndex
        )
          continue;
        material.color.set(
          override.baseColor ?? definition?.baseColor ?? "#ffffff",
        );
        material.map = null;
        if (definition) {
          material.roughness = definition.roughness;
          material.metalness = definition.metalness;
          material.opacity = definition.opacity;
          material.transparent = definition.opacity < 1;
          material.normalMap = null;
          material.roughnessMap = null;
          for (const map of maps) {
            if (map.channel === "BASE_COLOR") material.map = map.texture;
            if (map.channel === "NORMAL") material.normalMap = map.texture;
            if (map.channel === "ROUGHNESS")
              material.roughnessMap = map.texture;
          }
        }
        material.needsUpdate = true;
      }
    });
  }
}
// Clear when session changes; cached source objects must not cross account boundaries.
export function clearModelCache() {
  for (const promise of sources.values())
    void promise.then(retireSource).catch(() => {});
  for (const promise of textures.values())
    void promise.then(retireTexture).catch(() => {});
  sources.clear();
  textures.clear();
}

if (typeof window !== "undefined")
  window.addEventListener("habitat:clear-assets", clearModelCache);

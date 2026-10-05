import { z } from "zod";
import type { ModelInspection } from "@habitat/domain";
import { inspectImage } from "./images";
import { fail, ItemError } from "./errors";
const index = z.number().int().nonnegative(),
  numbers = (n: number) => z.array(z.number().finite()).length(n);
const unit = z.number().min(0).max(1);
const textureInfo = z.object({ index, texCoord: z.literal(0).optional() });
const materialSchema = z.object({
  name: z.string().max(500).default(""),
  pbrMetallicRoughness: z
    .object({
      baseColorFactor: z.array(unit).length(4).optional(),
      baseColorTexture: textureInfo.optional(),
      metallicFactor: unit.optional(),
      roughnessFactor: unit.optional(),
      metallicRoughnessTexture: textureInfo.optional(),
    })
    .optional(),
  normalTexture: textureInfo
    .extend({ scale: z.number().finite().min(-100).max(100).optional() })
    .optional(),
  occlusionTexture: textureInfo
    .extend({ strength: unit.optional() })
    .optional(),
  emissiveTexture: textureInfo.optional(),
  emissiveFactor: z.array(unit).length(3).optional(),
  alphaMode: z.enum(["OPAQUE", "MASK", "BLEND"]).optional(),
  alphaCutoff: unit.optional(),
  doubleSided: z.boolean().optional(),
});
const schema = z.object({
  asset: z.object({ version: z.literal("2.0") }),
  scene: index.default(0),
  scenes: z
    .array(z.object({ nodes: z.array(index).default([]) }))
    .min(1)
    .max(100),
  buffers: z
    .array(z.object({ byteLength: index, uri: z.string().optional() }))
    .length(1),
  bufferViews: z
    .array(
      z.object({
        buffer: z.literal(0),
        byteOffset: index.default(0),
        byteLength: index,
        byteStride: index.optional(),
      }),
    )
    .max(10000)
    .default([]),
  accessors: z
    .array(
      z.object({
        bufferView: index,
        byteOffset: index.default(0),
        componentType: z.union([
          z.literal(5120),
          z.literal(5121),
          z.literal(5122),
          z.literal(5123),
          z.literal(5125),
          z.literal(5126),
        ]),
        count: index,
        type: z.enum(["SCALAR", "VEC2", "VEC3", "VEC4"]),
        normalized: z.boolean().optional(),
        sparse: z.unknown().optional(),
        min: z.array(z.number().finite()).optional(),
        max: z.array(z.number().finite()).optional(),
      }),
    )
    .max(10000)
    .default([]),
  nodes: z
    .array(
      z.object({
        name: z.string().max(500).default(""),
        mesh: index.optional(),
        children: z
          .array(index)
          .max(Number(process.env.ITEM_MAX_NODES) || 5000)
          .default([]),
        translation: numbers(3).optional(),
        rotation: numbers(4).optional(),
        scale: numbers(3).optional(),
        matrix: numbers(16).optional(),
        skin: index.optional(),
        weights: z.unknown().optional(),
      }),
    )
    .max(Number(process.env.ITEM_MAX_NODES) || 5000)
    .default([]),
  meshes: z
    .array(
      z.object({
        name: z.string().max(500).default(""),
        primitives: z
          .array(
            z.object({
              attributes: z.record(z.string(), index),
              indices: index.optional(),
              material: index.optional(),
              mode: z.literal(4).default(4),
              targets: z.unknown().optional(),
            }),
          )
          .max(1000),
      }),
    )
    .max(Number(process.env.ITEM_MAX_MESHES) || 2000)
    .default([]),
  materials: z
    .array(materialSchema)
    .max(Number(process.env.ITEM_MAX_MATERIALS) || 512)
    .default([]),
  textures: z
    .array(z.object({ source: index, sampler: index.optional() }))
    .max(256)
    .default([]),
  samplers: z
    .array(
      z.object({
        magFilter: z.union([z.literal(9728), z.literal(9729)]).optional(),
        minFilter: z
          .union([
            z.literal(9728),
            z.literal(9729),
            z.literal(9984),
            z.literal(9985),
            z.literal(9986),
            z.literal(9987),
          ])
          .optional(),
        wrapS: z
          .union([z.literal(33071), z.literal(33648), z.literal(10497)])
          .optional(),
        wrapT: z
          .union([z.literal(33071), z.literal(33648), z.literal(10497)])
          .optional(),
      }),
    )
    .max(256)
    .default([]),
  images: z
    .array(
      z.object({
        bufferView: index,
        mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
      }),
    )
    .max(128)
    .default([]),
  animations: z.array(z.unknown()).default([]),
  skins: z.array(z.unknown()).default([]),
});
export async function inspectGLB(bytes: Buffer): Promise<ModelInspection> {
  try {
    return await inspect(bytes);
  } catch (error) {
    if (error instanceof ItemError) throw error;
    fail("ITEM_GLB_INVALID", "Malformed or unsupported GLB structure");
  }
}
async function inspect(bytes: Buffer): Promise<ModelInspection> {
  if (
    bytes.length > (Number(process.env.ITEM_GLB_MAX_BYTES) || 50 * 1024 * 1024)
  )
    fail("ITEM_ASSET_TOO_LARGE", "Model exceeds upload limit", 413);
  const invalid = (message: string): never => fail("ITEM_GLB_INVALID", message);
  if (
    bytes.length < 28 ||
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    invalid("Invalid GLB header/version/length");
  let offset = 12;
  const chunks: { type: number; data: Buffer }[] = [];
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalid("Truncated chunk");
    const length = bytes.readUInt32LE(offset),
      type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || length < 1 || offset + 8 + length > bytes.length)
      invalid("Invalid chunk length");
    chunks.push({
      type,
      data: bytes.subarray(offset + 8, offset + 8 + length),
    });
    offset += 8 + length;
  }
  if (
    chunks.length !== 2 ||
    chunks[0].type !== 0x4e4f534a ||
    chunks[1].type !== 0x004e4942
  )
    invalid("Expected JSON and binary chunks");
  const raw: unknown = JSON.parse(chunks[0].data.toString("utf8"));
  const inspectFields = (value: unknown, depth = 0) => {
    if (depth > 64) invalid("GLB nesting limit exceeded");
    if (value && typeof value === "object")
      for (const [key, v] of Object.entries(value)) {
        if (key === "uri")
          fail(
            "ITEM_EXTERNAL_RESOURCE_UNSUPPORTED",
            "External and data URI resources are not supported",
          );
        if (
          key === "extensions" &&
          v &&
          typeof v === "object" &&
          Object.keys(v).length
        )
          invalid("GLB extensions are not supported in this release");
        inspectFields(v, depth + 1);
      }
  };
  inspectFields(raw);
  const g = schema.parse(raw),
    bin = chunks[1].data;
  if (
    g.buffers[0].byteLength > bin.length ||
    bin.length - g.buffers[0].byteLength > 3
  )
    invalid("Buffer length mismatch");
  if (g.animations.length || g.skins.length)
    invalid(
      "Animated/skinned assets are not supported for calibrated static products",
    );
  const at = <T>(list: T[], i: number): T => {
    if (!Number.isInteger(i) || i < 0 || i >= list.length)
      invalid("Invalid GLB index");
    return list[i];
  };
  for (const b of g.bufferViews)
    if (
      b.byteOffset + b.byteLength > g.buffers[0].byteLength ||
      (b.byteStride !== undefined &&
        (b.byteStride < 4 || b.byteStride > 252 || b.byteStride % 4))
    )
      invalid("Buffer view exceeds bounds");
  const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 },
    components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  let elements = 0;
  for (const a of g.accessors) {
    const b = at(g.bufferViews, a.bufferView),
      unit = size[a.componentType],
      packed = unit * components[a.type],
      stride = b.byteStride ?? packed;
    elements += a.count;
    if (
      a.sparse ||
      a.count === 0 ||
      stride < packed ||
      stride % unit ||
      a.byteOffset % unit ||
      (b.byteOffset + a.byteOffset) % unit ||
      a.byteOffset + (a.count - 1) * stride + packed > b.byteLength ||
      elements > 4_000_000
    )
      invalid("Accessor bounds/complexity unsupported");
  }
  const read = (accessor: number, i: number, c = 0) => {
    const a = at(g.accessors, accessor),
      b = at(g.bufferViews, a.bufferView),
      pos =
        b.byteOffset +
        a.byteOffset +
        i * (b.byteStride ?? size[a.componentType] * components[a.type]) +
        c * size[a.componentType];
    const value =
      a.componentType === 5126
        ? bin.readFloatLE(pos)
        : a.componentType === 5125
          ? bin.readUInt32LE(pos)
          : a.componentType === 5123
            ? bin.readUInt16LE(pos)
            : a.componentType === 5122
              ? bin.readInt16LE(pos)
              : a.componentType === 5121
                ? bin.readUInt8(pos)
                : bin.readInt8(pos);
    if (!Number.isFinite(value)) invalid("Nonfinite geometry");
    return value;
  };
  let primitives = 0;
  for (const mesh of g.meshes)
    for (const p of mesh.primitives) {
      if (++primitives > 5000 || p.targets)
        invalid("Primitive limit or unsupported morph targets");
      const a = at(g.accessors, p.attributes.POSITION);
      if (a.type !== "VEC3" || a.componentType !== 5126 || a.normalized)
        invalid("Positions must be float VEC3");
      for (const [semantic, i] of Object.entries(p.attributes)) {
        const attr = at(g.accessors, i);
        if (attr.count !== a.count) invalid("Attribute vertex counts differ");
        if (semantic.startsWith("TEXCOORD") && attr.type !== "VEC2")
          invalid("Invalid UV attribute");
        for (let n = 0; n < attr.count; n++)
          for (let c = 0; c < components[attr.type]; c++) read(i, n, c);
      }
      const actualMin = [Infinity, Infinity, Infinity],
        actualMax = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < a.count; v++)
        for (let c = 0; c < 3; c++) {
          const value = read(p.attributes.POSITION, v, c);
          actualMin[c] = Math.min(actualMin[c], value);
          actualMax[c] = Math.max(actualMax[c], value);
        }
      if (
        !a.min ||
        !a.max ||
        a.min.length !== 3 ||
        a.max.length !== 3 ||
        a.min.some(
          (n, c) =>
            Math.abs(n - actualMin[c]) > Math.max(1e-5, Math.abs(n) * 1e-6),
        ) ||
        a.max.some(
          (n, c) =>
            Math.abs(n - actualMax[c]) > Math.max(1e-5, Math.abs(n) * 1e-6),
        )
      )
        invalid("POSITION bounds must match the actual geometry");
      if (p.material !== undefined) at(g.materials, p.material);
      if (p.indices !== undefined) {
        const indices = at(g.accessors, p.indices);
        if (
          indices.type !== "SCALAR" ||
          ![5121, 5123, 5125].includes(indices.componentType) ||
          indices.count % 3
        )
          invalid("Invalid triangle indices");
        for (let i = 0; i < indices.count; i++)
          if (read(p.indices, i) >= a.count) invalid("Index exceeds vertices");
      } else if (a.count % 3) invalid("Invalid triangle vertex count");
    }
  let decodedPixels = 0;
  for (const img of g.images) {
    const b = at(g.bufferViews, img.bufferView),
      info = await inspectImage(
        bin.subarray(b.byteOffset, b.byteOffset + b.byteLength),
      );
    if (info.mimeType !== img.mimeType) invalid("Embedded image MIME mismatch");
    decodedPixels += info.width * info.height;
    if (decodedPixels > 32_000_000) invalid("Embedded image budget exceeded");
  }
  for (const t of g.textures) {
    at(g.images, t.source);
    if (t.sampler !== undefined) at(g.samplers, t.sampler);
  }
  // Validate all textureInfo references, including material PBR and normal maps.
  const textures = (value: unknown) => {
    if (value && typeof value === "object")
      for (const [k, v] of Object.entries(value)) {
        if (
          k.endsWith("Texture") &&
          v &&
          typeof v === "object" &&
          "index" in v
        ) {
          at(g.textures, Number(v.index));
          if ("texCoord" in v && v.texCoord !== 0)
            invalid("Only UV set zero is supported");
        }
        textures(v);
      }
  };
  textures(raw);
  const parents = new Set<number>();
  for (const n of g.nodes) {
    if (n.mesh !== undefined) at(g.meshes, n.mesh);
    if (n.skin !== undefined || n.weights)
      invalid("Skin/morph nodes unsupported");
    if (n.matrix && (n.translation || n.rotation || n.scale))
      invalid("Matrix and TRS cannot coexist");
    if (n.rotation && Math.abs(Math.hypot(...n.rotation) - 1) > 0.001)
      invalid("Rotation quaternion must be normalized");
    for (const c of n.children) {
      at(g.nodes, c);
      if (parents.has(c)) invalid("Node has multiple parents");
      parents.add(c);
    }
  }
  const visited = new Set<number>(),
    visiting = new Set<number>();
  const cycle = (i: number) => {
    if (visiting.has(i)) invalid("Node cycle");
    if (visited.has(i)) return;
    visiting.add(i);
    for (const c of at(g.nodes, i).children) cycle(c);
    visiting.delete(i);
    visited.add(i);
  };
  g.nodes.forEach((_, i) => cycle(i));
  const transform = (p: number[], node: number) => {
    const n = g.nodes[node];
    if (n.matrix) {
      const m = n.matrix;
      if (m[3] || m[7] || m[11] || m[15] !== 1) invalid("Non-affine matrix");
      return [0, 1, 2].map(
        (r) => m[r] * p[0] + m[r + 4] * p[1] + m[r + 8] * p[2] + m[r + 12],
      );
    }
    let [x, y, z] = p.map((v, i) => v * (n.scale?.[i] ?? 1));
    const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1],
      tx = 2 * (qy * z - qz * y),
      ty = 2 * (qz * x - qx * z),
      tz = 2 * (qx * y - qy * x);
    [x, y, z] = [
      x + qw * tx + qy * tz - qz * ty,
      y + qw * ty + qz * tx - qx * tz,
      z + qw * tz + qx * ty - qy * tx,
    ];
    return [x, y, z].map((v, i) => v + (n.translation?.[i] ?? 0));
  };
  const min: [number, number, number] = [Infinity, Infinity, Infinity],
    max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let total = 0;
  const walk = (i: number, ancestors: number[]) => {
    const n = at(g.nodes, i),
      chain = [i, ...ancestors];
    if (chain.length > 128) invalid("Hierarchy too deep");
    if (n.mesh !== undefined)
      for (const p of g.meshes[n.mesh].primitives) {
        const a = g.accessors[p.attributes.POSITION];
        for (let v = 0; v < a.count; v++) {
          if (++total > 2_000_000)
            invalid("Instanced geometry budget exceeded");
          let point = [0, 1, 2].map((c) => read(p.attributes.POSITION, v, c));
          for (const node of chain) point = transform(point, node);
          point.forEach((value, c) => {
            if (!Number.isFinite(value) || Math.abs(value) > 1e9)
              invalid("Geometry outside supported range");
            min[c] = Math.min(min[c], value);
            max[c] = Math.max(max[c], value);
          });
        }
      }
    for (const c of n.children) walk(c, chain);
  };
  const roots = at(g.scenes, g.scene).nodes;
  if (new Set(roots).size !== roots.length || roots.some((i) => parents.has(i)))
    invalid("Invalid scene roots");
  for (const i of roots) walk(i, []);
  if (!total) invalid("Model contains no renderable geometry");
  return {
    nodes: g.nodes.map((n, index) => ({
      index,
      name: n.name,
      mesh: n.mesh ?? null,
      children: n.children,
    })),
    meshes: g.meshes.map((m, index) => ({
      index,
      name: m.name,
      primitives: m.primitives.map((p) => ({
        materialIndex: p.material ?? null,
        hasUV: p.attributes.TEXCOORD_0 !== undefined,
        vertices: g.accessors[p.attributes.POSITION].count,
      })),
    })),
    materials: g.materials.map((m, index) => ({ index, name: m.name })),
    textures: g.textures.map((t, index) => ({ index, source: t.source })),
    animations: [],
    bounds: { min, max },
    dimensions: {
      width: max[0] - min[0],
      height: max[1] - min[1],
      depth: max[2] - min[2],
    },
    warnings: [],
  };
}

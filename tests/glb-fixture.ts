// A complete, self-contained glTF 2 binary with indexed box geometry, UVs and two materials.
// Generated test data, not a mock loader response.
export function testGLB(change?: (g: Record<string, unknown>) => void) {
  const points = [
    [-1.2, 0, -0.475],
    [1.2, 0, -0.475],
    [1.2, 0.82, -0.475],
    [-1.2, 0.82, -0.475],
    [-1.2, 0, 0.475],
    [1.2, 0, 0.475],
    [1.2, 0.82, 0.475],
    [-1.2, 0.82, 0.475],
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0,
    4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ];
  const data = Buffer.alloc(96 + 64 + 72);
  points.flat().forEach((v, i) => data.writeFloatLE(v, i * 4));
  for (let i = 0; i < 16; i++) data.writeFloatLE(i % 2, 96 + i * 4);
  indices.forEach((v, i) => data.writeUInt16LE(v, 160 + i * 2));
  const g: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "Fabric", mesh: 0 },
      { name: "Legs", mesh: 1, scale: [0.1, 0.2, 0.1], translation: [0, 0, 0] },
    ],
    meshes: [
      {
        name: "Upholstery",
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
      {
        name: "Frame",
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1 },
            indices: 2,
            material: 1,
          },
        ],
      },
    ],
    materials: [
      {
        name: "Fabric",
        pbrMetallicRoughness: {
          baseColorFactor: [1, 1, 1, 1],
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      },
      { name: "Legs" },
    ],
    buffers: [{ byteLength: data.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96 },
      { buffer: 0, byteOffset: 96, byteLength: 64 },
      { buffer: 0, byteOffset: 160, byteLength: 72 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-1.2, 0, -0.475],
        max: [1.2, 0.82, 0.475],
      },
      { bufferView: 1, componentType: 5126, count: 8, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };
  change?.(g);
  const json = Buffer.from(JSON.stringify(g));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const out = Buffer.alloc(28 + padded.length + data.length);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(padded.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(out, 20);
  out.writeUInt32LE(data.length, 20 + padded.length);
  out.writeUInt32LE(0x004e4942, 24 + padded.length);
  data.copy(out, 28 + padded.length);
  return out;
}

// Three separately visible regions with the same overall 2.4 × .95 × .82 bounds.
export function colorTargetGLB() {
  return testGLB((g) => {
    const meshes = g.meshes as {
      name: string;
      primitives: {
        attributes: Record<string, number>;
        indices: number;
        material: number;
      }[];
    }[];
    meshes.push({
      ...meshes[0],
      name: "Fixed frame",
      primitives: meshes[0].primitives.map((p) => ({ ...p, material: 2 })),
    });
    g.nodes = [
      { name: "Body", mesh: 0, scale: [0.3, 1, 1], translation: [-0.84, 0, 0] },
      { name: "Cushion", mesh: 1, scale: [0.3, 1, 1], translation: [0, 0, 0] },
      {
        name: "Fixed frame",
        mesh: 2,
        scale: [0.3, 1, 1],
        translation: [0.84, 0, 0],
      },
    ];
    g.scenes = [{ nodes: [0, 1, 2] }];
    g.materials = ["Body", "Cushion", "Fixed frame"].map((name) => ({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    }));
  });
}

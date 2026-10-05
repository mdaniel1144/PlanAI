import { createHash } from "node:crypto";
import type { Item } from "@habitat/domain";
// Only render-affecting values belong here. Version changes invalidate older render conventions.
export function thumbnailSignature(item: Item): string | null {
  if (!item.setup?.dimensionsConfirmed) return null;
  const model = item.assets.find((a) => a.id === item.baseModelAssetId)!;
  const color = item.variants.find(
    (v) => v.id === item.defaultVariantId && v.status === "ACTIVE",
  );
  const overrides = [...(color?.overrides ?? [])].sort((a, b) =>
    a.slotId.localeCompare(b.slotId),
  );
  const materialIds = new Set(overrides.map((o) => o.materialId));
  const source = {
    version: 1,
    model: model.id,
    sha256: model.sha256,
    calibration: model.calibration,
    dimensions: [item.width, item.depth, item.height],
    anchor: "bottom-center",
    defaultColorId: color?.id ?? null,
    overrides,
    bindings: item.bindings
      .filter((b) => b.modelAssetId === model.id)
      .map(({ slotId, materialIndex, nodeIndex }) => ({
        slotId,
        materialIndex,
        nodeIndex,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    materials: item.materials
      .filter((m) => materialIds.has(m.id))
      .map(({ id, baseColor, roughness, metalness, opacity, textures }) => ({
        id,
        baseColor,
        roughness,
        metalness,
        opacity,
        textures: [...textures].sort((a, b) =>
          a.channel.localeCompare(b.channel),
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

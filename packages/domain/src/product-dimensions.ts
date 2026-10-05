import { z } from "zod";
export const dimensionSourceSchema = z.enum([
  "MANUFACTURER_SPECIFICATION",
  "TECHNICAL_SHEET",
  "MANUAL_MEASUREMENT",
  "OTHER_VERIFIED_SOURCE",
]);
export const dimensionsMetersSchema = z
  .object({
    width: z.number().finite().positive(),
    depth: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();
export type DimensionsMeters = z.infer<typeof dimensionsMetersSchema>;
export type ModelUnitDimensions = {
  width: number;
  depth: number;
  height: number;
};
export const worldBoundsSchema = z
  .object({
    min: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
    max: z.tuple([
      z.number().finite(),
      z.number().finite(),
      z.number().finite(),
    ]),
  })
  .strict();
export type WorldBoundsMeters = z.infer<typeof worldBoundsSchema>;
export const orientedModelDimensions = (
  raw: ModelUnitDimensions,
  orientation: number,
): ModelUnitDimensions => ({
  width: orientation % 180 ? raw.depth : raw.width,
  depth: orientation % 180 ? raw.width : raw.depth,
  height: raw.height,
});
// Existing uniform-scale ratios allow 1%; inverse ratios require up to 1.011%.
export const renderedDimensionTolerance = 0.011;
export function renderedDimensionsMatch(
  bounds: WorldBoundsMeters,
  canonical: DimensionsMeters,
) {
  const actual = {
    width: bounds.max[0] - bounds.min[0],
    depth: bounds.max[2] - bounds.min[2],
    height: bounds.max[1] - bounds.min[1],
  };
  return (
    (Object.keys(actual) as (keyof DimensionsMeters)[]).every(
      (k) =>
        Number.isFinite(actual[k]) &&
        Math.abs(actual[k] - canonical[k]) <=
          Math.max(1e-7, canonical[k] * renderedDimensionTolerance),
    ) &&
    Math.abs(bounds.min[1]) <= 1e-6 &&
    Math.abs(bounds.min[0] + bounds.max[0]) <= 1e-6 &&
    Math.abs(bounds.min[2] + bounds.max[2]) <= 1e-6
  );
}
// Broad warning ranges in metres, not a product specification or an automatic correction.
export const categoryDimensionGuidance: Record<
  string,
  { min: DimensionsMeters; max: DimensionsMeters }
> = Object.fromEntries(
  [
    ["sofa", [0.5, 0.25, 0.2], [6, 4, 2.5]],
    ["chair", [0.15, 0.15, 0.2], [2, 2, 2.5]],
    ["table", [0.2, 0.2, 0.15], [8, 4, 2]],
    ["bed", [0.5, 0.8, 0.1], [4, 4, 3]],
    ["cabinet", [0.15, 0.1, 0.2], [6, 3, 4]],
    ["wardrobe", [0.3, 0.2, 0.5], [8, 3, 4]],
    ["door", [0.3, 0.02, 0.5], [5, 2, 5]],
  ].map(([key, min, max]) => {
    const a = min as number[],
      b = max as number[];
    return [
      key,
      {
        min: { width: a[0], depth: a[1], height: a[2] },
        max: { width: b[0], depth: b[1], height: b[2] },
      },
    ];
  }),
);
export function dimensionPlausibility(category: string, d: DimensionsMeters) {
  const range = categoryDimensionGuidance[category.toLowerCase()];
  if (!range) return null;
  const keys = ["width", "depth", "height"] as const;
  const plausible = (v: DimensionsMeters) =>
    keys.every((k) => v[k] >= range.min[k] && v[k] <= range.max[k]);
  if (plausible(d)) return null;
  const factor = [100, 0.01].find((f) =>
    plausible({ width: d.width * f, depth: d.depth * f, height: d.height * f }),
  );
  return {
    code: "ITEM_DIMENSIONS_IMPLAUSIBLE",
    message: `These dimensions appear unusually ${keys.some((k) => d[k] < range.min[k]) ? "small" : "large"} for a ${category}.`,
    suggestedFactor: factor ?? null,
  };
}

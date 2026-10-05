import {
  dimensionSourceSchema,
  dimensionsMetersSchema,
  worldBoundsSchema,
} from "./product-dimensions";
import { z } from "zod";
const key = z.string().trim().min(1).max(120),
  uuid = z.uuid(),
  positive = z.number().finite().positive().max(10000),
  color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
// Form controls use empty strings; optional domain references use null.
const emptyToNull = (value: unknown) =>
  typeof value === "string" && !value.trim() ? null : value;
export const optionalReference = z
  .preprocess(emptyToNull, uuid.nullable())
  .default(null);
const optionalSku = z
  .preprocess(emptyToNull, z.string().trim().min(1).max(120).nullable())
  .default(null);
export const taxonomySchema = z.object({
  id: key,
  name: key,
  active: z.boolean(),
});
export const calibrationSchema = z
  .object({
    metresPerModelUnit: positive,
    orientation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    confirmed: z.literal(true),
  })
  .strict();
export const inspectionSchema = z.object({
  nodes: z.array(
    z.object({
      index: z.number(),
      name: z.string(),
      mesh: z.number().nullable(),
      children: z.array(z.number()),
    }),
  ),
  meshes: z.array(
    z.object({
      index: z.number(),
      name: z.string(),
      primitives: z.array(
        z.object({
          materialIndex: z.number().nullable(),
          hasUV: z.boolean(),
          vertices: z.number(),
        }),
      ),
    }),
  ),
  materials: z.array(z.object({ index: z.number(), name: z.string() })),
  textures: z.array(z.object({ index: z.number(), source: z.number() })),
  animations: z.array(z.string()),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  dimensions: z.object({
    width: z.number(),
    depth: z.number(),
    height: z.number(),
  }),
  warnings: z.array(z.string()),
});
export const generatedThumbnailSchema = z.object({
  source: z.literal("GENERATED_FROM_GLB"),
  modelAssetId: uuid,
  defaultColorId: uuid.nullable(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
  width: z.literal(512),
  height: z.literal(512),
});
export const assetSchema = z.object({
  id: uuid,
  itemId: uuid,
  type: z.enum(["GLB_MODEL", "TEXTURE", "THUMBNAIL"]),
  mimeType: z.string(),
  fileName: z.string(),
  fileSize: z.number(),
  sha256: z.string(),
  generated: generatedThumbnailSchema.nullable().optional(),
  inspection: inspectionSchema.nullable(),
  calibration: calibrationSchema.nullable(),
  createdAt: z.string(),
});
export const slotSchema = z.object({ id: uuid, itemId: uuid, name: key });
export const bindingInput = z
  .object({
    slotId: uuid,
    modelAssetId: uuid,
    materialIndex: z.number().int().nonnegative(),
    nodeIndex: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();
export const bindingSchema = bindingInput.extend({ id: uuid, itemId: uuid });
export const materialInput = z
  .object({
    name: key,
    baseColor: color,
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
    opacity: z.number().min(0).max(1),
    textures: z
      .array(
        z
          .object({
            channel: z.enum(["BASE_COLOR", "NORMAL", "ROUGHNESS"]),
            assetId: uuid,
          })
          .strict(),
      )
      .max(3)
      .default([]),
  })
  .strict();
export const materialSchema = materialInput.extend({
  id: uuid,
  itemId: uuid,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const overrideSchema = z
  .object({
    slotId: uuid,
    materialId: optionalReference,
    baseColor: color.nullable().default(null),
  })
  .strict()
  .refine(
    (v) => (v.materialId === null) !== (v.baseColor === null),
    "Choose a material or a color",
  );
export const currencySchema = z
  .string()
  .refine(
    (c) => Intl.supportedValuesOf("currency").includes(c),
    "Unsupported currency",
  );
export const variantInput = z
  .object({
    name: key,
    sku: optionalSku,
    priceMinor: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable()
      .default(null),
    currency: currencySchema.nullable().default(null),
    color: z.string().max(120).nullable().default(null),
    finish: z.string().max(120).nullable().default(null),
    thumbnailAssetId: optionalReference,
    status: z.enum(["ACTIVE", "INACTIVE"]),
    overrides: z.array(overrideSchema).max(100).default([]),
  })
  .strict();
export const variantSchema = variantInput.extend({
  // Read-only compatibility projection; geometry is owned by Item.
  width: positive.nullable(),
  depth: positive.nullable(),
  height: positive.nullable(),
  modelAssetId: z.null(),
  priceMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  priceOverrideMinor: z.number().int().nonnegative().nullable(),
  currencyOverride: currencySchema.nullable(),
  effectiveSku: z.string().nullable(),
  id: uuid,
  itemId: uuid,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const itemInput = z
  .object({
    name: key,
    description: z.string().max(10000).default(""),
    itemCode: z
      .preprocess(emptyToNull, z.string().trim().max(120).nullable())
      .default(null),
    brandId: key,
    categoryId: key,
    baseModelAssetId: optionalReference,
    width: positive.nullable().default(null),
    depth: positive.nullable().default(null),
    height: positive.nullable().default(null),
    basePriceMinor: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .nullable()
      .default(null),
    currency: currencySchema.default("ILS"),
    samePriceForAllColors: z.boolean().default(true),
    thumbnailAssetId: optionalReference,
    defaultVariantId: optionalReference,
    status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("DRAFT"),
  })
  .strict();
export const setupStepSchema = z.enum([
  "INFORMATION",
  "MODEL",
  "DIMENSIONS",
  "COLOR_TARGETS",
  "COLORS",
  "PRICING",
  "THUMBNAIL",
  "REVIEW",
]);
export const setupIssueSchema = z.object({
  code: z.string(),
  step: setupStepSchema,
  message: z.string(),
  field: z.string().optional(),
});
export const setupSchema = z.object({
  productInfoComplete: z.boolean(),
  modelUploaded: z.boolean(),
  modelValid: z.boolean(),
  dimensionsConfirmed: z.boolean(),
  colorTargetsConfigured: z.boolean(),
  hasActiveColor: z.boolean(),
  defaultColorValid: z.boolean(),
  basePriceValid: z.boolean(),
  thumbnailReady: z.boolean(),
  publishable: z.boolean(),
  blockingIssues: z.array(setupIssueSchema),
  nextRequiredStep: setupStepSchema,
  steps: z.array(
    z.object({
      id: setupStepSchema,
      complete: z.boolean(),
      accessible: z.boolean(),
    }),
  ),
});
export type ItemSetup = z.infer<typeof setupSchema>;
export type SetupStep = z.infer<typeof setupStepSchema>;
export const dimensionVerificationSchema = z.object({
  dimensionsVerified: z.literal(true),
  dimensionSource: dimensionSourceSchema,
  verifiedByUserId: uuid,
  verifiedAt: z.string(),
  modelAssetId: uuid,
  modelSha256: z.string(),
  orientation: calibrationSchema.shape.orientation,
  canonicalDimensionsMeters: dimensionsMetersSchema,
  metresPerModelUnit: positive,
  renderedBoundsMeters: worldBoundsSchema,
  unusualDimensionsAcknowledged: z.boolean(),
  categoryId: z.string(),
});
export const itemSchema = itemInput.extend({
  dimensionVerification: dimensionVerificationSchema.nullable().optional(),
  calibrationStatus: z.enum(["UNCONFIRMED", "VERIFIED", "INVALID"]).optional(),
  id: uuid,
  createdAt: z.string(),
  updatedAt: z.string(),
  brandName: z.string(),
  categoryName: z.string(),
  usageCount: z.number(),
  setup: setupSchema.optional(),
  thumbnailGeneration: z
    .object({ signature: z.string().nullable(), current: z.boolean() })
    .optional(),
  variants: z.array(variantSchema),
  colors: z.array(variantSchema),
  defaultColor: variantSchema.nullable(),
  dimensions: z
    .object({ width: positive, depth: positive, height: positive })
    .nullable(),
  assets: z.array(assetSchema),
  slots: z.array(slotSchema),
  bindings: z.array(bindingSchema),
  materials: z.array(materialSchema),
});
export const catalogPageSchema = z.object({
  items: z.array(itemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const projectItemInstanceSchema = z
  .object({
    id: uuid,
    floorId: uuid,
    spaceId: uuid.nullable().default(null),
    itemId: uuid,
    variantId: uuid,
    positionX: z.number().finite().min(-1e6).max(1e6),
    positionY: z.number().finite().min(-1e6).max(1e6),
    rotation: z
      .number()
      .finite()
      .min(-Math.PI * 2)
      .max(Math.PI * 2),
  })
  .strict();
export type Item = z.infer<typeof itemSchema>;
export type ItemVariant = z.infer<typeof variantSchema>;
export type ItemAsset = z.infer<typeof assetSchema>;
export type ModelInspection = z.infer<typeof inspectionSchema>;
export type ProjectItemInstance = z.infer<typeof projectItemInstanceSchema>;
export function priceToMinor(input: string, currency: string) {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: currencySchema.parse(currency),
    }).resolvedOptions().maximumFractionDigits ?? 0;
  if (!/^\d+(\.\d+)?$/.test(input))
    throw new Error("Enter a nonnegative decimal price");
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > digits)
    throw new Error(`This currency allows ${digits} decimal places`);
  const result = Number(
    BigInt(whole) * 10n ** BigInt(digits) +
      BigInt(fraction.padEnd(digits, "0") || "0"),
  );
  if (!Number.isSafeInteger(result)) throw new Error("Price is too large");
  return result;
}
export function formatPrice(minor: number, currency: string) {
  const nf = new Intl.NumberFormat(undefined, { style: "currency", currency });
  return nf.format(
    minor / 10 ** (nf.resolvedOptions().maximumFractionDigits ?? 0),
  );
}
export function calibratedDimensions(asset: ItemAsset) {
  if (!asset.inspection || !asset.calibration) return null;
  const d = asset.inspection.dimensions,
    s = asset.calibration.metresPerModelUnit,
    swap = asset.calibration.orientation % 180 !== 0;
  return {
    width: (swap ? d.depth : d.width) * s,
    depth: (swap ? d.width : d.depth) * s,
    height: d.height * s,
  };
}

export const dimensionsInput = z
  .object({
    width: positive,
    depth: positive,
    height: positive,
    orientation: calibrationSchema.shape.orientation,
    confirmed: z.literal(true),
    dimensionSource: dimensionSourceSchema,
    dimensionsVerified: z.literal(true),
    unusualDimensionsAcknowledged: z.boolean().default(false),
    renderedBoundsMeters: worldBoundsSchema,
  })
  .strict();
export const colorTargetsInput = z
  .object({
    targets: z
      .array(
        z
          .object({
            materialIndex: z.number().int().nonnegative(),
            nodeIndex: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export const simpleColorInput = variantInput
  .extend({
    baseColor: color.optional(),
    textureAssetId: optionalReference.optional(),
  })
  .strict();
export function uniformCalibration(
  source: ModelInspection["dimensions"],
  input: Pick<
    z.infer<typeof dimensionsInput>,
    "width" | "depth" | "height" | "orientation" | "confirmed"
  >,
) {
  const swap = input.orientation % 180 !== 0;
  const ratios = [
    input.width / (swap ? source.depth : source.width),
    input.depth / (swap ? source.width : source.depth),
    input.height / source.height,
  ];
  const scale = ratios.reduce((a, b) => a + b, 0) / 3;
  if (
    !Number.isFinite(scale) ||
    scale <= 0 ||
    scale > 10000 ||
    ratios.some((r) => Math.abs(r / scale - 1) > 0.01)
  )
    throw new Error("MODEL_DIMENSION_PROPORTION_MISMATCH");
  return calibrationSchema.parse({
    metresPerModelUnit: scale,
    orientation: input.orientation,
    confirmed: true,
  });
}

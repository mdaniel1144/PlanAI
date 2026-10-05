import type { ZodError } from "zod";

export class ItemError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly blockingIssues?: import("@habitat/domain").ItemSetup["blockingIssues"],
  ) {
    super(message);
  }
}
export function fail(code: string, message: string, status = 400): never {
  throw new ItemError(status, code, message);
}

// Include the failed field in the message consumed by the editor. Zod's
// unrecognized_keys issues have an empty path, so preserve their keys as well.
export function catalogValidationError(error: ZodError) {
  const labels: Record<string, string> = {
    name: "Product / color name",
    description: "Description",
    itemCode: "Product code",
    brandId: "Brand",
    categoryId: "Category",
    width: "Real width",
    depth: "Real depth",
    height: "Real height",
    orientation: "Orientation",
    confirmed: "Dimension confirmation",
    basePriceMinor: "Base price",
    priceMinor: "Color price",
    currency: "Currency",
    sku: "Color SKU",
    baseColor: "Color",
    defaultVariantId: "Default color",
    baseModelAssetId: "3D model",
    thumbnailAssetId: "Cover image",
    textureAssetId: "Texture",
    materialId: "Appearance",
    assetId: "Texture image",
    slotId: "Color parts",
    modelAssetId: "3D model",
  };
  const issues = error.issues
    .toSorted(
      (a, b) =>
        Number(b.code === "unrecognized_keys") -
        Number(a.code === "unrecognized_keys"),
    )
    .flatMap((issue) => {
      if (issue.code === "unrecognized_keys")
        return issue.keys.map((key) => ({
          field: [...issue.path, key].join("."),
          message: `Unsupported field “${key.slice(0, 80)}”. Reload the editor and try again.`,
        }));
      const key = String(issue.path.at(-1) ?? ""),
        label = labels[key] ?? (issue.path.join(".") || "Product details");
      let message = issue.message;
      if (issue.code === "invalid_format" && issue.format === "uuid")
        return [
          {
            field: issue.path.join("."),
            message:
              key === "defaultVariantId"
                ? "Choose an available default color."
                : `${label}: Choose an available option from this product.`,
          },
        ];
      if (issue.code !== "too_big" && key === "brandId")
        message = "Choose a brand before saving.";
      else if (issue.code !== "too_big" && key === "categoryId")
        message = "Choose a category before saving.";
      else if (key === "name" && issue.code === "too_small")
        message = "Enter a name containing more than spaces.";
      else if (["width", "depth", "height"].includes(key))
        message = "Enter a positive, finite dimension (up to 1,000,000 cm).";
      else if (key === "confirmed")
        message = "Confirm that you have checked the real product dimensions.";
      else if (key === "orientation")
        message = "Choose 0°, 90°, 180°, or 270°.";
      return [{ field: issue.path.join("."), message: `${label}: ${message}` }];
    });
  const fields = issues.map((issue) => issue.field),
    paths = fields.flatMap((field) => field.split("."));
  const code = paths.some((p) =>
    ["basePriceMinor", "priceMinor", "currency"].includes(p),
  )
    ? "ITEM_PRICE_INVALID"
    : paths.includes("defaultVariantId")
      ? "ITEM_DEFAULT_COLOR_INVALID"
      : paths.some((p) => ["width", "depth", "height"].includes(p))
        ? "ITEM_DIMENSIONS_INVALID"
        : paths.includes("overrides")
          ? "ITEM_VARIANT_MATERIAL_INVALID"
          : "ITEM_REQUEST_INVALID";
  return {
    code,
    error: issues
      .slice(0, 3)
      .map((i) => i.message)
      .join(" "),
    fields,
    issues,
  };
}

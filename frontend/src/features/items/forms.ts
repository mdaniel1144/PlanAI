import { currencySchema, priceToMinor } from "@habitat/domain";
export const optionalString = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};
export const optionalId = optionalString;
export function optionalNumber(value: unknown): number | null {
  const text = optionalString(value);
  if (text === null) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error("Enter a finite number.");
  return number;
}
export class FormInputError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}
export function moneyInput(value: unknown, currency: unknown): number | null {
  const text = optionalString(value);
  if (text === null) return null;
  const code = optionalString(currency)?.toUpperCase();
  if (!currencySchema.safeParse(code).success)
    throw new FormInputError(
      "currency",
      "Choose a supported three-letter currency, such as ILS, USD, or EUR.",
    );
  const normalized = text.replace(
    /^(\d{1,3}(,\d{3})+)(\.\d+)?$/,
    (_, whole: string, _groups: string, fraction: string | undefined) =>
      whole.replaceAll(",", "") + (fraction ?? ""),
  );
  try {
    return priceToMinor(normalized, code!);
  } catch {
    throw new FormInputError(
      "price",
      "Enter a non-negative price with the correct number of decimal places for this currency.",
    );
  }
}
// Only optional references are normalized. Required IDs stay required; arbitrary
// nonempty strings still reach strict server validation and same-Item checks.
const nullableFields = new Set([
  "defaultVariantId",
  "baseModelAssetId",
  "thumbnailAssetId",
  "textureAssetId",
  "materialId",
  "sku",
  "itemCode",
]);
export function normalizeCatalogForm(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCatalogForm);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([key, v]) => [
          key,
          nullableFields.has(key) ? optionalString(v) : normalizeCatalogForm(v),
        ]),
    );
  return value;
}

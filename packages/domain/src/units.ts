import { z } from "zod";
export const lengthDisplayUnitSchema = z.enum(["CM", "M"]);
export type LengthDisplayUnit = z.infer<typeof lengthDisplayUnitSchema>;
// Domain, API and world coordinates are always metres; only presentation converts.
export const metersToDisplayLength = (
  meters: number,
  unit: LengthDisplayUnit,
) => meters * (unit === "CM" ? 100 : 1);
export const displayLengthToMeters = (
  display: number,
  unit: LengthDisplayUnit,
) => display / (unit === "CM" ? 100 : 1);
export const lengthUnitLabel = (unit: LengthDisplayUnit) =>
  unit === "CM" ? "cm" : "m";
export function lengthInputValue(
  meters: number | null | undefined,
  unit: LengthDisplayUnit,
) {
  return meters == null
    ? ""
    : String(Number(metersToDisplayLength(meters, unit).toPrecision(12)));
}
export function formatLengthValue(meters: number, unit: LengthDisplayUnit) {
  return new Intl.NumberFormat("en", {
    useGrouping: false,
    minimumFractionDigits: unit === "M" ? 2 : 0,
    maximumFractionDigits: unit === "M" ? 4 : 2,
  }).format(metersToDisplayLength(meters, unit));
}
export const formatLength = (meters: number, unit: LengthDisplayUnit) =>
  `${formatLengthValue(meters, unit)} ${lengthUnitLabel(unit)}`;
export function parseDisplayLength(input: string, unit: LengthDisplayUnit) {
  if (!input.trim() || !Number.isFinite(Number(input)))
    throw new Error("Enter a finite length.");
  return displayLengthToMeters(Number(input), unit);
}

import { useContext } from "react";
import { AuthContext } from "../auth/context";
import {
  formatLength,
  formatLengthValue,
  lengthInputValue,
  lengthUnitLabel,
  metersToDisplayLength,
  parseDisplayLength,
  displayLengthToMeters,
} from "@habitat/domain";
export function useUnits() {
  const unit = useContext(AuthContext)?.user?.lengthDisplayUnit ?? "CM";
  return {
    unit,
    label: lengthUnitLabel(unit),
    format: (n: number) => formatLength(n, unit),
    value: (n: number) => formatLengthValue(n, unit),
    input: (n: number | null | undefined) => lengthInputValue(n, unit),
    toDisplay: (n: number) => metersToDisplayLength(n, unit),
    toMeters: (n: number) => displayLengthToMeters(n, unit),
    parse: (s: string) => parseDisplayLength(s, unit),
  };
}

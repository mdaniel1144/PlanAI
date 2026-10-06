import { useState, type InputHTMLAttributes } from "react";
import { useUnits } from "./useUnits";
// Canonical values cross this component's boundary. A unit switch never reinterprets draft numbers.
export function LengthInput({
  meters,
  onMetersChange,
  onMetersCommit,
  onEmpty,
  compact = false,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "onBlur"
> & {
  meters: number | null;
  onMetersChange?: (n: number) => void;
  onMetersCommit?: (n: number | null) => void;
  onEmpty?: () => void;
  compact?: boolean;
}) {
  const u = useUnits();
  const basis = `${u.unit}:${meters}`;
  const [draft, setDraft] = useState<{ basis: string; text: string } | null>(
    null,
  );
  const formatted =
    compact && meters != null
      ? String(Number(u.value(meters)))
      : u.input(meters);
  const value = draft?.basis === basis ? draft.text : formatted;
  return (
    <input
      {...props}
      type="number"
      step={props.step ?? "any"}
      value={value}
      onChange={(e) => {
        const text = e.target.value;
        const next =
          text !== "" && Number.isFinite(Number(text)) ? u.parse(text) : null;
        setDraft({
          basis: onMetersChange && next !== null ? `${u.unit}:${next}` : basis,
          text,
        });
        if (text === "") onEmpty?.();
        else if (Number.isFinite(Number(text))) onMetersChange?.(u.parse(text));
      }}
      onBlur={() => {
        if (compact) setDraft(null);
        if (value === formatted) return;
        if (value === "") onMetersCommit?.(null);
        else if (Number.isFinite(Number(value)))
          onMetersCommit?.(u.parse(value));
      }}
    />
  );
}

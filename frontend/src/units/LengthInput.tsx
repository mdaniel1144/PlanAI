import { useState, type InputHTMLAttributes } from "react";
import { useUnits } from "./useUnits";
// Canonical values cross this component's boundary. A unit switch never reinterprets draft numbers.
export function LengthInput({
  meters,
  onMetersChange,
  onMetersCommit,
  onEmpty,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange" | "onBlur"
> & {
  meters: number | null;
  onMetersChange?: (n: number) => void;
  onMetersCommit?: (n: number | null) => void;
  onEmpty?: () => void;
}) {
  const u = useUnits();
  const basis = `${u.unit}:${meters}`;
  const [draft, setDraft] = useState<{ basis: string; text: string } | null>(
    null,
  );
  const value = draft?.basis === basis ? draft.text : u.input(meters);
  return (
    <input
      {...props}
      type="number"
      step={props.step ?? "any"}
      value={value}
      onChange={(e) => {
        const text = e.target.value;
        setDraft({ basis, text });
        if (text === "") onEmpty?.();
        else if (Number.isFinite(Number(text))) onMetersChange?.(u.parse(text));
      }}
      onBlur={() => {
        if (value === u.input(meters)) return;
        if (value === "") onMetersCommit?.(null);
        else if (Number.isFinite(Number(value)))
          onMetersCommit?.(u.parse(value));
      }}
    />
  );
}

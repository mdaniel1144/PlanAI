import { useUnits } from "../../units/useUnits";
import { useState } from "react";
import {
  windowWorldElevationFromSill,
  windowSillFromWorldElevation,
  windowTopFromHeight,
  windowHeightFromWorldElevations,
  type WindowSillReference,
} from "@habitat/geometry";

export function WindowElevationSummary({
  reference,
  bottom,
  top,
  prefix = "window",
}: {
  reference: WindowSillReference | null;
  bottom: number | null;
  top: number | null;
  prefix?: string;
}) {
  const u = useUnits();
  const display = (n: number | null) =>
    n === null ? "Unknown" : `${n >= 0 ? "+" : ""}${u.format(n)}`;
  return (
    <div className="window-elevation-summary">
      <p data-testid={`${prefix}-reference`}>
        {reference?.elevation != null
          ? `Relative to: ${reference.source === "space" ? "Space" : "Floor"} ${reference.name} ${display(reference.elevation)}`
          : "No reliable sill reference"}
      </p>
      {reference?.note && <p className="small muted">{reference.note}</p>}
      <p>
        World: Bottom{" "}
        <output data-testid={`${prefix}-world-bottom`}>
          {display(bottom)}
        </output>{" "}
        · Top{" "}
        <output data-testid={`${prefix}-world-top`}>{display(top)}</output>
      </p>
    </div>
  );
}

/** Draft inputs give live arithmetic feedback; only an actual edit commits world geometry. */
export function WindowVerticalFields({
  reference,
  bottom,
  top,
  onChange,
}: {
  reference: WindowSillReference;
  bottom: number | null;
  top: number | null;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const u = useUnits();
  const input = u.input,
    number = (s: string) => (s === "" ? null : u.parse(s));
  const basis = JSON.stringify([bottom, top, reference.elevation, u.unit]);
  const initial = {
    sill: input(windowSillFromWorldElevation(bottom, reference.elevation)),
    height: input(windowHeightFromWorldElevations(bottom, top)),
    bottom: input(bottom),
    top: input(top),
  };
  const [draft, setDraft] = useState<{
    basis: string;
    values: typeof initial;
  } | null>(null);
  const [worldMode, setWorldMode] = useState(false);
  const values = draft?.basis === basis ? draft.values : initial;
  const usesWorld = worldMode || reference.elevation === null;
  const liveBottom = usesWorld
    ? number(values.bottom)
    : windowWorldElevationFromSill(reference.elevation, number(values.sill));
  const liveTop = usesWorld
    ? number(values.top)
    : windowTopFromHeight(liveBottom, number(values.height));
  const commit = () => {
    const keys = usesWorld
      ? (["bottom", "top"] as const)
      : (["sill", "height"] as const);
    if (!keys.some((key) => values[key] !== initial[key])) return;
    onChange({
      verticalReference: "WORLD",
      bottomElevation: liveBottom,
      topElevation: liveTop,
      height: null,
      sillHeight: null,
    });
    setDraft(null);
  };
  const field = (key: keyof typeof initial, label: string) => (
    <label className="field-label">
      {label.replace("(m)", `(${u.label})`)}
      <input
        aria-label={label.replace("(m)", `(${u.label})`)}
        type="number"
        step=".01"
        placeholder="Unknown"
        value={values[key]}
        onChange={(e) =>
          setDraft({ basis, values: { ...values, [key]: e.target.value } })
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
  return (
    <>
      {!usesWorld && (
        <>
          {field("sill", "Sill Height (m)")}
          {field("height", "Window Height (m)")}
        </>
      )}
      <WindowElevationSummary
        reference={reference}
        bottom={liveBottom}
        top={liveTop}
      />
      <p data-testid="window-height">
        Derived height:{" "}
        {windowHeightFromWorldElevations(liveBottom, liveTop) == null
          ? "Unknown"
          : u.format(windowHeightFromWorldElevations(liveBottom, liveTop)!)}
      </p>
      {reference.elevation === null ? (
        <div className="window-world-fields">
          <p>Enter explicit world elevations.</p>
          {field("bottom", "Window bottom elevation (m)")}
          {field("top", "Window top elevation (m)")}
        </div>
      ) : (
        <details className="window-world-fields">
          <summary>Advanced world elevations</summary>
          <label className="field-label">
            <input
              type="checkbox"
              aria-label="Edit window world elevations"
              checked={worldMode}
              onChange={(e) => {
                setDraft(null);
                setWorldMode(e.target.checked);
              }}
            />
            Edit world elevations directly
          </label>
          {worldMode && (
            <>
              {field("bottom", "Window bottom elevation (m)")}
              {field("top", "Window top elevation (m)")}
            </>
          )}
        </details>
      )}
    </>
  );
}

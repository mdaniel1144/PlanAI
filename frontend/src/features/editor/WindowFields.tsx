import { useUnits } from "../../units/useUnits";
import { useState } from "react";
import {
  newWindowAssembly,
  windowSchema,
  windowOperationSchema,
  windowProfileSchema,
  windowGlazingSchema,
  windowShutterSchema,
  windowScreenSchema,
  type Window,
  type Floor,
  type WindowAssembly,
  type WindowPanel,
} from "@habitat/domain";
import {
  openingElevations,
  visibleGlassSize,
  windowSills,
  windowSillReference,
} from "@habitat/geometry";
import { WindowVerticalFields } from "./WindowElevationFields";
export function WindowFields({
  window: w,
  floor,
  onChange,
}: {
  window: Window;
  floor: Floor;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const u = useUnits();
  const [count, setCount] = useState(w.assembly?.panels?.length ?? 1);
  const [axis, setAxis] = useState("columns");
  const host = floor.walls.find((h) => h.id === w.wallId);
  const z = host
    ? openingElevations(w, host, floor)
    : { bottom: null, top: null, height: null };
  const a = w.assembly;
  const update = (patch: Partial<WindowAssembly>) =>
    a && onChange({ assembly: { ...a, ...patch } });
  const panel = (id: string, patch: Partial<WindowPanel>) =>
    update({
      panels: a!.panels!.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  const num = (
    label: string,
    value: number | null,
    change: (n: number | null) => void,
  ) => (
    <label className="field-label" key={label}>
      {label.replace("(m)", `(${u.label})`)}
      <input
        aria-label={label.replace("(m)", `(${u.label})`)}
        type="number"
        step=".01"
        key={`${w.id}-${label}-${value}-${u.unit}`}
        defaultValue={label.includes("(m)") ? u.input(value) : (value ?? "")}
        placeholder="Unknown"
        onBlur={(e) => {
          if (label.includes("(m)") && e.target.value === u.input(value))
            return;
          const n =
            e.target.value === ""
              ? null
              : label.includes("(m)")
                ? u.parse(e.target.value)
                : Number(e.target.value);
          if (n !== value) change(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
  const select = (
    label: string,
    value: string,
    options: readonly string[],
    change: (value: string) => void,
  ) => (
    <label className="field-label" key={label}>
      {label}
      <select
        aria-label={label.replace("(m)", `(${u.label})`)}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="window-fields">
      <details open>
        <summary>General</summary>
        {select(
          "Window type",
          w.type,
          windowSchema.shape.type.options,
          (type) => onChange({ type }),
        )}
        <WindowVerticalFields
          reference={windowSillReference(floor, host)}
          bottom={z.bottom}
          top={z.top}
          onChange={onChange}
        />
        {host &&
          windowSills(w, host, floor).map((s) => (
            <p key={s.roomId}>
              Sill from {s.name}:{" "}
              {s.sillHeight == null ? "Unknown" : u.format(s.sillHeight)}
            </p>
          ))}
        {!w.verticalReference && (
          <p className="small muted">
            Legacy sill is relative to Floor + wall base. Editing elevations
            converts to world coordinates.
          </p>
        )}
        <p className="small muted">
          Drag along the host wall. Directions follow wall start → end; Wall
          Left is its left normal.
        </p>
      </details>
      {!a ? (
        <>
          <p>Assembly details unknown. Legacy configuration is preserved.</p>
          <button
            className="button"
            onClick={() =>
              onChange({ assembly: newWindowAssembly(crypto.randomUUID()) })
            }
          >
            Configure assembly · one unknown panel
          </button>
        </>
      ) : (
        <>
          <details>
            <summary>Panels</summary>
            <p className="small muted">
              Explicit layout. Columns create mullions; rows create transoms.
              Ratios cover the opening from bottom/start.
            </p>
            <label className="field-label">
              Panel count
              <input
                aria-label="Panel count"
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </label>
            {select("Panel division", axis, ["columns", "rows"], setAxis)}
            <button
              className="button"
              disabled={!Number.isInteger(count) || count < 1 || count > 100}
              onClick={() =>
                update({
                  panels: Array.from({ length: count }, (_, index) => ({
                    ...(a.panels?.[index] ??
                      newWindowAssembly(crypto.randomUUID()).panels![0]),
                    index,
                    region:
                      axis === "columns"
                        ? {
                            x: index / count,
                            y: 0,
                            width: 1 / count,
                            height: 1,
                          }
                        : {
                            x: 0,
                            y: index / count,
                            width: 1,
                            height: 1 / count,
                          },
                  })),
                })
              }
            >
              Apply panel layout
            </button>
            {num("Sliding tracks", a.tracks, (tracks) => update({ tracks }))}
            {a.panels?.map((p) => (
              <fieldset key={p.id} data-panel-id={p.id}>
                <legend>Panel {p.index + 1}</legend>
                {select(
                  `Panel ${p.index + 1} operation`,
                  p.operation,
                  windowOperationSchema.options,
                  (value) =>
                    panel(p.id, {
                      operation: value as WindowPanel["operation"],
                      function: value === "FIXED" ? "FIXED" : "OPERABLE",
                      orientation: null,
                      slideDirection: value === "SLIDING" ? "UNKNOWN" : null,
                    }),
                )}
                {(["x", "y", "width", "height"] as const).map((key) =>
                  num(
                    `Panel ${p.index + 1} ${key} ratio`,
                    p.region[key],
                    (n) => {
                      if (n !== null)
                        panel(p.id, { region: { ...p.region, [key]: n } });
                    },
                  ),
                )}
                {["CASEMENT", "TILT_TURN"].includes(p.operation) && (
                  <>
                    {select(
                      `Panel ${p.index + 1} hinge`,
                      p.orientation?.hingeEndpoint ?? "UNKNOWN",
                      ["UNKNOWN", "PANEL_START", "PANEL_END"],
                      (value) =>
                        panel(p.id, {
                          orientation: {
                            swingSide: p.orientation?.swingSide ?? "UNKNOWN",
                            hingeEndpoint: value as NonNullable<
                              WindowPanel["orientation"]
                            >["hingeEndpoint"],
                          },
                        }),
                    )}
                    {select(
                      `Panel ${p.index + 1} swing`,
                      p.orientation?.swingSide ?? "UNKNOWN",
                      ["UNKNOWN", "WALL_LEFT", "WALL_RIGHT"],
                      (value) =>
                        panel(p.id, {
                          orientation: {
                            hingeEndpoint:
                              p.orientation?.hingeEndpoint ?? "UNKNOWN",
                            swingSide: value as NonNullable<
                              WindowPanel["orientation"]
                            >["swingSide"],
                          },
                        }),
                    )}
                  </>
                )}
                {p.operation === "SLIDING" &&
                  select(
                    `Panel ${p.index + 1} slide direction`,
                    p.slideDirection ?? "UNKNOWN",
                    [
                      "UNKNOWN",
                      "TOWARD_PANEL_START",
                      "TOWARD_PANEL_END",
                      "BIDIRECTIONAL",
                    ],
                    (value) =>
                      panel(p.id, {
                        slideDirection: value as WindowPanel["slideDirection"],
                      }),
                  )}
                <p className="small">
                  Visible glass:{" "}
                  {(() => {
                    const size = visibleGlassSize(w, p, z.height);
                    return size
                      ? `${u.value(size.width)} × ${u.value(size.height)} ${u.label}`
                      : "Unknown profile dimensions";
                  })()}
                </p>
                {select(
                  `Panel ${p.index + 1} glass finish`,
                  p.glazing?.glassFinish ?? "INHERIT",
                  ["INHERIT", ...windowGlazingSchema.shape.glassFinish.options],
                  (value) =>
                    panel(p.id, {
                      glazing:
                        value === "INHERIT"
                          ? null
                          : {
                              ...(p.glazing ?? a.glazing),
                              glassFinish:
                                value as WindowAssembly["glazing"]["glassFinish"],
                            },
                    }),
                )}
              </fieldset>
            ))}
          </details>
          <details>
            <summary>Profile</summary>
            {select(
              "Profile material",
              a.profile.material,
              windowProfileSchema.shape.material.options,
              (value) =>
                update({
                  profile: {
                    ...a.profile,
                    material: value as WindowAssembly["profile"]["material"],
                  },
                }),
            )}
            {(
              [
                "frameFaceWidth",
                "frameDepth",
                "sashFaceWidth",
                "sashDepth",
              ] as const
            ).map((key) =>
              num(`${key} (m)`, a.profile[key], (value) =>
                update({ profile: { ...a.profile, [key]: value } }),
              ),
            )}
            <p className="small muted">
              Blank dimensions are unknown. 3D uses illustrative sizes for
              unknown profiles.
            </p>
          </details>
          <details>
            <summary>Glass</summary>
            {select(
              "Glazing type",
              a.glazing.glazingType,
              windowGlazingSchema.shape.glazingType.options,
              (value) =>
                update({
                  glazing: {
                    ...a.glazing,
                    glazingType:
                      value as WindowAssembly["glazing"]["glazingType"],
                  },
                }),
            )}
            {select(
              "Glass finish",
              a.glazing.glassFinish,
              windowGlazingSchema.shape.glassFinish.options,
              (value) =>
                update({
                  glazing: {
                    ...a.glazing,
                    glassFinish:
                      value as WindowAssembly["glazing"]["glassFinish"],
                  },
                }),
            )}
            {(["glassThickness", "overallGlazingThickness"] as const).map(
              (key) =>
                num(`${key} (m)`, a.glazing[key], (value) =>
                  update({ glazing: { ...a.glazing, [key]: value } }),
                ),
            )}
          </details>
          <details>
            <summary>Shutter</summary>
            {select(
              "Shutter type",
              a.shutter.type,
              windowShutterSchema.shape.type.options,
              (value) =>
                update({
                  shutter: {
                    ...a.shutter,
                    type: value as WindowAssembly["shutter"]["type"],
                    ...(value === "NONE"
                      ? { operation: "UNKNOWN", boxType: "NONE" }
                      : value === "UNKNOWN"
                        ? { operation: "UNKNOWN" }
                        : {}),
                  },
                }),
            )}
            {a.shutter.type !== "NONE" && (
              <>
                {select(
                  "Shutter operation",
                  a.shutter.operation,
                  windowShutterSchema.shape.operation.options,
                  (value) =>
                    update({
                      shutter: {
                        ...a.shutter,
                        operation:
                          value as WindowAssembly["shutter"]["operation"],
                      },
                    }),
                )}
                {select(
                  "Shutter box",
                  a.shutter.boxType,
                  windowShutterSchema.shape.boxType.options,
                  (value) =>
                    update({
                      shutter: {
                        ...a.shutter,
                        boxType: value as WindowAssembly["shutter"]["boxType"],
                      },
                    }),
                )}
                <p className="small muted">
                  Box requirement only; dimensions unknown.
                </p>
              </>
            )}
          </details>
          <details>
            <summary>Screen</summary>
            {select(
              "Screen type",
              a.screen.type,
              windowScreenSchema.shape.type.options,
              (value) =>
                update({
                  screen: { type: value as WindowAssembly["screen"]["type"] },
                }),
            )}
            <p className="small muted">
              Architectural requirement; product compatibility is not assessed.
            </p>
          </details>
        </>
      )}
    </div>
  );
}

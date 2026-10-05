import { useUnits } from "../../units/useUnits";
import { LengthInput } from "../../units/LengthInput";
import { WindowFields } from "./WindowFields";
import { useState } from "react";
import {
  clearHeight,
  roomSchema,
  type Entity,
  type Floor,
} from "@habitat/domain";
import {
  distance,
  exactEndpoint,
  flipHinge,
  flipSwing,
} from "@habitat/geometry";
export function ArchitectureFields({
  entity: e,
  floor,
  onChange,
  onDelete,
}: {
  entity: Entity;
  floor: Floor;
  onChange: (p: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const u = useUnits();
  const [moveX, setMoveX] = useState<number | null>(0),
    [moveY, setMoveY] = useState<number | null>(0);
  const number = (
    label: string,
    value: number | null,
    change: (n: number) => void,
    min?: number,
  ) => (
    <label className="field-label">
      {label.replace("(m", `(${u.label}`)}
      <input
        aria-label={label.replace("(m", `(${u.label}`)}
        type="number"
        step=".01"
        min={min == null ? undefined : u.toDisplay(min)}
        defaultValue={u.input(value)}
        key={`${e.id}-${label}-${value}-${u.unit}`}
        onBlur={(event) => {
          if (
            event.target.value !== u.input(value) &&
            event.target.value !== "" &&
            Number.isFinite(Number(event.target.value)) &&
            u.parse(event.target.value) !== value
          )
            change(u.parse(event.target.value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
  return (
    <div className="property-section architecture-fields">
      <div className="section-title">Architectural editing</div>
      {e.kind === "wall" && (
        <>
          {number(
            "Wall length (m)",
            distance(e.start, e.end),
            (length) => {
              if (length > 0)
                onChange({ end: exactEndpoint(e.start, e.end, length) });
            },
            0.01,
          )}
          {(["start", "end"] as const).map((endpoint, index) => (
            <div className="coordinate-pair" key={endpoint}>
              {number(`Endpoint ${index + 1} X`, e[endpoint].x, (x) =>
                onChange({ [endpoint]: { ...e[endpoint], x } }),
              )}
              {number(`Endpoint ${index + 1} Y`, e[endpoint].y, (y) =>
                onChange({ [endpoint]: { ...e[endpoint], y } }),
              )}
            </div>
          ))}
          <label className="field-label">
            Wall type
            <select
              aria-label="Wall type"
              value={e.type}
              onChange={(event) => onChange({ type: event.target.value })}
            >
              {["interior", "exterior", "unknown"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="coordinate-pair">
            <label>
              Move X ({u.label})
              <LengthInput
                aria-label="Move wall X"
                step=".1"
                meters={moveX}
                onMetersChange={setMoveX}
                onEmpty={() => setMoveX(null)}
              />
            </label>
            <label>
              Move Y ({u.label})
              <LengthInput
                aria-label="Move wall Y"
                step=".1"
                meters={moveY}
                onMetersChange={setMoveY}
                onEmpty={() => setMoveY(null)}
              />
            </label>
          </div>
          <button
            className="button"
            onClick={() =>
              onChange({
                start: {
                  x: e.start.x + Number(moveX),
                  y: e.start.y + Number(moveY),
                },
                end: { x: e.end.x + Number(moveX), y: e.end.y + Number(moveY) },
              })
            }
          >
            Move whole wall
          </button>
          <p className="small muted">
            Drag the wall or endpoint handles. Connected endpoints move
            together; hosted openings stay attached.
          </p>
        </>
      )}
      {"wallId" in e && (
        <>
          <p>
            Host:{" "}
            {floor.walls.find((w) => w.id === e.wallId)?.name ?? "Missing host"}
          </p>
          {number(
            `Position (m, ${e.positionReference ? "opening start" : "legacy centre"})`,
            e.positionAlongWall,
            (positionAlongWall) => onChange({ positionAlongWall }),
            0,
          )}
          {number(
            "Opening width (m)",
            e.width,
            (width) => onChange({ width }),
            0.01,
          )}
          {e.kind !== "window" &&
            number(
              "Opening height (m)",
              e.height,
              (height) => onChange({ height }),
              0.01,
            )}
        </>
      )}
      {e.kind === "window" && (
        <WindowFields key={e.id} window={e} floor={floor} onChange={onChange} />
      )}
      {e.kind === "door" && (
        <>
          <label className="field-label">
            Door type
            <select
              aria-label="Door type"
              value={e.type}
              onChange={(event) =>
                onChange({ type: event.target.value, hingedOrientation: null })
              }
            >
              {["hinged", "sliding", "unknown"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {e.type === "hinged" && (
            <>
              {!e.hingedOrientation ? (
                <>
                  <p>
                    Orientation unknown. Legacy direction is not interpreted.
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      onChange({
                        hingedOrientation: {
                          hingeEndpoint: "OPENING_START",
                          swingSide: "WALL_LEFT",
                        },
                      })
                    }
                  >
                    Set Opening Start / Wall Left
                  </button>
                </>
              ) : (
                <>
                  <label className="field-label">
                    Hinge
                    <select
                      aria-label="Door hinge"
                      value={e.hingedOrientation.hingeEndpoint}
                      onChange={(event) =>
                        onChange({
                          hingedOrientation: {
                            ...e.hingedOrientation,
                            hingeEndpoint: event.target.value,
                          },
                        })
                      }
                    >
                      <option value="OPENING_START">Opening Start</option>
                      <option value="OPENING_END">Opening End</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Swing
                    <select
                      aria-label="Door swing"
                      value={e.hingedOrientation.swingSide}
                      onChange={(event) =>
                        onChange({
                          hingedOrientation: {
                            ...e.hingedOrientation,
                            swingSide: event.target.value,
                          },
                        })
                      }
                    >
                      <option value="WALL_LEFT">Wall Left</option>
                      <option value="WALL_RIGHT">Wall Right</option>
                    </select>
                  </label>
                  <div className="coordinate-pair">
                    <button
                      className="button"
                      onClick={() =>
                        onChange({
                          hingedOrientation: flipHinge(e).hingedOrientation,
                        })
                      }
                    >
                      Flip hinge
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        onChange({
                          hingedOrientation: flipSwing(e).hingedOrientation,
                        })
                      }
                    >
                      Flip swing
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      {e.kind === "room" && (
        <>
          <label className="field-label">
            Space name
            <input
              aria-label="Space name"
              key={`${e.id}-${e.name}`}
              defaultValue={e.name}
              onBlur={(event) => {
                if (event.target.value.trim() && event.target.value !== e.name)
                  onChange({ name: event.target.value.trim() });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </label>
          <label className="field-label">
            Space type
            <select
              aria-label="Space type"
              value={e.type}
              onChange={(event) => onChange({ type: event.target.value })}
            >
              {roomSchema.shape.type.options.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <div className="property-row">
            <span>Enclosure Status</span>
            <span>{e.enclosureStatus ?? "Unknown"}</span>
          </div>
          {(["floorElevation", "ceilingElevation"] as const).map((key) => (
            <label className="field-label" key={key}>
              {key === "floorElevation"
                ? "Floor Elevation"
                : "Ceiling Elevation"}{" "}
              ({u.label})
              <input
                aria-label={
                  key === "floorElevation"
                    ? "Space floor elevation"
                    : "Space ceiling elevation"
                }
                type="number"
                step=".01"
                key={`${e.id}-${key}-${e[key]}-${u.unit}`}
                defaultValue={u.input(e[key])}
                placeholder="Unknown"
                onBlur={(event) => {
                  if (event.target.value === u.input(e[key])) return;
                  const value =
                    event.target.value === ""
                      ? null
                      : u.parse(event.target.value);
                  if (value !== e[key]) onChange({ [key]: value });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          ))}
          <div className="property-row">
            <span>Clear Height</span>
            <span data-testid="space-clear-height">
              {clearHeight(e) === null ? "Unknown" : u.format(clearHeight(e)!)}
            </span>
          </div>
          <div className="property-row">
            <span>Boundary Wall Count</span>
            <span>{e.boundaryWallIds?.length ?? "Unknown"}</span>
          </div>
          <div className="property-row">
            <span>Open Boundary Count</span>
            <span>
              {e.boundaryEdges?.filter((edge) => edge.kind === "OPEN").length ??
                "Unknown"}
            </span>
          </div>
          <p className="small muted">
            {e.topology
              ? "Space discovered from walls. Edit walls to change its boundary."
              : "Existing authored boundary"}
          </p>
        </>
      )}
      <button
        className="button danger"
        disabled={e.kind === "room" && !!e.topology}
        onClick={onDelete}
      >
        Delete selected
      </button>
    </div>
  );
}

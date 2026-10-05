import { useUnits } from "../../units/useUnits";
import {
  MousePointer2,
  Hand,
  PencilRuler,
  DoorOpen,
  AppWindow,
  Ruler,
  Trash2,
  Undo2,
  Redo2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { roomSchema, windowSchema } from "@habitat/domain";
import { distance, exactEndpoint } from "@habitat/geometry";
import { WindowElevationSummary } from "./WindowElevationFields";
import type { DrawingEditor } from "./useDrawing";
export function DrawingControls({
  drawing: d,
  tool,
}: {
  drawing: DrawingEditor;
  tool: string;
}) {
  const u = useUnits();
  return (
    <div className="canvas-tools">
      <div
        className="canvas-tool-buttons"
        role="toolbar"
        aria-label="Architectural tools"
        aria-orientation="vertical"
      >
        {[
          {
            key: "select",
            label: "Select",
            shortcut: "V",
            icon: MousePointer2,
          },
          { key: "pan", label: "Pan", shortcut: "H", icon: Hand },
          {
            key: "draw-wall",
            label: "Draw wall",
            shortcut: "W",
            icon: PencilRuler,
          },
          { key: "add-door", label: "Add door", shortcut: "D", icon: DoorOpen },
          {
            key: "add-window",
            label: "Add window",
            shortcut: "N",
            icon: AppWindow,
          },
          { key: "measure", label: "Measure", shortcut: "M", icon: Ruler },
          { key: "delete", label: "Delete", shortcut: "", icon: Trash2 },
        ].map(({ key, label, shortcut, icon: Icon }) => (
          <button
            key={key}
            title={`${label}${shortcut ? ` (${shortcut})` : ""}`}
            aria-label={label}
            className={tool === key ? "active" : ""}
            aria-pressed={tool === key}
            disabled={d.busy}
            onClick={() => d.activate(key)}
          >
            <Icon size={18} />
          </button>
        ))}
        <span className="tool-divider" />
        <button
          disabled={!d.canUndo || d.busy}
          onClick={d.undo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          disabled={!d.canRedo || d.busy}
          onClick={d.redo}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
      </div>
      {tool === "select" && (
        <details className="tool-settings">
          <summary aria-label="Advanced geometry" title="Advanced geometry">
            <SlidersHorizontal size={18} />
          </summary>
          <div className="tool-settings-panel">
            <p>Spaces appear automatically from walls.</p>
            <button onClick={() => d.activate("manual-room")}>
              Manual boundary
            </button>
          </div>
        </details>
      )}
      {[
        "draw-wall",
        "manual-room",
        "add-door",
        "add-window",
        "measure",
      ].includes(tool) && (
        <details
          className={`tool-settings ${tool === "add-window" ? "window-placement" : ""}`}
          key={tool}
          open={tool === "add-window" ? true : undefined}
        >
          <summary aria-label="Tool settings" title="Tool settings">
            <SlidersHorizontal size={18} />
          </summary>
          <fieldset className="tool-settings-panel" disabled={d.busy}>
            {tool === "draw-wall" && (
              <div className="tool-fields">
                <strong>Creation defaults · user input</strong>
                <label>
                  Thickness ({u.label})
                  <input
                    aria-label="Creation wall thickness"
                    type="number"
                    min={u.toDisplay(0.01)}
                    step=".01"
                    value={u.input(d.wallDefaults.thickness)}
                    onChange={(e) =>
                      d.setWallDefaults((v) => ({
                        ...v,
                        thickness: u.toMeters(Number(e.target.value)),
                      }))
                    }
                  />
                </label>
                <label>
                  Height ({u.label})
                  <input
                    aria-label="Creation wall height"
                    type="number"
                    min={u.toDisplay(0.01)}
                    step=".1"
                    value={u.input(d.wallDefaults.height)}
                    onChange={(e) =>
                      d.setWallDefaults((v) => ({
                        ...v,
                        height: u.toMeters(Number(e.target.value)),
                      }))
                    }
                  />
                </label>
                <select
                  aria-label="Creation wall type"
                  value={d.wallDefaults.type}
                  onChange={(e) =>
                    d.setWallDefaults((v) => ({
                      ...v,
                      type: e.target.value as typeof v.type,
                    }))
                  }
                >
                  {["interior", "exterior", "unknown"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <label>
                  Exact length ({u.label})
                  <input
                    aria-label="Exact wall length"
                    inputMode="decimal"
                    value={d.lengthInput ? u.input(Number(d.lengthInput)) : ""}
                    placeholder={
                      d.points[0] && d.pointer
                        ? u.value(distance(d.points[0], d.pointer))
                        : "Click start"
                    }
                    onChange={(e) =>
                      d.setLengthInput(
                        e.target.value ? String(u.parse(e.target.value)) : "",
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && d.points[0] && d.pointer) {
                        e.preventDefault();
                        try {
                          d.addWall(
                            exactEndpoint(
                              d.points[0],
                              d.pointer,
                              Number(d.lengthInput),
                            ),
                          );
                        } catch (error) {
                          d.setError(String(error));
                        }
                      }
                    }}
                  />
                </label>
                <span>
                  {d.points[0] && d.pointer
                    ? `${u.format(distance(d.points[0], d.pointer))} · ${d.interaction.snapLabel}`
                    : "Click each wall endpoint; double-click to finish"}
                </span>
                <button onClick={() => d.activate("select")}>End chain</button>
              </div>
            )}
            {tool === "manual-room" && (
              <div className="tool-fields">
                <span>Click each vertex; double-click the last to finish</span>
                <label>
                  Room name
                  <input
                    aria-label="New room name"
                    value={d.roomName}
                    onChange={(e) => d.setRoomName(e.target.value)}
                  />
                </label>
                <select
                  aria-label="New room type"
                  value={d.roomType}
                  onChange={(e) =>
                    d.setRoomType(e.target.value as typeof d.roomType)
                  }
                >
                  {roomSchema.shape.type.options.map((t) => (
                    <option key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <button
                  className="button primary"
                  disabled={d.points.length < 3}
                  onClick={d.confirmRoom}
                >
                  Confirm room
                </button>
              </div>
            )}
            {(tool === "add-door" || tool === "add-window") && (
              <div className="tool-fields">
                {tool === "add-window" && (
                  <>
                    <div className="window-placement-heading">
                      <strong>
                        <AppWindow size={18} /> Add window
                      </strong>
                      <button
                        aria-label="Cancel window placement"
                        title="Cancel (Esc)"
                        onClick={() => d.activate("select")}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <ol
                      className="window-placement-steps"
                      aria-label="Window placement steps"
                    >
                      <li
                        className={!d.placementLocked ? "current" : "complete"}
                      >
                        Choose a wall
                      </li>
                      <li className={d.placementLocked ? "current" : ""}>
                        Adjust & confirm
                      </li>
                    </ol>
                  </>
                )}
                <span>
                  {tool === "add-window"
                    ? d.placementLocked
                      ? "Position fixed. Adjust values, or click a wall to reposition."
                      : d.floor?.walls.some(
                            (wall) => wall.verification !== "REJECTED",
                          )
                        ? "Hover over a wall to preview. Click to fix the position."
                        : "Draw a wall first, then add a window to it."
                    : d.hostId
                      ? "Move along host, click to place; confirm below"
                      : "Click an existing wall to choose a host"}
                </span>
                {tool === "add-window" && d.hostId && (
                  <div className="window-host" role="status">
                    {d.floor?.walls.find((wall) => wall.id === d.hostId)?.name}{" "}
                    ·{" "}
                    {(() => {
                      const wall = d.floor?.walls.find(
                        (wall) => wall.id === d.hostId,
                      );
                      return wall
                        ? `${u.format(distance(wall.start, wall.end))} long`
                        : "";
                    })()}
                  </div>
                )}
                <label>
                  Width ({u.label})
                  <input
                    aria-label="New opening width"
                    type="number"
                    min={u.toDisplay(0.01)}
                    step=".01"
                    value={u.input(
                      tool === "add-window"
                        ? d.windowDefaults.width
                        : d.doorDefaults.width,
                    )}
                    onChange={(e) =>
                      tool === "add-window"
                        ? d.setWindowDefaults((v) => ({
                            ...v,
                            width: u.toMeters(Number(e.target.value)),
                          }))
                        : d.setDoorDefaults((v) => ({
                            ...v,
                            width: u.toMeters(Number(e.target.value)),
                          }))
                    }
                  />
                </label>
                {tool === "add-door" && (
                  <label>
                    Height ({u.label})
                    <input
                      aria-label="New opening height"
                      type="number"
                      min={u.toDisplay(0.01)}
                      step=".01"
                      value={u.input(d.doorDefaults.height)}
                      onChange={(e) =>
                        d.setDoorDefaults((v) => ({
                          ...v,
                          height: u.toMeters(Number(e.target.value)),
                        }))
                      }
                    />
                  </label>
                )}
                {tool === "add-door" && (
                  <label>
                    Position ({u.label}, opening start)
                    <input
                      aria-label="New opening position"
                      type="number"
                      min="0"
                      step=".01"
                      value={u.input(d.placement)}
                      onChange={(e) =>
                        d.setPlacement(u.toMeters(Number(e.target.value)))
                      }
                    />
                  </label>
                )}
                {tool === "add-door" ? (
                  <>
                    <select
                      aria-label="New door hinge"
                      value={d.doorDefaults.hingeEndpoint}
                      onChange={(e) =>
                        d.setDoorDefaults((v) => ({
                          ...v,
                          hingeEndpoint: e.target
                            .value as typeof v.hingeEndpoint,
                        }))
                      }
                    >
                      <option value="OPENING_START">Opening Start</option>
                      <option value="OPENING_END">Opening End</option>
                    </select>
                    <select
                      aria-label="New door swing"
                      value={d.doorDefaults.swingSide}
                      onChange={(e) =>
                        d.setDoorDefaults((v) => ({
                          ...v,
                          swingSide: e.target.value as typeof v.swingSide,
                        }))
                      }
                    >
                      <option value="WALL_LEFT">Wall Left</option>
                      <option value="WALL_RIGHT">Wall Right</option>
                    </select>
                  </>
                ) : (
                  <>
                    <span className="window-placement-hint">
                      Creation defaults · editable user input
                    </span>
                    {!d.windowUsesWorld &&
                      (["sillHeight", "windowHeight"] as const).map((key) => (
                        <label key={key}>
                          {key === "sillHeight"
                            ? `Sill Height (${u.label})`
                            : `Window Height (${u.label})`}
                          <input
                            aria-label={
                              key === "sillHeight"
                                ? "New window sill height"
                                : "New window height"
                            }
                            type="number"
                            step=".01"
                            min={
                              key === "windowHeight"
                                ? u.toDisplay(0.01)
                                : undefined
                            }
                            value={u.input(d.windowDefaults[key])}
                            placeholder="Unknown"
                            onChange={(e) =>
                              d.setWindowDefaults((v) => ({
                                ...v,
                                [key]:
                                  e.target.value === ""
                                    ? null
                                    : u.toMeters(Number(e.target.value)),
                              }))
                            }
                          />
                        </label>
                      ))}
                    <WindowElevationSummary
                      reference={d.windowReference}
                      bottom={d.windowElevations.bottomElevation}
                      top={d.windowElevations.topElevation}
                      prefix="new-window"
                    />
                    {d.windowUsesWorld && (
                      <div className="window-world-fields">
                        <p>Enter explicit world elevations.</p>
                        {(["bottomElevation", "topElevation"] as const).map(
                          (key) => (
                            <label key={key}>
                              {key === "bottomElevation" ? "Bottom" : "Top"}{" "}
                              world elevation ({u.label})
                              <input
                                aria-label={`New window ${key === "bottomElevation" ? "bottom" : "top"} elevation`}
                                type="number"
                                step=".01"
                                placeholder="Unknown"
                                value={u.input(d.windowWorldValues[key])}
                                onChange={(e) =>
                                  d.setWindowWorldValues((v) => ({
                                    ...v,
                                    [key]:
                                      e.target.value === ""
                                        ? null
                                        : u.toMeters(Number(e.target.value)),
                                  }))
                                }
                              />
                            </label>
                          ),
                        )}
                      </div>
                    )}
                    <label>
                      Window type
                      <select
                        aria-label="New window type"
                        value={d.windowDefaults.type}
                        onChange={(e) =>
                          d.setWindowDefaults((v) => ({
                            ...v,
                            type: e.target.value as typeof v.type,
                          }))
                        }
                      >
                        {windowSchema.shape.type.options.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <details className="window-world-fields">
                      <summary>Advanced placement</summary>
                      <label>
                        Position ({u.label}, opening start)
                        <input
                          aria-label="New opening position"
                          type="number"
                          min="0"
                          step=".01"
                          disabled={!d.placementLocked}
                          value={u.input(d.placement)}
                          onChange={(e) =>
                            d.setPlacement(u.toMeters(Number(e.target.value)))
                          }
                        />
                      </label>
                      {d.windowReference?.elevation != null && (
                        <label>
                          <input
                            aria-label="Edit new window world elevations"
                            type="checkbox"
                            checked={d.windowUsesWorld}
                            onChange={(e) =>
                              d.setWindowWorldMode(e.target.checked)
                            }
                          />
                          Edit world elevations directly
                        </label>
                      )}
                    </details>
                    <p className="window-placement-hint">
                      Edit panels, frame and glass after placing your window.
                    </p>
                  </>
                )}
                {tool === "add-window" && d.windowPlacementError && (
                  <p className="window-placement-error" role="alert">
                    {d.windowPlacementError}
                  </p>
                )}
                {tool === "add-window" && d.windowElevationRequired && (
                  <p className="window-placement-hint">
                    Enter sill and height, or explicit world elevations, before
                    confirming.
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={
                    tool === "add-window" ? !d.windowCanConfirm : !d.hostId
                  }
                  onClick={d.confirmOpening}
                >
                  Confirm {tool === "add-door" ? "door" : "window"}
                </button>
                {tool === "add-window" && (
                  <span className="window-placement-hint">
                    Enter to confirm · Esc to cancel
                  </span>
                )}
              </div>
            )}
            {tool === "measure" && (
              <div className="tool-fields">
                <span>
                  {d.points.length === 2
                    ? u.format(distance(d.points[0], d.points[1]))
                    : "Click two points to measure"}
                </span>
                <button
                  disabled={d.points.length !== 2}
                  onClick={d.createDimension}
                >
                  Create dimension
                </button>
              </div>
            )}
          </fieldset>
        </details>
      )}
      {(d.error || d.message) && (
        <div
          className={d.error ? "drawing-error" : "drawing-notice"}
          role={d.error ? "alert" : "status"}
        >
          {d.error || d.message}
        </div>
      )}
      {d.blocker.state === "blocked" && (
        <div className="unsaved-backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            className="content-card"
          >
            <h2 id="unsaved-title">Unsaved architectural changes</h2>
            <p>Leaving discards your local edits. Stay to save your changes.</p>
            <button
              className="button primary"
              onClick={() => d.blocker.reset?.()}
            >
              Stay in editor
            </button>
            <button className="button" onClick={() => d.blocker.proceed?.()}>
              Discard and leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

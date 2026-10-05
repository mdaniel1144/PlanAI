import { useUnits } from "../../units/useUnits";
import { ArchitectureFields } from "./ArchitectureFields";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  Link2,
  ShieldCheck,
  ArrowUpRight,
  X,
  Info,
} from "lucide-react";
import {
  entitiesOf,
  roomSchema,
  type Entity,
  type Floor,
} from "@habitat/domain";
import { area, distance, connectivity } from "@habitat/geometry";
import { perimeter } from "../viewer2d/layers";
export function Properties({
  entity,
  floor,
  onCorrect,
  onVerify,
  onSelect,
  busy,
  verifyDisabled,
  onDraftChange,
  onDelete,
  issues,
}: {
  entity: Entity | undefined;
  floor: Floor;
  onCorrect: (patch: Record<string, unknown>) => Promise<void>;
  onVerify: () => void;
  onSelect: (id: string) => void;
  busy: boolean;
  verifyDisabled: boolean;
  onDraftChange: (p: Record<string, unknown>) => void;
  onDelete: () => void;
  issues: {
    entityId: string;
    message: string;
    severity: string;
    code?: string;
  }[];
}) {
  const u = useUnits();
  const [editing, setEditing] = useState(false),
    [patch, setPatch] = useState<Record<string, unknown>>({});
  if (!entity)
    return (
      <aside className="properties-panel">
        <div className="properties-heading">
          <strong>Properties</strong>
        </div>
        <div className="properties-empty">
          <Info size={24} />
          <p>
            {floor.name} · Elevation{" "}
            {floor.elevation == null ? "unknown" : u.format(floor.elevation)}.
            Select a room, wall, or opening to inspect its architectural
            properties.
          </p>
        </div>
      </aside>
    );
  const setValue = (key: string, value: unknown) =>
    setPatch((p) => ({ ...p, [key]: value }));
  const roomName = (id: string | null) =>
    floor.rooms.find((r) => r.id === id)?.name ?? "Exterior / unknown";
  const links = connectivity(floor).filter(
    (e) => e.from === entity.id || e.to === entity.id,
  );
  return (
    <aside className="properties-panel">
      <div className="properties-heading">
        <strong>Properties</strong>
      </div>
      <div className="properties-scroll">
        <div className="entity-heading">
          <div className={`entity-kind ${entity.kind}`}>
            {entity.kind === "room" ? <HouseGlyph /> : <Link2 size={20} />}
          </div>
          <div>
            <span className="eyebrow">{entity.kind} properties</span>
            <h2>{entity.name}</h2>
          </div>
          <span className="entity-id">
            {entity.kind === "room"
              ? `R-${101 + floor.rooms.findIndex((r) => r.id === entity.id)}`
              : entity.name}
          </span>
        </div>
        <div className="verification-badge">
          <ShieldCheck size={13} />
          {entity.verification === "USER_CORRECTED"
            ? "User corrected"
            : entity.verification === "VERIFIED"
              ? "Verified geometry"
              : entity.verification.replaceAll("_", " ").toLowerCase()}
        </div>
        <ArchitectureFields
          entity={entity}
          floor={floor}
          onChange={onDraftChange}
          onDelete={onDelete}
        />
        <div className="property-section">
          <div className="section-title">
            General <ChevronDown size={13} />
          </div>
          <label className="field-label">
            Name
            {editing ? (
              <input
                value={String(patch.name ?? entity.name)}
                onChange={(e) => setValue("name", e.target.value)}
              />
            ) : (
              <div className="field-value">{entity.name}</div>
            )}
          </label>
          <div className="field-label">
            Type
            {editing && entity.kind === "room" ? (
              <select
                aria-label="Room type"
                value={String(patch.type ?? entity.type)}
                onChange={(e) => setValue("type", e.target.value)}
              >
                {roomSchema.shape.type.options.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            ) : (
              <div className="field-value capitalize">
                {"type" in entity
                  ? entity.type.replaceAll("_", " ")
                  : entity.kind}
                <ChevronDown size={12} />
              </div>
            )}
          </div>
          <div className="property-row">
            <span>Floor</span>
            <span>{floor.name}</span>
          </div>
        </div>
        {(entity.kind === "room" || entity.kind === "window") && (
          <div className="property-section">
            <div className="section-title">Issues</div>
            {issues
              .filter((i) => i.entityId === entity.id)
              .map((i, n) => (
                <p className="small muted" key={n}>
                  {i.code ? `${i.code}: ` : ""}
                  {i.message}
                </p>
              ))}
          </div>
        )}
        <div className="property-section">
          <div className="section-title">
            Geometry <ChevronDown size={13} />
          </div>
          {entity.kind === "room" ? (
            <>
              <div className="metric-pair">
                <div>
                  <span>Area</span>
                  <strong>
                    {entity.boundary.length
                      ? area(entity.boundary).toFixed(1)
                      : "Unknown"}{" "}
                    <small>m²</small>
                  </strong>
                </div>
                <div>
                  <span>Perimeter</span>
                  <strong>{u.format(perimeter(floor, entity.id))}</strong>
                </div>
              </div>
              <div className="property-row">
                <span>Boundary</span>
                <span>{entity.boundary.length} vertices</span>
              </div>
              <div className="property-row">
                <span>Geometry status</span>
                <span className="green-text">
                  <Check size={12} />{" "}
                  {entity.geometry.verification
                    .toLowerCase()
                    .replaceAll("_", " ")}
                </span>
              </div>
            </>
          ) : (
            <>
              {entity.kind === "wall" && (
                <div className="property-row">
                  <span>Length</span>
                  <strong>
                    {u.format(distance(entity.start, entity.end))}
                  </strong>
                </div>
              )}
              {(["thickness", "width", "height", "sillHeight"] as const)
                .filter(
                  (key) =>
                    entity.kind !== "window" ||
                    !["height", "sillHeight"].includes(key),
                )
                .map((key) => {
                  if (!(key in entity)) return null;
                  const value = (entity as unknown as Record<string, unknown>)[
                    key
                  ];
                  return (
                    <div className="property-row" key={key}>
                      <span>
                        {key === "sillHeight"
                          ? "Sill height"
                          : key.charAt(0).toUpperCase() + key.slice(1)}{" "}
                        ({u.label})
                      </span>
                      {editing && key !== "sillHeight" ? (
                        <input
                          aria-label={key}
                          className="numeric-input"
                          type="number"
                          min={u.toDisplay(0.01)}
                          step="0.01"
                          value={u.input(
                            (key in patch ? patch[key] : value) as
                              number | null,
                          )}
                          placeholder="Unknown"
                          onChange={(e) =>
                            setValue(
                              key,
                              e.target.value === ""
                                ? null
                                : u.parse(e.target.value),
                            )
                          }
                        />
                      ) : (
                        <strong>
                          {typeof value === "number"
                            ? u.format(value)
                            : "Unknown"}
                        </strong>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>
        <div className="property-section">
          <div className="section-title">
            Connections{" "}
            <span className="count-badge">
              {entity.kind === "room"
                ? links.length
                : "wallId" in entity
                  ? 1
                  : entity.kind === "wall"
                    ? [entity.leftRoomId, entity.rightRoomId].filter(Boolean)
                        .length
                    : 0}
            </span>
          </div>
          {entity.kind === "room" ? (
            links.map((link) => {
              const room = floor.rooms.find(
                (r) => r.id === (link.from === entity.id ? link.to : link.from),
              );
              const door = entitiesOf(floor).find(
                (e) => e.id === link.openingId,
              );
              return (
                <button
                  key={link.openingId}
                  className="connection"
                  onClick={() => room && onSelect(room.id)}
                >
                  <Link2 size={13} />
                  <span>
                    {room?.name}
                    <small>via {door?.name}</small>
                  </span>
                  <ArrowUpRight size={13} />
                </button>
              );
            })
          ) : entity.kind === "wall" ? (
            <>
              <div className="property-row">
                <span>Left side</span>
                <span>{roomName(entity.leftRoomId)}</span>
              </div>
              <div className="property-row">
                <span>Right side</span>
                <span>{roomName(entity.rightRoomId)}</span>
              </div>
            </>
          ) : "wallId" in entity ? (
            <button
              className="connection"
              onClick={() => onSelect(entity.wallId)}
            >
              <Link2 size={14} />
              Host wall{" "}
              <span>
                {floor.walls.find((w) => w.id === entity.wallId)?.name}
              </span>
              <ArrowUpRight size={13} />
            </button>
          ) : (
            <p className="muted small">No connections recorded.</p>
          )}
        </div>
      </div>
      <div className="properties-actions">
        {editing ? (
          <>
            <button
              className="button primary"
              disabled={busy || !Object.keys(patch).length}
              onClick={async () => {
                try {
                  await onCorrect(patch);
                } catch {
                  return;
                }
                setEditing(false);
                setPatch({});
              }}
            >
              Apply to draft
            </button>
            <button
              className="icon-button"
              title="Cancel changes"
              onClick={() => {
                setEditing(false);
                setPatch({});
              }}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <button className="button" onClick={() => setEditing(true)}>
              Edit properties
            </button>
            <button
              className="icon-button verify-button"
              title={
                verifyDisabled
                  ? "Save local changes before verification"
                  : "Verify selected entity"
              }
              disabled={busy || verifyDisabled}
              onClick={onVerify}
            >
              <ShieldCheck size={18} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
function HouseGlyph() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M4 4h16v16H4zM4 10h7V4M11 10h9M11 10v10" />
    </svg>
  );
}

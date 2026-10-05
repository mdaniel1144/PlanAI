import { useUnits } from "../../units/useUnits";
import { ChevronDown, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { validateScene } from "@habitat/geometry";
import type { Layers } from "../viewer2d/layers";
import type { DrawingEditor } from "./useDrawing";

export function ViewOptions({
  drawing: d,
  layers,
  setLayers,
  floorId,
  onFloorChange,
  issues,
  unverifiedCount,
  entityCount,
  onSelect,
}: {
  drawing: DrawingEditor;
  layers: Layers;
  setLayers: Dispatch<SetStateAction<Layers>>;
  floorId: string;
  onFloorChange: (id: string) => void;
  issues: ReturnType<typeof validateScene>;
  unverifiedCount: number;
  entityCount: number;
  onSelect: (id: string | null) => void;
}) {
  const u = useUnits();
  return (
    <details className="view-options">
      <summary>
        View <ChevronDown size={12} />
      </summary>
      <div className="view-options-panel">
        <strong>Grid</strong>
        <label>
          <input
            type="checkbox"
            checked={d.grid}
            onChange={(e) => d.setGrid(e.target.checked)}
          />{" "}
          Show grid
        </label>
        <label>
          <input
            type="checkbox"
            checked={d.snapGrid}
            onChange={(e) => d.setSnapGrid(e.target.checked)}
          />{" "}
          Snap to grid
        </label>
        <label>
          Grid spacing
          <select
            aria-label="Grid spacing"
            value={d.spacing}
            onChange={(e) => d.setSpacing(Number(e.target.value))}
          >
            {[0.1, 0.25, 0.5, 1].map((n) => (
              <option key={n} value={n}>
                {u.format(n)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={layers.dimensions}
            onChange={(e) =>
              setLayers((l) => ({ ...l, dimensions: e.target.checked }))
            }
          />{" "}
          Dimensions
        </label>
        <label>
          <input
            type="checkbox"
            checked={layers.labels}
            onChange={(e) =>
              setLayers((l) => ({ ...l, labels: e.target.checked }))
            }
          />{" "}
          Room labels
        </label>
        <label>
          Current floor
          <select
            aria-label="Current floor"
            value={floorId}
            onChange={(e) => onFloorChange(e.target.value)}
          >
            {d.scene.floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <section className="view-status" aria-label="Editor status">
          <strong>Editor status</strong>
          <span>
            <ShieldCheck size={14} /> Scale{" "}
            {d.floor?.scale.status.toLowerCase()}
          </span>
          <span>
            {issues.length ? <Info size={14} /> : <CheckCircle2 size={14} />}
            {issues.length ? `${issues.length} issues` : "No geometry issues"}
          </span>
          <span>{unverifiedCount} unverified elements</span>
          <span>{entityCount} elements · Units: meters</span>
          {issues.length > 0 && (
            <details className="view-issues">
              <summary>Issues / warnings ({issues.length})</summary>
              <ul>
                {issues.map((issue, i) => (
                  <li key={i}>
                    <button onClick={() => onSelect(issue.entityId)}>
                      {issue.code ? `${issue.code}: ` : `${issue.severity}: `}
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </details>
  );
}

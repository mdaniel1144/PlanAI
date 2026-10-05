import { useUnits } from "../../units/useUnits";
import { LengthInput } from "../../units/LengthInput";
import { useState } from "react";
import { floorSchema, type Floor } from "@habitat/domain";
export function EmptyFloor({ onCreate }: { onCreate: (floor: Floor) => void }) {
  const u = useUnits();
  const [name, setName] = useState("Ground Floor"),
    [elevation, setElevation] = useState<number | null>(0);
  return (
    <div className="page-content narrow">
      <h1>Create a floor</h1>
      <p>
        This scene has no floors. Enter a name and elevation to start drawing.
      </p>
      <form
        className="form-card"
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(
            floorSchema.parse({
              id: crypto.randomUUID(),
              name: name.trim(),
              elevation: Number(elevation),
              scale: {
                status: "UNKNOWN",
                metersPerPixel: null,
                sourceOrigin: null,
                worldOrigin: null,
                rotation: null,
                evidenceIds: [],
              },
              rooms: [],
              walls: [],
              doors: [],
              windows: [],
              openings: [],
              columns: [],
              stairs: [],
              shafts: [],
              dimensions: [],
              zones: [],
            }),
          );
        }}
      >
        <label className="field-label">
          Floor name
          <input
            aria-label="Floor name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field-label">
          Floor elevation ({u.label})
          <LengthInput
            aria-label="Floor elevation"
            step="any"
            required
            meters={elevation}
            onMetersChange={setElevation}
            onEmpty={() => setElevation(null)}
          />
        </label>
        <button className="button primary" disabled={!name.trim()}>
          Create floor
        </button>
      </form>
    </div>
  );
}

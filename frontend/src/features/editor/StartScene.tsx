import { useUnits } from "../../units/useUnits";
import { useState } from "react";
import { client } from "../../api/client";
import type { HomeScene } from "@habitat/domain";
export function StartScene({
  projectId,
  onScene,
}: {
  projectId: string;
  onScene: (s: HomeScene) => void;
}) {
  const u = useUnits();
  const [name, setName] = useState("Ground floor"),
    [elevation, setElevation] = useState("0"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="page-content">
      <h1>Your home starts with a plan</h1>
      <p>Create an empty floor to draw walls and rooms.</p>
      <form
        className="content-card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          void client
            .createScene(projectId, {
              floorName: name,
              elevation: elevation === "" ? null : Number(elevation),
            })
            .then(onScene)
            .catch((e) => setError(String(e.message)))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Floor name
          <input
            aria-label="Floor name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label>
          Floor elevation ({u.label}; blank means unknown)
          <input
            aria-label="Floor elevation"
            type="number"
            step="any"
            value={elevation === "" ? "" : u.input(Number(elevation))}
            onChange={(e) =>
              setElevation(
                e.target.value === "" ? "" : String(u.parse(e.target.value)),
              )
            }
          />
        </label>
        <button className="button primary" disabled={busy}>
          Create empty floor
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  );
}

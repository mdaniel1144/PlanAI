import { useUnits } from "../units/useUnits";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { client } from "../api/client";
import { Shell } from "../components/Layout";
import { PageHeading } from "../components/PageHeading";

export function NewProject() {
  const units = useUnits();
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <Shell>
      <div className="page-content narrow">
        <Link className="text-link" to="/projects">
          <ArrowLeft size={14} /> Back to projects
        </Link>
        <PageHeading
          eyebrow="A new beginning"
          title="Create your project"
          description="Give your home a place in your workspace."
        />
        <form
          className="form-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const p = await client.createProject({
                name,
                description,
                units: "m",
              });
              navigate(`/projects/${p.id}/editor`);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not create project",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field-label">
            Project name
            <input
              autoFocus
              required
              maxLength={120}
              placeholder="e.g. Oakwood residence"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field-label">
            Description <span className="muted">(optional)</span>
            <textarea
              rows={4}
              maxLength={2000}
              placeholder="A little context about this home..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="field-label">
            Length display
            <div className="field-value">
              {units.unit === "CM" ? "Centimeters (cm)" : "Meters (m)"}{" "}
              <Link to="/settings/display">Display &amp; Units</Link>
            </div>
          </label>
          {error && <p className="inline-error">{error}</p>}
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create project"}
            <ArrowRight size={15} />
          </button>
        </form>
      </div>
    </Shell>
  );
}

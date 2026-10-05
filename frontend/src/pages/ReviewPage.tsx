import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Info,
  ShieldCheck,
  Layers3,
  FileText,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { PageHeading, Stat } from "../components/PageHeading";
import { entitiesOf, type Project, type HomeScene } from "@habitat/domain";
import { validateScene } from "@habitat/geometry";

export function ReviewPage({
  project,
  scene,
}: {
  project: Project;
  scene: HomeScene;
}) {
  const issues = validateScene(scene);
  const [filter, setFilter] = useState("all");
  const entities = scene.floors.flatMap(entitiesOf),
    unverified = entities.filter(
      (e) => !["VERIFIED", "USER_CORRECTED"].includes(e.verification),
    );
  return (
    <div className="page-content">
      <PageHeading
        eyebrow="Architectural quality assurance"
        title="A home you can trust."
        description="Review the geometry and relationships in your model."
        action={
          <Link
            className="button primary"
            to={`/projects/${project.id}/editor`}
          >
            Continue to editor <ArrowRight size={15} />
          </Link>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Geometry issues"
          value={String(issues.length)}
          icon={<Info size={18} />}
        />
        <Stat
          label="Unverified elements"
          value={String(unverified.length)}
          icon={<ShieldCheck size={18} />}
        />
        <Stat
          label="Legacy floor scale"
          value={
            scene.floors.every((f) => f.scale.status === "VERIFIED")
              ? "Verified"
              : "Needs review"
          }
          icon={<Layers3 size={18} />}
        />
        <Stat
          label="Geometry evidence"
          value={String(scene.evidence.length)}
          icon={<FileText size={18} />}
        />
      </div>
      <div className="review-tabs">
        {["all", "room", "wall", "door", "window"].map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={filter === t ? "active" : ""}
          >
            {t === "all" ? "All elements" : `${t}s`}
          </button>
        ))}
      </div>
      {issues.length > 0 && (
        <div className="info-banner">
          <AlertCircle size={20} />
          <div>
            {issues.map((i, n) => (
              <p key={n}>{i.message}</p>
            ))}
          </div>
        </div>
      )}
      <div className="content-card table-card">
        <table>
          <thead>
            <tr>
              <th>Element</th>
              <th>Type</th>
              <th>Floor</th>
              <th>Verification</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {entities
              .filter((e) => filter === "all" || e.kind === filter)
              .map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td className="capitalize">{e.kind}</td>
                  <td>{scene.floors.find((f) => f.id === e.floorId)?.name}</td>
                  <td>
                    <span className="verification-badge">
                      <CheckCircle2 size={12} />
                      {e.verification.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>
                    {e.evidenceIds.length} record
                    {e.evidenceIds.length === 1 ? "" : "s"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {project.isDemo && (
        <p className="review-disclaimer">
          <Info size={14} /> These checks validate an authored fixture. They do
          not confirm a real building.
        </p>
      )}
    </div>
  );
}

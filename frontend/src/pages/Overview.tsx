import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Layers3,
  House,
  Box,
  DoorOpen,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { EmptyState } from "../components/Layout";
import { PageHeading, Stat } from "../components/PageHeading";
import { PlanView } from "../features/viewer2d/PlanView";
import { entitiesOf, type Project, type HomeScene } from "@habitat/domain";
const allLayers = {
  rooms: true,
  walls: true,
  doors: true,
  windows: true,
  dimensions: false,
  labels: true,
};
export function Overview({
  project,
  scene,
}: {
  project: Project;
  scene: HomeScene | null;
}) {
  const base = `/projects/${project.id}`;
  return (
    <div className="page-content">
      <PageHeading
        eyebrow="Project overview"
        title={project.name}
        description={
          project.description || "Your residential architecture, in one place."
        }
        action={
          <Link className="button primary" to={`${base}/editor`}>
            Open home editor <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Floors"
          value={String(scene?.floors.length ?? 0)}
          icon={<Layers3 size={18} />}
        />
        <Stat
          label="Rooms"
          value={String(scene?.floors.flatMap((f) => f.rooms).length ?? 0)}
          icon={<House size={18} />}
        />
        <Stat
          label="Walls"
          value={String(scene?.floors.flatMap((f) => f.walls).length ?? 0)}
          icon={<Box size={18} />}
        />
        <Stat
          label="Doors & windows"
          value={String(
            scene?.floors.flatMap((f) => [...f.doors, ...f.windows]).length ??
              0,
          )}
          icon={<DoorOpen size={18} />}
        />
      </div>
      <div className="content-card">
        <div className="card-heading">
          <h3>Home model</h3>
          {project.isDemo && <span className="tag">Example project</span>}
        </div>
        {scene?.floors[0] ? (
          <div className="overview-plan">
            <PlanView
              floor={scene.floors[0]}
              selected={null}
              onSelect={() => {}}
              layers={allLayers}
              zoom={1}
              setZoom={() => {}}
            />
          </div>
        ) : (
          <EmptyState
            title="No model yet"
            detail="Open the editor to create a floor and start drawing."
          />
        )}
        {scene && (
          <p className="small muted">
            {scene.floors.flatMap(entitiesOf).length} architectural elements
          </p>
        )}
        {scene && (
          <Link className="menu-link" to={`${base}/review`}>
            <ShieldCheck size={17} /> Architectural review{" "}
            <ArrowRight size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}

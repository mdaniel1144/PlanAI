import { useWorkspaceItems } from "../items/useWorkspaceItems";
import { createPortal } from "react-dom";
import { HeaderTargetContext } from "../../components/headerTarget";
import { EmptyFloor } from "./EmptyFloor";
import { useDrawing, drawingTools } from "./useDrawing";
import { DrawingControls } from "./DrawingControls";
import { ViewOptions } from "./ViewOptions";
import { lazy, Suspense, useContext, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Square,
  Box,
  Columns2,
  Scan,
  Minus,
  Check,
  Save,
  Download,
  RotateCcw,
  Info,
  CheckCircle2,
} from "lucide-react";
import { entitiesOf, type HomeScene, type Project } from "@habitat/domain";
import { validateScene } from "@habitat/geometry";
import { client } from "../../api/client";
import { PlanView } from "../viewer2d/PlanView";
import { type Layers as LayerState } from "../viewer2d/layers";
import { Properties } from "./Properties";
const SceneView = lazy(() => import("../viewer3d/SceneView"));
const initialLayers: LayerState = {
  rooms: true,
  walls: true,
  doors: true,
  windows: true,
  dimensions: true,
  labels: true,
};
export function Editor({
  project,
  scene: savedScene,
  onScene,
}: {
  project: Project;
  scene: HomeScene;
  onScene: (s: HomeScene) => void;
}) {
  const headerTarget = useContext(HeaderTargetContext);
  const [floorId, setFloorId] = useState(savedScene.floors[0]?.id),
    [selectedEntityIds, setSelectedEntityIds] = useState<string[]>(
      savedScene.floors[0]?.rooms[0] ? [savedScene.floors[0].rooms[0].id] : [],
    ),
    [mode, setMode] = useState<"2d" | "3d" | "split">("2d"),
    [layers, setLayers] = useState(initialLayers),
    [zoom, setZoom] = useState(1),
    [tool, setTool] = useState("select"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [reset, setReset] = useState(0);
  const selected = selectedEntityIds[0] ?? null;
  const setSelected = (id: string | null) =>
    setSelectedEntityIds(id ? [id] : []);
  const drawing = useDrawing({
    saved: savedScene,
    locked: busy,
    onScene,
    floorId,
    tool,
    setTool: (next) => {
      setTool(next);
      if (drawingTools.includes(next)) setMode((m) => (m === "3d" ? "2d" : m));
    },
    selected,
    select: setSelected,
  });
  const { scene, floor } = drawing;
  const furniture = useWorkspaceItems({
    scene,
    floor,
    selected,
    select: setSelected,
    commit: drawing.commit,
    startPlan: () => {
      drawing.activate("select");
      setMode("2d");
    },
    onNotice: setNotice,
  });
  if (!floor)
    return (
      <EmptyFloor
        onCreate={(floor) =>
          drawing.commit({ ...scene, floors: [...scene.floors, floor] })
        }
      />
    );
  const entities = entitiesOf(floor),
    entity = entities.find((e) => e.id === selected),
    issues = validateScene(scene),
    unverified = entities.filter(
      (e) => !["VERIFIED", "USER_CORRECTED"].includes(e.verification),
    );
  const act = async (action: () => Promise<HomeScene>, message: string) => {
    setBusy(true);
    setError("");
    try {
      drawing.accept(await action());
      setNotice(message);
      setTimeout(() => setNotice(""), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const select = (id: string | null) => {
    setSelected(id);
  };
  return (
    <div className="editor" data-scene-revision={scene.revision}>
      {headerTarget &&
        createPortal(
          <div className="editor-titlebar">
            <div className="project-title-block">
              <Link
                to={`/projects/${project.id}`}
                className="back-button"
                title="Project overview"
              >
                <ArrowLeft size={17} />
              </Link>
              <div>
                <div className="title-line">
                  <h1>{project.name}</h1>
                  <span className="tag">
                    {project.isDemo ? "Example project" : "Residential"}
                  </span>
                </div>
                <p>
                  Home editor <span> / </span> {floor.name}
                </p>
              </div>
            </div>
            <div className="title-actions">
              <span className="saved-state">
                <Check size={13} />{" "}
                {drawing.dirty ? "Unsaved changes" : "Saved"}
              </span>
              <button
                className="button"
                disabled={busy || drawing.busy || !drawing.dirty}
                onClick={() => void drawing.save()}
              >
                <Save size={14} /> Save changes
              </button>
              <Link
                className="button primary"
                to={`/projects/${project.id}/export`}
              >
                <Download size={14} /> Export <ChevronDown size={12} />
              </Link>
            </div>
          </div>,
          headerTarget,
        )}
      {furniture.modal}
      {furniture.pending && (
        <div className="placement-notice">
          Choose a position on the plan. Escape cancels placement.{" "}
          <button onClick={furniture.cancel}>Cancel placement</button>
        </div>
      )}
      {furniture.error && <p role="alert">{furniture.error}</p>}
      <div className="editor-workspace">
        <section className="canvas-panel">
          <div className="canvas-toolbar">
            <div className="toolbar-start">
              <div className="view-switch">
                {(
                  [
                    { key: "2d", label: "2D plan", icon: Square },
                    { key: "3d", label: "3D model", icon: Box },
                    { key: "split", label: "Split", icon: Columns2 },
                  ] as const
                ).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    className={mode === key ? "active" : ""}
                    onClick={() => setMode(key)}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="toolbar-end">
              <button className="button secondary" onClick={furniture.open}>
                Add Item
              </button>
              <ViewOptions
                drawing={drawing}
                layers={layers}
                setLayers={setLayers}
                floorId={floor.id}
                onFloorChange={(id) => {
                  drawing.activate("select");
                  setFloorId(id);
                  setSelected(null);
                }}
                issues={issues}
                unverifiedCount={unverified.length}
                entityCount={entities.length}
                onSelect={setSelected}
              />
              <button
                className="icon-button"
                title="Reset view"
                onClick={() => {
                  setZoom(1);
                  setReset((v) => v + 1);
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
          </div>
          <div
            className={`canvas-stage ${drawing.grid ? "" : "grid-hidden"} ${mode === "split" ? "split-view" : ""}`}
          >
            <div className="canvas-label">
              <span className="online-dot" /> {floor.name}
              <span className="label-divider" />
              {mode === "3d" ? "Perspective" : "Architectural plan"}
            </div>
            {mode === "2d" && (
              <div
                className="north-marker"
                title="Canonical plan axes; geographic north is unknown"
              >
                <svg width="32" height="38" viewBox="0 0 32 38" fill="none">
                  <path
                    d="M4 5V29M4 5H25M1 25L4 29L7 25M21 2L25 5L21 8"
                    stroke="#819174"
                    strokeWidth="1"
                  />
                  <text x="25" y="18" fill="#819174" fontSize="7">
                    X
                  </text>
                  <text x="10" y="34" fill="#819174" fontSize="7">
                    Y
                  </text>
                </svg>
              </div>
            )}
            {mode !== "3d" && (
              <div className="plan-view">
                <PlanView
                  key={`${floor.id}-${reset}`}
                  floor={floor}
                  selected={selected}
                  onSelect={select}
                  interaction={drawing.interaction}
                  itemLayer={furniture.layer}
                  onPlanPoint={furniture.pending ? furniture.place : undefined}
                  onPlanHover={furniture.pending ? furniture.hover : undefined}
                  layers={layers}
                  zoom={zoom}
                  setZoom={setZoom}
                  panMode={tool === "pan"}
                />
              </div>
            )}
            {mode !== "2d" && (
              <Suspense
                fallback={
                  <div className="loading-state">
                    Building canonical 3D geometry…
                  </div>
                }
              >
                <SceneView
                  key={`${floor.id}-${reset}`}
                  floor={floor}
                  selected={selected}
                  onSelect={select}
                  layers={layers}
                  items={furniture.items}
                />
              </Suspense>
            )}
            <DrawingControls drawing={drawing} tool={tool} />
            {mode !== "3d" && (
              <div className="zoom-controls">
                <button
                  title="Zoom out"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                >
                  <Minus size={14} />
                </button>
                <span>{Math.round(zoom * 100)}%</span>
                <button
                  title="Zoom in"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
                >
                  <Plus size={14} />
                </button>
                <i />
                <button
                  title="Fit plan"
                  onClick={() => {
                    setZoom(1);
                    setReset((v) => v + 1);
                  }}
                >
                  <Scan size={15} />
                </button>
              </div>
            )}
            <div className="canvas-help">
              {tool === "pan"
                ? "Drag to pan"
                : tool === "select"
                  ? "Select an element · drag wall or endpoints to move"
                  : ["draw-wall", "manual-room"].includes(tool)
                    ? "Double-click to finish · Esc to select"
                    : `Active tool: ${tool.replaceAll("-", " ")} · Esc to select`}
            </div>
          </div>
        </section>
        {furniture.properties ?? (
          <Properties
            issues={issues}
            key={entity?.id ?? "empty"}
            entity={entity}
            floor={floor}
            busy={busy || drawing.busy}
            verifyDisabled={drawing.dirty}
            onDraftChange={drawing.updateEntity}
            onDelete={() => drawing.deleteEntity()}
            onSelect={select}
            onCorrect={async (patch) => drawing.updateEntity(patch)}
            onVerify={() =>
              !drawing.dirty &&
              void act(
                () =>
                  client.verify(scene.id, {
                    expectedRevision: scene.revision,
                    entityId: selected,
                  }),
                "Entity verified",
              ).catch(() => {})
            }
          />
        )}
      </div>
      {(notice || error) && (
        <div className={`toast ${error ? "error" : ""}`} role="status">
          {error ? <Info size={16} /> : <CheckCircle2 size={16} />}{" "}
          {error || notice}
          <button
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

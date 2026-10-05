import { useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";
import {
  entitiesOf,
  newWindowAssembly,
  type Window,
  sceneSchema,
  type HomeScene,
  type Floor,
  type Point,
  type Door,
  type Wall,
  type Room,
  type Entity,
} from "@habitat/domain";
import {
  windowDragPosition,
  windowPlacementAt,
  windowSillReference,
  windowWorldElevationFromSill,
  windowTopFromHeight,
  area,
  simplePolygon,
  distance,
  exactEndpoint,
  snapDrawing,
  projectOnWall,
  splitJunctions,
  deriveRoomConnections,
  moveWall,
  wallDependencies,
  reconnectWalls,
  validateScene,
  recomputeSceneSpaces,
} from "@habitat/geometry";
import { client } from "../../api/client";
import { draftHistory, pushDraft, undoDraft, redoDraft } from "./history";
import type { DrawingInteraction } from "./drawingTypes";
const id = () => crypto.randomUUID();
export const drawingTools = [
  "draw-wall",
  "manual-room",
  "add-door",
  "add-window",
  "measure",
  "delete",
];
export function useDrawing({
  saved,
  locked,
  onScene,
  floorId,
  tool,
  setTool,
  selected,
  select,
}: {
  saved: HomeScene;
  locked: boolean;
  onScene: (s: HomeScene) => void;
  floorId: string | undefined;
  tool: string;
  setTool: (t: string) => void;
  selected: string | null;
  select: (id: string | null) => void;
}) {
  const [history, setHistory] = useState(() => draftHistory(saved)),
    [baseline, setBaseline] = useState(saved),
    [preview, setPreview] = useState<HomeScene | null>(null);
  const [saving, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [points, setPoints] = useState<Point[]>([]),
    [pointer, setPointer] = useState<Point | null>(null),
    [snapLabel, setSnapLabel] = useState(""),
    [hoverId, setHoverId] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null),
    [placement, setPlacement] = useState(0),
    [placementLocked, setPlacementLocked] = useState(false);
  const [grid, setGrid] = useState(true),
    [snapGrid, setSnapGrid] = useState(true),
    [spacing, setSpacing] = useState(0.25);
  const [wallDefaults, setWallDefaults] = useState({
    thickness: 0.2,
    height: 3,
    type: "interior" as Wall["type"],
  });
  const [windowDefaults, setWindowDefaults] = useState({
    width: 1.2,
    sillHeight: 0.9 as number | null,
    windowHeight: 1.2 as number | null,
    type: "unknown" as Window["type"],
  });
  const [windowHoverPoint, setWindowHoverPoint] = useState<Point | null>(null);
  const [windowWorldMode, setWindowWorldMode] = useState(false);
  const [windowWorldValues, setWindowWorldValues] = useState({
    bottomElevation: null as number | null,
    topElevation: null as number | null,
  });
  const [doorDefaults, setDoorDefaults] = useState({
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    hingeEndpoint: "OPENING_START" as const as NonNullable<
      Door["hingedOrientation"]
    >["hingeEndpoint"],
    swingSide: "WALL_LEFT" as const as NonNullable<
      Door["hingedOrientation"]
    >["swingSide"],
  });
  const [roomName, setRoomName] = useState("Room"),
    [roomType, setRoomType] = useState<Room["type"]>("unknown"),
    [lengthInput, setLengthInput] = useState("");
  const drag = useRef<{
    scene: HomeScene;
    wallId: string;
    part: "wall" | "start" | "end" | "window";
    origin: Point;
  } | null>(null);
  const previewRef = useRef<HomeScene | null>(null);
  const [windowPreviewId] = useState(id);
  const [panelPreviewId] = useState(id);
  const scene = preview ?? history.present,
    floor = scene.floors.find((f) => f.id === floorId) ?? scene.floors[0];
  const busy = saving || locked;
  const dirty = JSON.stringify(history.present) !== JSON.stringify(baseline);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const reset = () => {
    setPoints([]);
    setHostId(null);
    setWindowHoverPoint(null);
    setWindowWorldMode(false);
    setWindowWorldValues({ bottomElevation: null, topElevation: null });
    setPlacementLocked(false);
    setPointer(null);
    setHoverId(null);
    setLengthInput("");
    setSnapLabel("");
    drag.current = null;
    previewRef.current = null;
    setPreview(null);
  };
  const activate = (t: string) => {
    reset();
    setError("");
    setMessage("");
    setTool(t);
  };
  const accept = (s: HomeScene) => {
    setHistory(draftHistory(s));
    setBaseline(s);
    onScene(s);
    reset();
  };
  const commit = (s: HomeScene) => {
    if (busy) return;
    try {
      const result = recomputeSceneSpaces(s, history.present);
      if (result.issues.length)
        throw new Error(
          result.issues.map((i) => `${i.code}: ${i.message}`).join("; "),
        );
      sceneSchema.parse(result.scene);
      setHistory((h) => pushDraft(h, result.scene));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
    }
  };
  const editFloor = (fn: (f: Floor) => Floor | void, description: string) => {
    const next = structuredClone(history.present),
      index = next.floors.findIndex((f) => f.id === floor?.id);
    if (index < 0) throw new Error("Choose an active floor");
    const previous = new Map(
      entitiesOf(next.floors[index]).map((e) => [e.id, JSON.stringify(e)]),
    );
    const changed = fn(next.floors[index]);
    if (changed) next.floors[index] = changed;
    deriveRoomConnections(next.floors[index]);
    const changedEntities = entitiesOf(next.floors[index]).filter(
      (e) => previous.get(e.id) !== JSON.stringify(e),
    );
    if (changedEntities.length) {
      const evidenceId = id();
      next.evidence.push({
        id: evidenceId,
        type: "MANUAL",
        description,
      });
      for (const e of changedEntities) {
        e.verification = "USER_CORRECTED";
        e.evidenceIds = [...e.evidenceIds, evidenceId];
        if (e.kind === "room") {
          const old: Entity | undefined = previous.has(e.id)
            ? JSON.parse(previous.get(e.id)!)
            : undefined;
          if (
            !e.topology &&
            (!old ||
              old.kind !== "room" ||
              JSON.stringify(old.boundary) !== JSON.stringify(e.boundary))
          ) {
            e.geometry = {
              ...e.geometry,
              verification: "USER_CORRECTED",
              evidenceIds: [...e.geometry.evidenceIds, evidenceId],
            };
          }
          if (
            !old ||
            old.kind !== "room" ||
            old.name !== e.name ||
            old.type !== e.type
          ) {
            e.semantic = {
              ...e.semantic,
              verification: e.type === "unknown" ? "UNKNOWN" : "USER_CORRECTED",
              evidenceIds: [...e.semantic.evidenceIds, evidenceId],
            };
          }
        }
      }
    }
    commit(next);
  };
  const safely = (action: () => void) => {
    try {
      action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot edit geometry");
    }
  };
  const base = (name: string) => ({
    id: id(),
    floorId: floor!.id,
    name,
    confidence: null,
    verification: "USER_CORRECTED" as const,
    evidenceIds: [] as string[],
  });
  const snap = (p: Point, anchor?: Point) =>
    snapDrawing(
      p,
      floor?.walls.filter((w) => w.verification !== "REJECTED") ?? [],
      anchor,
      snapGrid ? spacing : undefined,
    );
  const wallAt = (p: Point) =>
    floor?.walls
      .filter((w) => w.verification !== "REJECTED")
      .map((w) => ({ w, d: distance(projectOnWall(p, w).point, p) }))
      .filter((x) => x.d < 0.25)
      .sort((a, b) => a.d - b.d)[0]?.w;
  const windowHost = floor?.walls.find((wall) => wall.id === hostId);
  const windowReference = floor ? windowSillReference(floor, windowHost) : null;
  const windowUsesWorld =
    windowWorldMode || (!!windowHost && windowReference?.elevation == null);
  const windowBottom = windowUsesWorld
    ? windowWorldValues.bottomElevation
    : windowWorldElevationFromSill(
        windowReference?.elevation ?? null,
        windowDefaults.sillHeight,
      );
  const windowElevations = {
    bottomElevation: windowBottom,
    topElevation: windowUsesWorld
      ? windowWorldValues.topElevation
      : windowTopFromHeight(windowBottom, windowDefaults.windowHeight),
  };
  const hoveredPlacement =
    windowHost && windowHoverPoint
      ? windowPlacementAt(windowHoverPoint, windowHost, windowDefaults.width)
      : null;
  const openingPosition =
    tool === "add-window" && !placementLocked && hoveredPlacement
      ? hoveredPlacement.position
      : placement;
  const doorPreview: Door | null =
    hostId && floor
      ? {
          ...base("Door preview"),
          id: "preview",
          kind: "door",
          type: "hinged",
          direction: "unknown",
          wallId: hostId,
          positionAlongWall: openingPosition,
          positionReference: "OPENING_START",
          width:
            tool === "add-window" ? windowDefaults.width : doorDefaults.width,
          height: doorDefaults.height,
          sillHeight: 0,
          fromRoomId: null,
          toRoomId: null,
          hingedOrientation: {
            hingeEndpoint: doorDefaults.hingeEndpoint,
            swingSide: doorDefaults.swingSide,
          },
        }
      : null;
  const windowPreview: Window | null =
    tool === "add-window" && doorPreview
      ? {
          ...base("Window preview"),
          id: windowPreviewId,
          kind: "window",
          wallId: doorPreview.wallId,
          positionAlongWall: openingPosition,
          positionReference: "OPENING_START",
          fromRoomId: null,
          toRoomId: null,
          width: windowDefaults.width,
          type: windowDefaults.type,
          ...windowElevations,
          verticalReference: "WORLD",
          height: null,
          sillHeight: null,
          assembly: newWindowAssembly(panelPreviewId),
        }
      : null;
  const windowPlacementError = (() => {
    if (!windowPreview || !floor) return "";

    const candidate = {
      ...scene,
      floors: scene.floors.map((f) =>
        f.id === floor.id
          ? { ...f, windows: [...f.windows, windowPreview] }
          : f,
      ),
    };
    return validateScene(candidate)
      .filter(
        (issue) =>
          issue.entityId === windowPreview.id && issue.severity === "error",
      )
      .map((issue) => issue.message)
      .join(" ");
  })();
  const windowElevationRequired =
    !!windowPreview &&
    (windowElevations.bottomElevation === null ||
      windowElevations.topElevation === null);
  const windowCanConfirm =
    !!windowPreview &&
    placementLocked &&
    !windowPlacementError &&
    !windowElevationRequired;
  const addWall = (end: Point) =>
    safely(() => {
      const start = points.at(-1);
      if (!start) return;
      if (distance(start, end) < 1e-6)
        throw new Error("Wall must have positive length");
      editFloor((f) => {
        f.walls.push({
          ...base(`Wall ${f.walls.length + 1}`),
          kind: "wall",
          start,
          end,
          ...wallDefaults,
          base: 0,
          connectedWallIds: [],
          leftRoomId: null,
          rightRoomId: null,
        });
        return splitJunctions(f, id);
      }, "Drawn wall; dimensions are editable user input");
      setPoints([end]);
      setLengthInput("");
    });
  const deleteEntity = (entityId = selected) =>
    safely(() => {
      if (floor?.itemInstances?.some((i) => i.id === entityId)) {
        editFloor(
          (f) => ({
            ...f,
            itemInstances: (f.itemInstances ?? []).filter(
              (i) => i.id !== entityId,
            ),
          }),
          "Removed Item",
        );
        select(null);
        return;
      }
      const entity = floor && entitiesOf(floor).find((e) => e.id === entityId);
      if (!entity) return;
      if (entity.kind === "room" && entity.topology)
        throw new Error("Edit the bounding walls to change this Space.");
      if (entity.kind === "wall") {
        const dependencies = wallDependencies(floor!, entity.id).filter(
          (e) => e.kind !== "room" || !e.topology,
        );
        if (dependencies.length)
          throw new Error(
            `Deletion blocked: ${entity.name} contains or bounds ${dependencies.map((e) => e.name).join(", ")}. Remove those relationships explicitly first.`,
          );
      }
      editFloor((f) => {
        for (const key of [
          "walls",
          "rooms",
          "doors",
          "windows",
          "openings",
          "dimensions",
          "columns",
          "stairs",
          "shafts",
          "zones",
        ] as const) {
          const index = f[key].findIndex((e) => e.id === entity.id);
          if (index >= 0) f[key].splice(index, 1);
        }
        if (entity.kind === "room") {
          for (const w of f.walls) {
            if (w.leftRoomId === entity.id) w.leftRoomId = null;
            if (w.rightRoomId === entity.id) w.rightRoomId = null;
          }
          for (const o of [...f.doors, ...f.windows, ...f.openings]) {
            if (o.fromRoomId === entity.id) o.fromRoomId = null;
            if (o.toRoomId === entity.id) o.toRoomId = null;
          }
          for (const z of f.zones)
            z.roomIds = z.roomIds.filter((r) => r !== entity.id);
        }
        reconnectWalls(f);
      }, `Deleted ${entity.name}`);
      select(null);
    });
  const onPoint = (p: Point) => {
    if (busy || !floor) return;
    const snapped = snap(p, points.at(-1));
    if (tool === "draw-wall") {
      if (!points.length) setPoints([snapped.point]);
      else if (distance(points.at(-1)!, snapped.point) >= 1e-6 || lengthInput)
        safely(() =>
          addWall(
            lengthInput && pointer
              ? exactEndpoint(points[0], pointer, Number(lengthInput))
              : snapped.point,
          ),
        );
    }
    if (tool === "manual-room")
      setPoints((ps) => {
        // Closing at the first vertex or clicking the last vertex twice must not
        // add a duplicate vertex to the polygon.
        if (
          ps.some(
            (v, i) =>
              (i === 0 || i === ps.length - 1) &&
              distance(v, snapped.point) < 1e-6,
          )
        )
          return ps;
        return [...ps, snapped.point];
      });
    if (tool === "measure")
      setPoints((ps) =>
        ps.length >= 2 ? [snapped.point] : [...ps, snapped.point],
      );
    if (tool === "add-door" || tool === "add-window") {
      const w =
        tool === "add-window"
          ? wallAt(p)
          : hostId
            ? floor.walls.find((w) => w.id === hostId)
            : wallAt(p);
      if (!w) {
        setError("Choose an existing wall as the host");
        return;
      }
      setPlacementLocked(tool === "add-window" || !!hostId);
      setHostId(w.id);
      if (tool === "add-window") {
        setWindowHoverPoint(p);
        // Lock the displayed ghost exactly; click coordinates can be rounded to pixels.
        setPlacement(
          !placementLocked && hostId === w.id && hoveredPlacement
            ? hoveredPlacement.position
            : windowPlacementAt(p, w, windowDefaults.width).position,
        );
      } else setPlacement(projectOnWall(p, w).along);
      setError("");
    }
  };
  const onHover = (p: Point) => {
    if (drag.current) {
      onDragMove(p);
      return;
    }
    const snapped = snap(p, points.at(-1));
    setPointer(snapped.point);
    setSnapLabel(snapped.label);
    const wall = wallAt(p);
    if (tool === "add-window") {
      if (busy) return;
      if (!placementLocked) {
        setHoverId(wall?.id ?? null);
        setHostId(wall?.id ?? null);
        setWindowHoverPoint(wall ? p : null);
        setError("");
      }
      return;
    }
    setHoverId(wall?.id ?? null);
    if (hostId && !placementLocked && tool === "add-door") {
      const host = floor?.walls.find((w) => w.id === hostId);
      if (host) setPlacement(projectOnWall(p, host).along);
    }
  };
  const onLeave = () => {
    if (tool === "add-window" && !placementLocked) {
      setHostId(null);
      setWindowHoverPoint(null);
      setHoverId(null);
    }
  };
  const confirmRoom = () =>
    safely(() => {
      const boundary = points;
      if (!boundary || boundary.length < 3 || !simplePolygon(boundary))
        throw new Error("Choose at least three manual boundary vertices");
      editFloor((f) => {
        const room: Room = {
          ...base(roomName.trim() || "Room"),
          kind: "room",
          floorElevation: 0,
          ceilingElevation: null,
          type: roomType,
          boundary,
          area: area(boundary),
          boundarySource: "manual",
          semantic: {
            confidence: null,
            verification: roomType === "unknown" ? "UNKNOWN" : "USER_CORRECTED",
            evidenceIds: [],
          },
          geometry: {
            confidence: null,
            verification: "USER_CORRECTED",
            evidenceIds: [],
          },
        };
        f.rooms.push(room);
        select(room.id);
        return f;
      }, "Manually defined room boundary");
      activate("select");
    });
  const confirmOpening = () =>
    safely(() => {
      if (!doorPreview) throw new Error("Choose a host wall first");
      if (tool === "add-window" && !windowCanConfirm)
        throw new Error(
          windowPlacementError ||
            (windowElevationRequired
              ? "Enter sill and height, or explicit world elevations, before confirming."
              : "Click a wall to fix the candidate before confirming."),
        );
      const opening = {
        ...doorPreview,
        id: id(),
        name: `${tool === "add-window" ? "Window" : "Door"} ${(tool === "add-window" ? floor!.windows : floor!.doors).length + 1}`,
      };
      const test = structuredClone(scene),
        f = test.floors.find((f) => f.id === floor!.id)!;
      const {
        hingedOrientation: ignoredHinge,
        direction: ignoredDirection,
        ...windowBase
      } = opening;
      void ignoredHinge;
      void ignoredDirection;
      const newWindow: Window = {
        ...windowBase,
        kind: "window",
        width: windowDefaults.width,
        type: windowDefaults.type,
        ...windowElevations,
        verticalReference: "WORLD",
        height: null,
        sillHeight: null,
        assembly: newWindowAssembly(id()),
      };
      if (tool === "add-window") f.windows.push(newWindow);
      else f.doors.push(opening);
      const errors = validateScene(test).filter(
        (i) => i.entityId === opening.id && i.severity === "error",
      );
      if (errors.length)
        throw new Error(
          errors
            .map((i) => `${i.code ? i.code + ": " : ""}${i.message}`)
            .join("; "),
        );
      editFloor((f) => {
        if (tool === "add-window") f.windows.push(newWindow);
        else f.doors.push(opening);
      }, "Hosted opening placed by user");
      select(opening.id);
      activate("select");
    });
  const updateEntity = (patch: Record<string, unknown>) =>
    safely(() =>
      editFloor((f) => {
        const entity = entitiesOf(f).find((e) => e.id === selected);
        if (!entity) return;
        if (entity.kind === "wall" && (patch.start || patch.end))
          return splitJunctions(
            moveWall(
              f,
              entity.id,
              (patch.start as Point) ?? entity.start,
              (patch.end as Point) ?? entity.end,
            ),
            id,
          );
        Object.assign(entity, patch);
        if (entity.kind === "door" && entity.type !== "hinged")
          entity.hingedOrientation = null;
        if (entity.kind === "room" && (patch.name || patch.type))
          entity.semantic = {
            ...entity.semantic,
            verification: "USER_CORRECTED",
          };
      }, "Edited architectural properties"),
    );
  const onDragStart = (
    wallId: string,
    part: "wall" | "start" | "end" | "window",
    p: Point,
  ) => {
    if (tool !== "select" || busy) return;
    select(wallId);
    drag.current = { scene: history.present, wallId, part, origin: p };
  };
  const onDragMove = (p: Point) => {
    const d = drag.current;
    if (!d) return;
    const f = d.scene.floors.find((f) => f.id === floor!.id)!,
      window =
        d.part === "window"
          ? f.windows.find((o) => o.id === d.wallId)
          : undefined,
      w = f.walls.find((w) => w.id === (window?.wallId ?? d.wallId))!;
    if (window) {
      const next = structuredClone(d.scene),
        target = next.floors
          .find((fl) => fl.id === f.id)!
          .windows.find((o) => o.id === window.id)!;
      target.positionAlongWall = windowDragPosition(window, w, d.origin, p);
      previewRef.current = next;
      setPreview(next);
      return;
    }
    let start = w.start,
      end = w.end;
    if (d.part === "wall") {
      const target = {
        x: w.start.x + p.x - d.origin.x,
        y: w.start.y + p.y - d.origin.y,
      };
      const s = snapDrawing(
        target,
        f.walls.filter((o) => o.id !== w.id),
        undefined,
        snapGrid ? spacing : undefined,
      );
      setSnapLabel(s.label);
      start = s.point;
      end = {
        x: w.end.x + start.x - w.start.x,
        y: w.end.y + start.y - w.start.y,
      };
    } else {
      const s = snapDrawing(
        p,
        f.walls.filter((o) => o.id !== w.id),
        d.part === "start" ? w.end : w.start,
        snapGrid ? spacing : undefined,
      );
      setSnapLabel(s.label);
      if (d.part === "start") start = s.point;
      else end = s.point;
    }
    const next = {
      ...d.scene,
      floors: d.scene.floors.map((fl) =>
        fl.id === f.id ? moveWall(fl, w.id, start, end) : fl,
      ),
    };
    previewRef.current = next;
    setPreview(next);
  };
  const onDragEnd = () => {
    const d = drag.current,
      next = previewRef.current;
    drag.current = null;
    previewRef.current = null;
    setPreview(null);
    if (d && next) {
      const f = next.floors.find((f) => f.id === floor!.id)!;
      safely(() =>
        editFloor(
          () => splitJunctions(f, id),
          "Moved wall with connected endpoints and hosted openings",
        ),
      );
    }
  };
  const undo = () => {
    reset();
    setHistory(undoDraft);
  };
  const redo = () => {
    reset();
    setHistory(redoDraft);
  };
  const save = async () => {
    if (busy || !dirty) return;
    try {
      const issues = validateScene(history.present).filter(
        (i) => i.severity === "error",
      );
      if (issues.length)
        throw new Error(
          issues
            .map((i) => `${i.code ? i.code + ": " : ""}${i.message}`)
            .join("; "),
        );
      setBusy(true);
      setError("");
      const result = await client.save(scene.id, {
        expectedRevision: baseline.revision,
        scene: history.present,
        writerCapabilities: [
          "door-orientation-v1",
          "window-assembly-v1",
          "items-v1",
        ],
      });
      accept(result);
      setMessage("Changes saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };
  const createDimension = () =>
    safely(() => {
      if (points.length !== 2) throw new Error("Measure two points first");
      editFloor((f) => {
        f.dimensions.push({
          ...base(`Dimension ${f.dimensions.length + 1}`),
          kind: "dimension",
          start: points[0],
          end: points[1],
          value: distance(points[0], points[1]),
          ...Object.fromEntries(
            points
              .map((p, i) => {
                const wall = f.walls.find(
                  (w) =>
                    distance(w.start, p) < 1e-7 || distance(w.end, p) < 1e-7,
                );
                return wall
                  ? [
                      i === 0 ? "startAnchor" : "endAnchor",
                      {
                        wallId: wall.id,
                        endpoint:
                          distance(wall.start, p) < 1e-7 ? "start" : "end",
                      },
                    ]
                  : ["unused", undefined];
              })
              .filter(([key]) => key !== "unused"),
          ),
        });
      }, "User-authored dimension");
      activate("select");
    });
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (!busy && tool === "add-window" && e.key === "Escape") {
        e.preventDefault();
        activate("select");
        return;
      }
      if (
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          e.target.closest("input,textarea,select"))
      )
        return;
      if (busy) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (mod) return;
      if (e.key === "Escape") {
        e.preventDefault();
        activate("select");
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteEntity();
        return;
      }
      if (tool === "draw-wall" && points.length && /^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        setLengthInput((v) => v + e.key);
        return;
      }
      if (e.key === "Enter" && tool === "draw-wall") {
        e.preventDefault();
        if (lengthInput && pointer)
          safely(() =>
            addWall(exactEndpoint(points[0], pointer, Number(lengthInput))),
          );
        else reset();
        return;
      }
      if (
        e.key === "Enter" &&
        tool === "add-window" &&
        windowCanConfirm &&
        !(e.target instanceof HTMLElement && e.target.closest("button,summary"))
      ) {
        e.preventDefault();
        confirmOpening();
        return;
      }
      const map: Record<string, string> = {
        v: "select",
        h: "pan",
        w: "draw-wall",

        d: "add-door",
        n: "add-window",
        m: "measure",
      };
      if (map[e.key.toLowerCase()]) {
        e.preventDefault();
        activate(map[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  const interaction: DrawingInteraction = {
    tool,
    grid,
    spacing,
    hoverId: tool === "add-window" && placementLocked ? hostId : hoverId,
    pointer,
    snapLabel,
    points,
    doorPreview,
    windowPreview,
    windowPlacementError:
      windowPlacementError ||
      (windowElevationRequired ? "Window elevations required" : ""),
    windowPlacementLocked: placementLocked,
    windowPlacementAdjusted: !placementLocked && !!hoveredPlacement?.adjusted,
    onPoint,
    onLeave,
    onHover,
    onFinish: () => {
      if (busy) return;
      if (tool === "draw-wall") activate("select");
      else if (tool === "manual-room") confirmRoom();
    },
    onSelect: (id) => {
      if (tool === "delete" && id) deleteEntity(id);
      else if (tool === "select") select(id);
    },
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel: reset,
  };
  return {
    scene,
    floor,
    dirty,
    busy,
    accept,
    commit,
    editFloor,
    activate,
    reset,
    interaction,
    grid,
    setGrid,
    snapGrid,
    setSnapGrid,
    spacing,
    setSpacing,
    wallDefaults,
    setWallDefaults,
    doorDefaults,
    setDoorDefaults,
    windowDefaults,
    setWindowDefaults,
    windowReference,
    windowUsesWorld,
    windowElevations,
    windowWorldValues,
    setWindowWorldValues,
    setWindowWorldMode: (enabled: boolean) => {
      if (enabled) setWindowWorldValues(windowElevations);
      setWindowWorldMode(enabled);
    },
    windowCanConfirm,
    windowElevationRequired,
    placementLocked,
    roomName,
    setRoomName,
    roomType,
    setRoomType,
    lengthInput,
    setLengthInput,
    points,
    pointer,
    hostId,
    windowPlacementError,
    placement: openingPosition,
    setPlacement: (n: number) => {
      setPlacement(n);
      setPlacementLocked(true);
    },
    confirmRoom,
    confirmOpening,
    addWall,
    updateEntity,
    deleteEntity,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    save,
    error,
    setError,
    message,
    blocker,
    createDimension,
  };
}
export type DrawingEditor = ReturnType<typeof useDrawing>;

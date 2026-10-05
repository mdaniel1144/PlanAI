import {
  windowAssemblySchema,
  type Window,
  type WindowPanel,
  type WindowGlazing,
  type Wall,
  type Floor,
  type HomeScene,
  type Door,
  type Opening,
  type Point,
} from "@habitat/domain";
const EPS = 1e-7;
export type WindowIssue = {
  entityId: string;
  code: string;
  message: string;
  severity: "error" | "warning";
};
/** Legacy sill is relative to floor elevation + host base, never a Room floor. */
export function openingElevations(
  o: Window | Door | Opening,
  w: Wall,
  floor: Floor,
) {
  if (o.kind === "window" && o.verticalReference === "WORLD") {
    const bottom = o.bottomElevation ?? null,
      top = o.topElevation ?? null;
    return {
      bottom,
      top,
      height: bottom === null || top === null ? null : top - bottom,
    };
  }
  const bottom =
    floor.elevation === null || w.base === null || o.sillHeight === null
      ? null
      : floor.elevation + w.base + o.sillHeight;
  const top = bottom === null || o.height === null ? null : bottom + o.height;
  return { bottom, top, height: o.height };
}
export function windowSills(o: Window, w: Wall, floor: Floor) {
  const { bottom } = openingElevations(o, w, floor);
  return floor.rooms
    .filter(
      (r) =>
        [w.leftRoomId, w.rightRoomId].includes(r.id) ||
        r.boundaryEdges?.some((e) => e.kind === "WALL" && e.wallId === w.id),
    )
    .map((r) => ({
      roomId: r.id,
      name: r.name,
      sillHeight:
        bottom === null || r.floorElevation === null
          ? null
          : bottom - r.floorElevation,
    }));
}
/** Projects onto the infinite host axis. Invalid intervals remain visible and editable. */
export function windowDragPosition(
  o: Window,
  w: Wall,
  origin: Point,
  target: Point,
) {
  const length = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
  return o.positionAlongWall === null || length < EPS
    ? null
    : o.positionAlongWall +
        ((target.x - origin.x) * (w.end.x - w.start.x) +
          (target.y - origin.y) * (w.end.y - w.start.y)) /
          length;
}
export function reverseWindowPanels(o: Window) {
  if (!o.assembly?.panels) return;
  for (const p of o.assembly.panels) {
    p.region.x = 1 - p.region.x - p.region.width;
    if (p.orientation) {
      if (p.orientation.hingeEndpoint !== "UNKNOWN")
        p.orientation.hingeEndpoint =
          p.orientation.hingeEndpoint === "PANEL_START"
            ? "PANEL_END"
            : "PANEL_START";
      if (p.orientation.swingSide !== "UNKNOWN")
        p.orientation.swingSide =
          p.orientation.swingSide === "WALL_LEFT" ? "WALL_RIGHT" : "WALL_LEFT";
    }
    if (p.slideDirection === "TOWARD_PANEL_START")
      p.slideDirection = "TOWARD_PANEL_END";
    else if (p.slideDirection === "TOWARD_PANEL_END")
      p.slideDirection = "TOWARD_PANEL_START";
  }
}
export function physicalOpeningOverlap(
  a: Window | Door | Opening,
  b: Window | Door | Opening,
  wall: Wall,
  floor: Floor,
) {
  if (
    a.wallId !== b.wallId ||
    a.width === null ||
    b.width === null ||
    a.positionAlongWall === null ||
    b.positionAlongWall === null
  )
    return false;
  const ax = a.positionAlongWall - (a.positionReference ? 0 : a.width / 2),
    bx = b.positionAlongWall - (b.positionReference ? 0 : b.width / 2);
  const az = openingElevations(a, wall, floor),
    bz = openingElevations(b, wall, floor);
  return (
    az.bottom !== null &&
    az.top !== null &&
    bz.bottom !== null &&
    bz.top !== null &&
    Math.min(ax + a.width, bx + b.width) - Math.max(ax, bx) > EPS &&
    Math.min(az.top, bz.top) - Math.max(az.bottom, bz.bottom) > EPS
  );
}
export function visibleGlassSize(
  o: Window,
  panel: WindowPanel,
  height: number | null,
) {
  const p = o.assembly?.profile;
  if (
    !p ||
    o.width === null ||
    height === null ||
    p.frameFaceWidth === null ||
    (panel.function === "OPERABLE" && p.sashFaceWidth === null)
  )
    return null;
  const r = panel.region,
    f = p.frameFaceWidth,
    s = panel.function === "OPERABLE" ? p.sashFaceWidth! : 0;
  // A shared mullion/transom occupies half its face in each adjacent panel.
  return {
    width:
      o.width * r.width -
      f * ((r.x < EPS ? 1 : 0.5) + (r.x + r.width > 1 - EPS ? 1 : 0.5)) -
      2 * s,
    height:
      height * r.height -
      f * ((r.y < EPS ? 1 : 0.5) + (r.y + r.height > 1 - EPS ? 1 : 0.5)) -
      2 * s,
  };
}
/** Classify structural schema failures consistently at HTTP and application boundaries. */
export function windowAssemblyIssueCode(path: readonly PropertyKey[]) {
  if (path[0] === "shutter") return "WINDOW_INVALID_SHUTTER";
  if (path[0] === "screen") return "WINDOW_INVALID_SCREEN";
  if (path[0] === "profile") return "WINDOW_INVALID_PROFILE";
  if (path.includes("glazing")) return "WINDOW_INVALID_GLAZING";
  if (
    ["operation", "orientation", "slideDirection", "function", "tracks"].some(
      (key) => path.includes(key),
    )
  )
    return "WINDOW_INVALID_PANEL_OPERATION";
  return "WINDOW_INVALID_PANEL_LAYOUT";
}
export function validateWindows(scene: HomeScene): WindowIssue[] {
  const issues: WindowIssue[] = [];
  const panelIds = new Set<string>();
  for (const floor of scene.floors)
    for (const o of floor.windows) {
      const add = (
        code: string,
        message: string,
        severity: "error" | "warning" = "error",
      ) =>
        issues.push({
          entityId: o.id,
          code: `WINDOW_${code}`,
          message,
          severity,
        });
      const w = floor.walls.find(
        (w) => w.id === o.wallId && w.verification !== "REJECTED",
      );
      if (!w)
        add(
          scene.floors.some(
            (f) => f.id !== floor.id && f.walls.some((w) => w.id === o.wallId),
          )
            ? "HOST_FLOOR_MISMATCH"
            : "MISSING_HOST_WALL",
          "Window requires an active wall on its own floor",
        );
      if (o.floorId !== floor.id || (w && w.floorId !== o.floorId))
        add(
          "HOST_FLOOR_MISMATCH",
          "Window and host must belong to the same floor",
        );
      if (o.positionAlongWall !== null && o.positionAlongWall < 0)
        add("INVALID_POSITION", "Window position must be nonnegative");
      if (o.width !== null && o.width <= 0)
        add("INVALID_WIDTH", "Window width must be positive");
      if (o.verticalReference === "WORLD") {
        if (o.height !== null || o.sillHeight !== null)
          add(
            "INVALID_ELEVATION",
            "World elevations cannot coexist with independent height or sill height",
          );
      } else if (o.bottomElevation != null || o.topElevation != null)
        add("INVALID_ELEVATION", "World elevations require WORLD reference");
      if (w && o.verification !== "REJECTED") {
        const z = openingElevations(o, w, floor),
          base =
            floor.elevation === null || w.base === null
              ? null
              : floor.elevation + w.base;
        if (z.bottom !== null && z.top !== null && z.top <= z.bottom)
          add(
            "INVALID_ELEVATION",
            "Top elevation must exceed bottom elevation",
          );
        if (base !== null && z.bottom !== null && z.bottom < base - EPS)
          add("BELOW_WALL_BASE", "Window bottom is below host wall base");
        if (
          base !== null &&
          w.height !== null &&
          z.top !== null &&
          z.top > base + w.height + EPS
        )
          add("EXCEEDS_WALL_HEIGHT", "Window top exceeds host wall top");
        if (o.width !== null && o.positionAlongWall !== null) {
          const start =
            o.positionAlongWall - (o.positionReference ? 0 : o.width / 2);
          if (
            start < -EPS ||
            start + o.width >
              Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y) + EPS
          )
            add("OUTSIDE_HOST_WALL", "Window extends beyond host wall");
        }
        if (
          z.bottom === null ||
          z.top === null ||
          o.width === null ||
          o.positionAlongWall === null
        )
          add(
            "UNKNOWN_GEOMETRY",
            "Window geometry is unknown; host solid omitted",
            "warning",
          );
        for (const other of [
          ...floor.windows,
          ...floor.doors,
          ...floor.openings,
        ])
          if (
            other.id !== o.id &&
            other.verification !== "REJECTED" &&
            physicalOpeningOverlap(o, other, w, floor)
          )
            add(
              other.kind === "door" ? "OVERLAPS_DOOR" : "OVERLAP",
              `Window physically overlaps ${other.name}`,
            );
      }
      const a = o.assembly;
      if (!a) continue;
      const parsed = windowAssemblySchema.safeParse(a);
      if (!parsed.success) {
        for (const i of parsed.error.issues) {
          add(
            windowAssemblyIssueCode(i.path).replace("WINDOW_", ""),
            i.message,
          );
        }
        continue;
      }
      for (const [key, n] of Object.entries(a.profile))
        if (typeof n === "number" && n <= 0)
          add("INVALID_PROFILE", `${key} must be positive when known`);
      const glass = (g: WindowGlazing) => {
        if (
          [g.glassThickness, g.overallGlazingThickness].some(
            (n) => n !== null && n <= 0,
          ) ||
          (g.glassThickness !== null &&
            g.overallGlazingThickness !== null &&
            g.glassThickness > g.overallGlazingThickness)
        )
          add(
            "INVALID_GLAZING",
            "Glazing thicknesses must be positive and glass cannot exceed total glazing thickness",
          );
      };
      glass(a.glazing);
      if (a.tracks !== null && (!Number.isInteger(a.tracks) || a.tracks < 1))
        add(
          "INVALID_PANEL_OPERATION",
          "Track count must be a positive integer when known",
        );
      if (
        a.shutter.type === "NONE" &&
        (a.shutter.operation !== "UNKNOWN" || a.shutter.boxType !== "NONE")
      )
        add(
          "INVALID_SHUTTER",
          "No shutter cannot retain operation or box configuration",
        );
      if (a.shutter.type === "UNKNOWN" && a.shutter.operation !== "UNKNOWN")
        add("INVALID_SHUTTER", "Choose a shutter type before its operation");
      if (a.panels === null) continue;
      const indexes = new Set<number>();
      let coverage = 0;
      for (const p of a.panels) {
        const r = p.region;
        if (panelIds.has(p.id) || indexes.has(p.index))
          add("INVALID_PANEL_LAYOUT", "Panel IDs and indexes must be unique");
        panelIds.add(p.id);
        indexes.add(p.index);
        if (
          r.width <= 0 ||
          r.height <= 0 ||
          r.x < -EPS ||
          r.y < -EPS ||
          r.x + r.width > 1 + EPS ||
          r.y + r.height > 1 + EPS
        )
          add(
            "INVALID_PANEL_LAYOUT",
            "Panel region must be positive and inside the opening",
          );
        coverage += r.width * r.height;
        if (
          (p.function === "FIXED" && p.operation !== "FIXED") ||
          (p.function === "OPERABLE" && p.operation === "FIXED") ||
          (p.orientation !== null &&
            !["CASEMENT", "TILT_TURN"].includes(p.operation)) ||
          (p.slideDirection !== null && p.operation !== "SLIDING")
        )
          add(
            "INVALID_PANEL_OPERATION",
            "Panel function and direction must match its operation",
          );
        if (p.glazing) glass(p.glazing);
        if (w) {
          const size = visibleGlassSize(
            o,
            p,
            openingElevations(o, w, floor).height,
          );
          if (size && (size.width <= 0 || size.height <= 0))
            add(
              "INVALID_PROFILE",
              "Profile consumes the panel's visible glass region",
            );
        }
      }
      if (
        Math.abs(coverage - 1) > EPS ||
        indexes.size !== a.panels.length ||
        a.panels.some((p) => p.index >= a.panels!.length)
      )
        add(
          "INVALID_PANEL_LAYOUT",
          "Panel regions must cover the opening exactly, with contiguous indexes",
        );
      for (let i = 0; i < a.panels.length; i++)
        for (let j = i + 1; j < a.panels.length; j++) {
          const r = a.panels[i].region,
            s = a.panels[j].region;
          if (
            Math.min(r.x + r.width, s.x + s.width) - Math.max(r.x, s.x) > EPS &&
            Math.min(r.y + r.height, s.y + s.height) - Math.max(r.y, s.y) > EPS
          )
            add("INVALID_PANEL_LAYOUT", "Panel regions overlap");
        }
    }
  return issues;
}

export type WindowPart = {
  role: "frame" | "mullion" | "transom" | "sash" | "glass";
  panelId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  glazing?: WindowGlazing;
};
/** Renderer-only illustration. Null canonical dimensions stay null; no persistence uses this result. */
export function windowRenderParts(o: Window, wall: Wall, floor: Floor) {
  const { height } = openingElevations(o, wall, floor),
    width = o.width;
  if (height === null || width === null || height <= 0 || width <= 0)
    return { parts: [] as WindowPart[], illustrative: true };
  const a = o.assembly,
    profile = a?.profile;
  const f = profile?.frameFaceWidth ?? Math.min(0.04, width / 8, height / 8),
    fd = profile?.frameDepth ?? Math.min(0.08, wall.thickness ?? 0.2);
  const sf = profile?.sashFaceWidth ?? Math.min(0.025, width / 12, height / 12),
    sd = profile?.sashDepth ?? 0.04;
  const parts: WindowPart[] = [];
  const add = (
    role: WindowPart["role"],
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    panelId: string | null = null,
    glazing?: WindowGlazing,
  ) => {
    if (width > EPS && height > EPS && depth > EPS)
      parts.push({
        role,
        x,
        y,
        width,
        height,
        depth,
        panelId,
        ...(glazing ? { glazing } : {}),
      });
  };
  const border = (
    role: "frame" | "sash",
    x: number,
    y: number,
    w: number,
    h: number,
    face: number,
    depth: number,
    panelId: string | null,
  ) => {
    add(role, x, y, face, h, depth, panelId);
    add(role, x + w - face, y, face, h, depth, panelId);
    add(role, x + face, y, w - 2 * face, face, depth, panelId);
    add(role, x + face, y + h - face, w - 2 * face, face, depth, panelId);
  };
  border("frame", 0, 0, width, height, f, fd, null);
  const regions = a?.panels?.map((p) => ({
    id: p.id,
    region: p.region,
    operable: p.function === "OPERABLE",
    glazing: p.glazing ?? a.glazing,
  })) ?? [
    {
      id: null,
      region: { x: 0, y: 0, width: 1, height: 1 },
      operable: false,
      glazing: a?.glazing,
    },
  ];
  const bars = new Set<string>();
  for (const p of regions) {
    const r = p.region;
    for (const x of [r.x, r.x + r.width])
      if (x > EPS && x < 1 - EPS) {
        const key = `v:${x.toFixed(8)}:${r.y.toFixed(8)}:${r.height.toFixed(8)}`;
        if (!bars.has(key)) {
          add(
            "mullion",
            x * width - f / 2,
            r.y * height,
            f,
            r.height * height,
            fd,
          );
          bars.add(key);
        }
      }
    for (const y of [r.y, r.y + r.height])
      if (y > EPS && y < 1 - EPS) {
        const key = `h:${y.toFixed(8)}:${r.x.toFixed(8)}:${r.width.toFixed(8)}`;
        if (!bars.has(key)) {
          add(
            "transom",
            r.x * width,
            y * height - f / 2,
            r.width * width,
            f,
            fd,
          );
          bars.add(key);
        }
      }
    const left = f * (r.x < EPS ? 1 : 0.5),
      right = f * (r.x + r.width > 1 - EPS ? 1 : 0.5),
      bottom = f * (r.y < EPS ? 1 : 0.5),
      top = f * (r.y + r.height > 1 - EPS ? 1 : 0.5);
    const x = r.x * width + left,
      y = r.y * height + bottom,
      pw = r.width * width - left - right,
      ph = r.height * height - bottom - top,
      sash = p.operable ? sf : 0;
    if (p.operable) border("sash", x, y, pw, ph, sf, sd, p.id);
    add(
      "glass",
      x + sash,
      y + sash,
      pw - 2 * sash,
      ph - 2 * sash,
      p.glazing?.overallGlazingThickness ?? p.glazing?.glassThickness ?? 0.008,
      p.id,
      p.glazing,
    );
  }
  return {
    parts,
    illustrative:
      !profile || Object.values(profile).some((v) => v === null) || !a?.panels,
  };
}

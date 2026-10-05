import type { Floor, Point, Wall } from "@habitat/domain";
import { distance, projectOnWall } from "./core";

export type WindowSillReference = {
  elevation: number | null;
  source: "space" | "floor" | "unknown";
  name: string;
  note: string;
};

/** Never infer a level from array order or assume that an unknown level is zero. */
export function windowSillReference(
  floor: Floor,
  wall?: Wall,
): WindowSillReference {
  if (!wall || wall.floorId !== floor.id || wall.verification === "REJECTED")
    return {
      elevation: null,
      source: "unknown",
      name: "",
      note: "Choose a host wall to resolve the sill reference.",
    };
  const known = floor.rooms
    .filter(
      (room) =>
        room.floorId === floor.id &&
        room.verification !== "REJECTED" &&
        room.floorElevation !== null &&
        Number.isFinite(room.floorElevation) &&
        ([wall.leftRoomId, wall.rightRoomId].includes(room.id) ||
          room.boundaryEdges?.some(
            (edge) => edge.kind === "WALL" && edge.wallId === wall.id,
          )),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const levels = new Set(known.map((room) => room.floorElevation));
  if (levels.size === 1)
    return {
      elevation: known[0].floorElevation,
      source: "space",
      name: known.map((room) => room.name).join(" / "),
      note: "",
    };
  const note =
    levels.size > 1
      ? "Adjacent spaces have different floor elevations; no unique space reference."
      : "No adjacent space has a known floor elevation.";
  if (floor.elevation !== null && Number.isFinite(floor.elevation))
    return {
      elevation: floor.elevation,
      source: "floor",
      name: floor.name,
      note: `${note} Using the active Floor elevation.`,
    };
  return {
    elevation: null,
    source: "unknown",
    name: "",
    note: `${note} Floor/Space elevation is unknown or ambiguous. Enter explicit world elevations.`,
  };
}

export function windowWorldElevationFromSill(
  reference: number | null,
  sill: number | null,
) {
  return reference === null || sill === null ? null : reference + sill;
}
export function windowSillFromWorldElevation(
  bottom: number | null,
  reference: number | null,
) {
  return bottom === null || reference === null ? null : bottom - reference;
}
export function windowTopFromHeight(
  bottom: number | null,
  height: number | null,
) {
  return bottom === null || height === null ? null : bottom + height;
}
export function windowHeightFromWorldElevations(
  bottom: number | null,
  top: number | null,
) {
  return bottom === null || top === null ? null : top - bottom;
}

/** Opening-start placement on the directed wall; the requested width is never resized. */
export function windowPlacementAt(pointer: Point, wall: Wall, width: number) {
  const length = distance(wall.start, wall.end);
  const projected = projectOnWall(pointer, wall);
  const rawAlong =
    length === 0
      ? 0
      : ((pointer.x - wall.start.x) * (wall.end.x - wall.start.x) +
          (pointer.y - wall.start.y) * (wall.end.y - wall.start.y)) /
        length;
  const fits = width > 0 && width <= length;
  const position = fits
    ? Math.min(projected.along, length - width)
    : projected.along;
  return { position, adjusted: fits && Math.abs(rawAlong - position) > 1e-7 };
}

import type { Floor } from "./index";
export type RoomConnection = { openingId: string; from: string; to: string };
/** Edges require explicit room references and a valid, active wall host. */
export function connectivity(floor: Floor): RoomConnection[] {
  const rooms = new Set(
    floor.rooms.filter((r) => r.verification !== "REJECTED").map((r) => r.id),
  );
  return [...floor.doors, ...floor.openings]
    .filter((o) => {
      const wall = floor.walls.find(
        (w) => w.id === o.wallId && w.verification !== "REJECTED",
      );
      return (
        wall &&
        o.verification !== "REJECTED" &&
        o.fromRoomId &&
        o.toRoomId &&
        o.fromRoomId !== o.toRoomId &&
        rooms.has(o.fromRoomId) &&
        rooms.has(o.toRoomId) &&
        [wall.leftRoomId, wall.rightRoomId].includes(o.fromRoomId) &&
        [wall.leftRoomId, wall.rightRoomId].includes(o.toRoomId)
      );
    })
    .map((o) => ({ openingId: o.id, from: o.fromRoomId!, to: o.toRoomId! }));
}

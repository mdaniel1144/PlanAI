import type { Floor } from "@habitat/domain";
import { distance } from "@habitat/geometry";
export const roomColors: Record<string, string> = {
  living_room: "#e8ede5",
  kitchen: "#f1ecdf",
  bedroom: "#ece9e2",
  bathroom: "#e3ecec",
  hallway: "#f3f0e9",
  balcony: "#eeeee7",
};
export type Layers = {
  rooms: boolean;
  walls: boolean;
  doors: boolean;
  windows: boolean;
  dimensions: boolean;
  labels: boolean;
};
export function perimeter(floor: Floor, roomId: string) {
  const room = floor.rooms.find((r) => r.id === roomId);
  return room
    ? room.boundary.reduce(
        (n, p, i) =>
          n + distance(p, room.boundary[(i + 1) % room.boundary.length]),
        0,
      )
    : 0;
}

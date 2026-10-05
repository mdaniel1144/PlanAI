import type { Point, Door, Window } from "@habitat/domain";
export type DrawingInteraction = {
  tool: string;
  grid: boolean;
  spacing: number;
  hoverId: string | null;
  pointer: Point | null;
  snapLabel: string;
  points: Point[];
  doorPreview: Door | null;
  windowPreview: Window | null;
  windowPlacementError: string;
  windowPlacementLocked: boolean;
  windowPlacementAdjusted: boolean;
  onPoint: (p: Point) => void;
  onFinish: () => void;
  onHover: (p: Point) => void;
  onLeave: () => void;
  onSelect: (id: string | null) => void;
  onDragStart: (
    id: string,
    part: "start" | "end" | "wall" | "window",
    p: Point,
  ) => void;
  onDragMove: (p: Point) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
};

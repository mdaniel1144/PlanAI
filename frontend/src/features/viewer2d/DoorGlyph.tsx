import type { Door, Wall } from "@habitat/domain";
import { doorSwing } from "@habitat/geometry";
export function DoorGlyph({
  wall,
  door,
  selected = false,
}: {
  wall: Wall;
  door: Door;
  selected?: boolean;
}) {
  const swing = doorSwing(wall, door);
  if (!swing) return null;
  const { hinge, closedTip, leafTip, sweep } = swing;
  return (
    <g
      className="door-envelope"
      data-hinge={door.hingedOrientation?.hingeEndpoint}
      data-swing={door.hingedOrientation?.swingSide}
      pointerEvents="none"
      stroke={selected ? "var(--accent-primary)" : "var(--text-secondary)"}
      fill="none"
    >
      <path
        d={`M ${closedTip.x} ${closedTip.y} A ${door.width} ${door.width} 0 0 ${sweep} ${leafTip.x} ${leafTip.y}`}
        strokeWidth=".026"
      />
      <line
        x1={hinge.x}
        y1={hinge.y}
        x2={leafTip.x}
        y2={leafTip.y}
        strokeWidth=".055"
      />
      <circle
        cx={hinge.x}
        cy={hinge.y}
        r=".055"
        fill="currentColor"
        strokeWidth=".015"
      />
    </g>
  );
}

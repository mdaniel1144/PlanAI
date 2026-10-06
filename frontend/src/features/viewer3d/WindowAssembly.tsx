import type { Floor, Wall, Window } from "@habitat/domain";
import {
  openingElevations,
  openingInterval,
  wallPoint,
  windowRenderParts,
} from "@habitat/geometry";
export function WindowAssembly({
  window: w,
  wall,
  floor,
  selected,
  onSelect,
  interactive = true,
}: {
  interactive?: boolean;
  window: Window;
  wall: Wall;
  floor: Floor;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const interval = openingInterval(w),
    z = openingElevations(w, wall, floor),
    model = windowRenderParts(w, wall, floor);
  if (!interval || z.bottom === null) return null;
  const origin = wallPoint(wall, interval.start),
    angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
  return (
    <group
      name={`window:${w.id}`}
      position={[origin.x, z.bottom, -origin.y]}
      rotation={[0, angle, 0]}
      userData={{
        entityId: w.id,
        illustrativeProfile: model.illustrative,
        shutter: w.assembly?.shutter,
        screen: w.assembly?.screen,
      }}
      onClick={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        onSelect(w.id);
      }}
    >
      {model.parts.map((p, i) => (
        <mesh
          key={i}
          name={`window:${w.id}:${p.role}:${p.panelId ?? i}`}
          userData={{ entityId: w.id, panelId: p.panelId, role: p.role }}
          position={[p.x + p.width / 2, p.y + p.height / 2, 0]}
        >
          <boxGeometry args={[p.width, p.height, p.depth]} />
          <meshStandardMaterial
            color={
              selected
                ? "#6e9e80"
                : p.role !== "glass"
                  ? w.assembly?.profile.material === "WOOD"
                    ? "#a98863"
                    : "#66777b"
                  : p.glazing?.glassFinish === "TINTED"
                    ? "#507680"
                    : p.glazing?.glassFinish === "FROSTED"
                      ? "#d1e0df"
                      : "#a4c7ce"
            }
            transparent={p.role === "glass"}
            opacity={
              p.role === "glass"
                ? p.glazing?.glassFinish === "FROSTED"
                  ? 0.65
                  : 0.3
                : 1
            }
            roughness={p.role === "glass" ? 0.15 : 0.6}
            metalness={p.glazing?.glassFinish === "REFLECTIVE" ? 0.8 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

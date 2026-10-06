import { ItemModel } from "../items/ModelPreview";
import type { ItemPlacement } from "../items/useWorkspaceItems";
import { useDisplayPreferences } from "../../display/context";
import { themes } from "../../display/themes";
import { useState } from "react";
import { PlacedItems } from "../items/PlacedItems";
import { WindowAssembly } from "./WindowAssembly";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { Shape, DoubleSide, Plane, Vector3 } from "three";
import {
  projectFloor,
  pointInPolygon,
  windowRenderParts,
  openingElevations,
  distance,
  wallPoint,
  openingInterval,
  doorSwing,
} from "@habitat/geometry";
import type { Floor, Item, Point } from "@habitat/domain";
import { roomColors, type Layers } from "../viewer2d/layers";
export default function SceneView({
  floor,
  selected,
  onSelect,
  layers,
  items = [],
  placement,
  placementPoint,
  placementElevation = 0,
  placementValid = false,
  onPlacementHover,
  onPlace,
}: {
  placement?: ItemPlacement | null;
  placementPoint?: Point | null;
  placementElevation?: number;
  placementValid?: boolean;
  onPlacementHover?: (point: Point | null) => void;
  onPlace?: (point: Point) => void;
  items?: Item[];
  floor: Floor;
  selected: string | null;
  onSelect: (id: string | null) => void;
  layers: Layers;
}) {
  const palette = themes[useDisplayPreferences().theme].tokens;
  const p = projectFloor(floor);
  const [itemError, setItemError] = useState("");
  // Stable architectural frame: moving a ghost must never re-center the world.
  const points = floor.rooms
    .flatMap((r) => r.boundary)
    .concat(floor.walls.flatMap((w) => [w.start, w.end]));
  const centerX = points.length
    ? (Math.min(...points.map((p) => p.x)) +
        Math.max(...points.map((p) => p.x))) /
      2
    : 5;
  const centerY = points.length
    ? (Math.min(...points.map((p) => p.y)) +
        Math.max(...points.map((p) => p.y))) /
      2
    : 4;
  const base = floor.elevation ?? 0;
  const floorPoint = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const intersect = (elevation: number) => {
      const hit = e.ray.intersectPlane(
        new Plane(new Vector3(0, 1, 0), base - elevation),
        new Vector3(),
      );
      return hit ? { x: hit.x + centerX, y: centerY - hit.z } : null;
    };
    for (const room of floor.rooms) {
      if (room.floorElevation == null) continue;
      const hit = intersect(room.floorElevation);
      if (hit && pointInPolygon(hit, room.boundary)) return hit;
    }
    return intersect(base);
  };
  return (
    <div
      className="three-view"
      data-space-surfaces={JSON.stringify(
        p.rooms
          .filter((r) => r.floorElevation !== null && r.boundary.length >= 3)
          .map((r) => ({ id: r.id, y: r.floorElevation })),
      )}
      data-space-levels={JSON.stringify(
        p.rooms.map((r) => ({
          id: r.id,
          floorElevation: r.floorElevation,
          ceilingElevation: r.ceilingElevation,
        })),
      )}
      data-window-assemblies={JSON.stringify(
        floor.windows.map((o) => {
          const wall = floor.walls.find((w) => w.id === o.wallId);
          return {
            id: o.id,
            wallId: o.wallId,
            ...(wall
              ? {
                  ...openingElevations(o, wall, floor),
                  ...windowRenderParts(o, wall, floor),
                }
              : {}),
          };
        }),
      )}
      data-solid-count={p.solids.length}
      data-wall-count={p.walls.length}
      data-opening-count={p.openings.length}
      data-item-instances={JSON.stringify(floor.itemInstances ?? [])}
      data-item-ghost={
        placement && placementPoint
          ? JSON.stringify({
              itemId: placement.item.id,
              modelAssetId: placement.item.baseModelAssetId,
              point: placementPoint,
              rotation: placement.rotation,
              valid: placementValid,
            })
          : ""
      }
      onPointerLeave={() => onPlacementHover?.(null)}
      data-floor-id={floor.id}
      data-selected-id={selected ?? ""}
      data-door-orientations={JSON.stringify(
        floor.doors.map((d) => ({
          id: d.id,
          orientation: d.hingedOrientation ?? null,
        })),
      )}
      data-geometry-signature={JSON.stringify(p.solids)}
    >
      {itemError && <p role="alert">{itemError}</p>}
      <Canvas
        camera={{ position: [15, 18, -19], fov: 42 }}
        shadows
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={[palette["--canvas-bg"]]} />
        <ambientLight intensity={1.7} />
        <directionalLight position={[8, 15, -10]} intensity={2} />
        <group
          position={[-centerX, -base, centerY]}
          onPointerMove={(e) => {
            if (placement) {
              e.stopPropagation();
              onPlacementHover?.(floorPoint(e));
            }
          }}
          onClick={(e) => {
            if (placement && e.delta <= 3) {
              e.stopPropagation();
              const point = floorPoint(e);
              if (point) onPlace?.(point);
            }
          }}
        >
          {placement && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[centerX, base, -centerY]}
            >
              <planeGeometry args={[2000, 2000]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                side={DoubleSide}
              />
            </mesh>
          )}
          {placement && placementPoint && (
            <group
              name="item-placement-ghost"
              position={[
                placementPoint.x,
                placementElevation,
                -placementPoint.y,
              ]}
              rotation={[0, placement.rotation, 0]}
            >
              <ItemModel
                item={placement.item}
                variant={placement.variant}
                ghost
                onError={setItemError}
              />
              <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.005, 0]}
                raycast={() => {}}
              >
                <planeGeometry
                  args={[placement.item.width!, placement.item.depth!]}
                />
                <meshBasicMaterial
                  transparent
                  opacity={0.22}
                  color={
                    palette[placementValid ? "--accent-primary" : "--error"]
                  }
                  side={DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          )}
          <PlacedItems
            floor={floor}
            items={items}
            onSelect={onSelect}
            onError={setItemError}
            placing={!!placement}
          />
          {layers.rooms &&
            p.rooms.map((r) => {
              if (r.floorElevation === null || r.boundary.length < 3)
                return null;
              const shape = new Shape();
              r.boundary.forEach((point, i) =>
                i === 0
                  ? shape.moveTo(point.x, point.y)
                  : shape.lineTo(point.x, point.y),
              );
              shape.closePath();
              return (
                <mesh
                  key={r.id}
                  name={`space:${r.id}`}
                  userData={{
                    spaceId: r.id,
                    floorElevation: r.floorElevation,
                    ceilingElevation: r.ceilingElevation,
                    clearHeight: r.clearHeight,
                  }}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, r.floorElevation, 0]}
                  onClick={(e) => {
                    if (placement) return;
                    e.stopPropagation();
                    onSelect(r.id);
                  }}
                >
                  <shapeGeometry args={[shape]} />
                  <meshStandardMaterial
                    side={DoubleSide}
                    color={
                      selected === r.id
                        ? "#a3b99b"
                        : (roomColors[r.type] ?? "#ecece3")
                    }
                  />
                </mesh>
              );
            })}
          {layers.walls &&
            p.solids.map((w) => (
              <mesh
                key={w.id}
                position={[
                  (w.start.x + w.end.x) / 2,
                  w.bottom + w.height / 2,
                  -(w.start.y + w.end.y) / 2,
                ]}
                rotation={[
                  0,
                  Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x),
                  0,
                ]}
                onClick={(e) => {
                  if (placement) return;
                  e.stopPropagation();
                  onSelect(w.wallId);
                }}
              >
                <boxGeometry
                  args={[distance(w.start, w.end), w.height, w.thickness]}
                />
                <meshStandardMaterial
                  color={selected === w.wallId ? "#709f83" : "#e1e1d8"}
                  roughness={0.9}
                />
              </mesh>
            ))}
          {p.openings.map((o) => {
            const w = p.walls.find((w) => w.id === o.wallId);
            if (o.kind === "window")
              return w && layers.windows ? (
                <WindowAssembly
                  key={o.id}
                  window={o}
                  wall={w}
                  floor={floor}
                  selected={selected === o.id}
                  onSelect={onSelect}
                  interactive={!placement}
                />
              ) : null;
            if (
              !w ||
              w.base === null ||
              o.width === null ||
              o.positionAlongWall === null ||
              p.elevation === null ||
              o.height === null ||
              o.sillHeight === null ||
              !p.solids.some((s) => s.wallId === w.id)
            )
              return null;
            if (!layers.doors) return null;
            const envelope = o.kind === "door" ? doorSwing(w, o) : null;
            // Open leaf presentation illustrates the swing envelope, not physical state.
            const pos = envelope
              ? {
                  x: (envelope.hinge.x + envelope.leafTip.x) / 2,
                  y: (envelope.hinge.y + envelope.leafTip.y) / 2,
                }
              : wallPoint(w, openingInterval(o)!.center);
            const angle = envelope
              ? Math.atan2(
                  envelope.leafTip.y - envelope.hinge.y,
                  envelope.leafTip.x - envelope.hinge.x,
                )
              : w.angle;
            if (o.kind === "opening") return null;
            return (
              <mesh
                key={o.id}
                position={[
                  pos.x,
                  p.elevation! + w.base + o.sillHeight + o.height / 2,
                  -pos.y,
                ]}
                rotation={[0, angle, 0]}
                onClick={(e) => {
                  if (placement) return;
                  e.stopPropagation();
                  onSelect(o.id);
                }}
              >
                <boxGeometry args={[o.width, o.height, 0.035]} />
                <meshStandardMaterial
                  color={selected === o.id ? "#6e9e80" : "#b9b19a"}
                  side={DoubleSide}
                  transparent
                  opacity={0.75}
                />
              </mesh>
            );
          })}
          {p.columns.map((c) => {
            if (c.height === null || p.elevation === null) return null;
            const shape = new Shape();
            c.boundary.forEach((v, i) =>
              i === 0 ? shape.moveTo(v.x, v.y) : shape.lineTo(v.x, v.y),
            );
            shape.closePath();
            return (
              <mesh
                key={c.id}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, p.elevation!, 0]}
              >
                <extrudeGeometry
                  args={[shape, { depth: c.height, bevelEnabled: false }]}
                />
                <meshStandardMaterial color="#c9c9bb" />
              </mesh>
            );
          })}
        </group>
        <Grid
          position={[0, -0.01, 0]}
          args={[35, 35]}
          cellColor={palette["--border-primary"]}
          sectionColor={palette["--border-primary"]}
          cellThickness={0.5}
          sectionThickness={0.8}
          fadeDistance={45}
        />
        <OrbitControls
          makeDefault
          minDistance={6}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2.04}
        />
      </Canvas>
      <span className="view-hint">
        Current floor · Drag to orbit · Right-drag to pan · Scroll to zoom
      </span>
    </div>
  );
}

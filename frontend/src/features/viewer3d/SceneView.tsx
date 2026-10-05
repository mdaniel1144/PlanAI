import { useState } from "react";
import { PlacedItems } from "../items/PlacedItems";
import { WindowAssembly } from "./WindowAssembly";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Center, Grid } from "@react-three/drei";
import { Shape, DoubleSide } from "three";
import {
  projectFloor,
  windowRenderParts,
  openingElevations,
  distance,
  wallPoint,
  openingInterval,
  doorSwing,
} from "@habitat/geometry";
import type { Floor, Item } from "@habitat/domain";
import { roomColors, type Layers } from "../viewer2d/layers";
export default function SceneView({
  floor,
  selected,
  onSelect,
  layers,
  items = [],
}: {
  items?: Item[];
  floor: Floor;
  selected: string | null;
  onSelect: (id: string | null) => void;
  layers: Layers;
}) {
  const p = projectFloor(floor);
  const [itemError, setItemError] = useState("");
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
        <color attach="background" args={["#f5f6f0"]} />
        <ambientLight intensity={1.7} />
        <directionalLight position={[8, 15, -10]} intensity={2} />
        <Center>
          <group>
            <PlacedItems
              floor={floor}
              items={items}
              onSelect={onSelect}
              onError={setItemError}
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
        </Center>
        <Grid
          position={[0, -1.45, 0]}
          args={[35, 35]}
          cellColor="#dadfd1"
          sectionColor="#c6cdbd"
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

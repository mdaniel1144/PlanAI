import { useUnits } from "../../units/useUnits";
import { WindowGlyph } from "./WindowGlyph";
import type { DrawingInteraction } from "../editor/drawingTypes";
import { DoorGlyph } from "./DoorGlyph";
import { useRef, useState, type ReactNode } from "react";
import {
  projectFloor,
  wallPoint,
  openingInterval,
  distance,
} from "@habitat/geometry";
import type { Floor } from "@habitat/domain";
import { roomColors, type Layers } from "./layers";
export function PlanView({
  floor,
  selected,
  onSelect,
  layers,
  zoom,
  setZoom,
  panMode = false,
  interaction,
  itemLayer,
  onPlanPoint,
  onPlanHover,
}: {
  itemLayer?: ReactNode;
  onPlanPoint?: (p: { x: number; y: number }) => void;
  onPlanHover?: (p: { x: number; y: number }) => void;
  floor: Floor;
  selected: string | null;
  onSelect: (id: string) => void;
  layers: Layers;
  zoom: number;
  setZoom: (v: number) => void;
  panMode?: boolean;
  interaction?: DrawingInteraction;
}) {
  const units = useUnits();
  const projection = projectFloor(floor),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
      null,
    );
  const [frameFloor] = useState(floor);
  const editingDrag = useRef(false),
    suppressClick = useRef(false);
  const points = frameFloor.rooms
    .flatMap((r) => r.boundary)
    .concat(frameFloor.walls.flatMap((w) => [w.start, w.end]));
  const minX = Math.min(0, ...points.map((p) => p.x)),
    minY = Math.min(0, ...points.map((p) => p.y)),
    maxX = Math.max(
      frameFloor.walls.length ? 1 : 10,
      ...points.map((p) => p.x),
    ),
    maxY = Math.max(frameFloor.walls.length ? 1 : 8, ...points.map((p) => p.y));
  const width = maxX - minX + 3.6,
    height = maxY - minY + 3.2;
  const vWidth = width / zoom,
    vHeight = height / zoom;
  const canonical = (svg: SVGSVGElement, x: number, y: number) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const pick = (event: React.MouseEvent, id: string) => {
    if (
      !panMode &&
      (!interaction || ["select", "delete"].includes(interaction.tool))
    ) {
      event.stopPropagation();
      if (interaction) interaction.onSelect(id);
      else onSelect(id);
    }
  };
  return (
    <svg
      data-floor-id={floor.id}
      data-geometry-signature={JSON.stringify(projection.solids)}
      data-wall-count={projection.walls.length}
      className={`plan-svg ${panMode ? "pan-mode" : ""}`}
      viewBox={`${minX - 1.8 + (width - vWidth) / 2 + pan.x} ${minY - 1.4 + (height - vHeight) / 2 + pan.y} ${vWidth} ${vHeight}`}
      data-space-count={projection.rooms.length}
      data-space-levels={JSON.stringify(
        projection.rooms.map((r) => ({
          id: r.id,
          floorElevation: r.floorElevation,
          ceilingElevation: r.ceilingElevation,
        })),
      )}
      aria-label="Canonical floor plan in meters"
      role="img"
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (panMode) return;
        // A double-click already contributed its endpoint on the first click.
        if (
          e.detail > 1 &&
          interaction &&
          ["draw-wall", "manual-room"].includes(interaction.tool)
        )
          return;
        const p = canonical(e.currentTarget, e.clientX, e.clientY);
        if (!p) return;
        if (onPlanPoint) {
          onPlanPoint(p);
          return;
        }
        if (interaction) {
          if (interaction.tool === "select") interaction.onSelect(null);
          else interaction.onPoint(p);
        }
      }}
      onDoubleClick={(e) => {
        if (
          panMode ||
          !interaction ||
          !["draw-wall", "manual-room"].includes(interaction.tool)
        )
          return;
        e.preventDefault();
        interaction.onFinish();
      }}
      onWheel={(e) =>
        setZoom(Math.min(3, Math.max(0.5, zoom * (e.deltaY < 0 ? 1.08 : 0.92))))
      }
      onPointerDown={(e) => {
        if (onPlanPoint) return;
        if (panMode || e.button === 1) {
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (interaction?.tool !== "select" || e.button !== 0) return;
        const target = (e.target as Element).closest(
          "[data-window-id], [data-wall-id]",
        );
        const p = canonical(e.currentTarget, e.clientX, e.clientY);
        if (target && p) {
          interaction.onDragStart(
            (target.getAttribute("data-window-id") ??
              target.getAttribute("data-wall-id"))!,
            (target.hasAttribute("data-window-id")
              ? "window"
              : (target.getAttribute("data-part") ?? "wall")) as
              "start" | "end" | "wall" | "window",
            p,
          );
          editingDrag.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }}
      onPointerMove={(e) => {
        if (drag.current) {
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.max(vWidth / rect.width, vHeight / rect.height);
          setPan({
            x: drag.current.px - (e.clientX - drag.current.x) * scale,
            y: drag.current.py - (e.clientY - drag.current.y) * scale,
          });
          suppressClick.current = true;
          return;
        }
        const p = canonical(e.currentTarget, e.clientX, e.clientY);
        if (!p) return;
        if (onPlanHover) {
          onPlanHover(p);
          return;
        }
        if (editingDrag.current) {
          interaction?.onDragMove(p);
          suppressClick.current = true;
        } else interaction?.onHover(p);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (editingDrag.current) {
          interaction?.onDragEnd();
          editingDrag.current = false;
          suppressClick.current = true;
        }
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        editingDrag.current = false;
        interaction?.onDragCancel();
      }}
      onPointerLeave={() => interaction?.onLeave()}
    >
      <defs>
        <pattern
          id="architectural-grid"
          width={interaction?.spacing ?? 0.25}
          height={interaction?.spacing ?? 0.25}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${interaction?.spacing ?? 0.25} 0 H 0 V ${interaction?.spacing ?? 0.25}`}
            fill="none"
            stroke="#cad6c8"
            strokeWidth=".009"
          />
        </pattern>
        <pattern
          id="terrace-hatch"
          width=".18"
          height=".18"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2=".18"
            stroke="#c9c9b7"
            strokeWidth=".016"
          />
        </pattern>
        <pattern
          id="wet-hatch"
          width=".5"
          height=".5"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M .5 0 H 0 V .5"
            fill="none"
            stroke="#c4d5d5"
            strokeWidth=".012"
          />
        </pattern>
      </defs>
      {interaction?.grid && (
        <rect
          x={minX - 100}
          y={minY - 100}
          width={width + 200}
          height={height + 200}
          fill="url(#architectural-grid)"
          pointerEvents="none"
        />
      )}
      {layers.rooms &&
        projection.rooms.map((r) => (
          <g key={r.id} className="selectable" onClick={(e) => pick(e, r.id)}>
            <polygon
              points={r.boundary.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={roomColors[r.type] ?? "#f2eee6"}
              fillOpacity={1}
              stroke={selected === r.id ? "#77987d" : "none"}
              strokeWidth=".06"
            />
            <polygon
              points={r.boundary.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={
                r.type === "balcony"
                  ? "url(#terrace-hatch)"
                  : r.type === "bathroom"
                    ? "url(#wet-hatch)"
                    : "transparent"
              }
            />
            {selected === r.id && (
              <polygon
                points={r.boundary.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="#477854"
                fillOpacity=".06"
                stroke="#658971"
                strokeWidth=".026"
                strokeDasharray=".1 .07"
              />
            )}
          </g>
        ))}
      {layers.walls &&
        projection.walls.map((w) => (
          <g
            key={w.id}
            className="selectable"
            data-wall-id={w.id}
            onClick={(e) => pick(e, w.id)}
          >
            <line
              x1={w.start.x}
              y1={w.start.y}
              x2={w.end.x}
              y2={w.end.y}
              stroke={
                selected === w.id
                  ? "#197d61"
                  : interaction?.hoverId === w.id
                    ? "#97bba5"
                    : "#424940"
              }
              strokeWidth={w.thickness ?? 0.025}
              strokeDasharray={w.thickness === null ? ".15 .1" : undefined}
              strokeLinecap="square"
            />
            <line
              x1={w.start.x}
              y1={w.start.y}
              x2={w.end.x}
              y2={w.end.y}
              stroke="transparent"
              strokeWidth=".35"
            />
          </g>
        ))}
      {projection.walls.flatMap((w) =>
        w.openings.map((o) => {
          if (o.positionAlongWall === null || o.width === null) return null;
          const interval = openingInterval(o)!;
          const p = wallPoint(w, interval.start),
            q = wallPoint(w, interval.end);
          const angle = (w.angle * 180) / Math.PI;
          const visible = o.kind === "window" ? layers.windows : layers.doors;
          if (!visible) return null;
          return (
            <g
              key={o.id}
              className="selectable"
              data-entity-id={o.id}
              data-window-id={o.kind === "window" ? o.id : undefined}
              onClick={(e) => pick(e, o.id)}
            >
              <line
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke="#fafaf6"
                strokeWidth={(w.thickness ?? 0.05) + 0.04}
              />
              {o.kind === "door" && (
                <DoorGlyph wall={w} door={o} selected={selected === o.id} />
              )}
              <g transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
                {o.kind === "window" ? (
                  <WindowGlyph
                    window={o}
                    wall={w}
                    selected={selected === o.id}
                  />
                ) : o.kind === "door" && o.type === "hinged" ? (
                  o.hingedOrientation ? null : (
                    <line
                      x1="0"
                      y1="0"
                      x2={o.width}
                      y2="0"
                      stroke="#9c8b66"
                      strokeWidth=".04"
                      strokeDasharray=".07 .06"
                    />
                  )
                ) : (
                  <>
                    <line
                      x1="0"
                      y1="-.05"
                      x2={o.width * 0.65}
                      y2="-.05"
                      stroke="#6b8576"
                      strokeWidth=".045"
                    />
                    <line
                      x1={o.width * 0.35}
                      y1=".05"
                      x2={o.width}
                      y2=".05"
                      stroke="#6b8576"
                      strokeWidth=".045"
                    />
                  </>
                )}
                <rect y="-.35" width={o.width} height=".7" fill="transparent" />
              </g>
            </g>
          );
        }),
      )}
      {interaction?.tool === "select" &&
        layers.walls &&
        floor.walls
          .filter((w) => w.id === selected)
          .map((w) => (
            <g key={`handles-${w.id}`}>
              {(["start", "end"] as const).map((part) => (
                <circle
                  key={part}
                  data-wall-id={w.id}
                  data-part={part}
                  aria-label={`Wall endpoint ${part}`}
                  cx={w[part].x}
                  cy={w[part].y}
                  r=".09"
                  fill="white"
                  stroke="#197d61"
                  strokeWidth=".035"
                  style={{ cursor: "grab" }}
                />
              ))}
            </g>
          ))}
      {interaction && (
        <g pointerEvents="none">
          {interaction.points.length > 0 && (
            <>
              <polyline
                points={[
                  ...interaction.points,
                  ...(interaction.pointer &&
                  ["draw-wall", "manual-room", "measure"].includes(
                    interaction.tool,
                  )
                    ? [interaction.pointer]
                    : []),
                ]
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#197d61"
                strokeWidth={interaction.tool === "draw-wall" ? 0.12 : 0.025}
                strokeDasharray=".09 .04"
              />
              {interaction.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r=".055" fill="#197d61" />
              ))}
              {interaction.pointer && (
                <text
                  x={interaction.pointer.x + 0.12}
                  y={interaction.pointer.y - 0.18}
                  fontSize=".18"
                  fill="#197d61"
                >
                  {units.format(
                    distance(interaction.points.at(-1)!, interaction.pointer),
                  )}
                </text>
              )}
            </>
          )}
          {interaction.pointer &&
            interaction.snapLabel &&
            ["draw-wall", "manual-room", "measure"].includes(
              interaction.tool,
            ) && (
              <g>
                <circle
                  cx={interaction.pointer.x}
                  cy={interaction.pointer.y}
                  r=".09"
                  fill="none"
                  stroke="#197d61"
                  strokeWidth=".025"
                />
                <text
                  x={interaction.pointer.x + 0.14}
                  y={interaction.pointer.y + 0.25}
                  fontSize=".16"
                  fill="#197d61"
                >
                  {interaction.snapLabel}
                </text>
              </g>
            )}
          {interaction.doorPreview &&
            (() => {
              const door = interaction.doorPreview,
                w = floor.walls.find((w) => w.id === door.wallId),
                interval = openingInterval(door);
              if (!w || !interval) return null;
              const a = wallPoint(w, interval.start),
                b = wallPoint(w, interval.end);
              return (
                <g
                  opacity=".8"
                  data-opening-preview="true"
                  data-valid={!interaction.windowPlacementError}
                  data-placement={
                    interaction.windowPlacementLocked ? "fixed" : "hover"
                  }
                  data-position={door.positionAlongWall}
                  data-host-id={door.wallId}
                  data-adjusted={interaction.windowPlacementAdjusted}
                >
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={
                      interaction.windowPlacementError ? "#be4848" : "#42aa89"
                    }
                    strokeWidth=".18"
                  />
                  {interaction.tool === "add-door" && (
                    <DoorGlyph wall={w} door={door} selected />
                  )}
                  {interaction.windowPreview && (
                    <g
                      transform={`translate(${a.x} ${a.y}) rotate(${(Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180) / Math.PI})`}
                    >
                      <WindowGlyph
                        wall={w}
                        window={interaction.windowPreview}
                        selected
                      />
                      <rect
                        x="0"
                        y={-Math.max(w.thickness ?? 0.12, 0.18) / 2 - 0.035}
                        width={Math.max(
                          interaction.windowPreview.width ?? 0,
                          0.05,
                        )}
                        height={Math.max(w.thickness ?? 0.12, 0.18) + 0.07}
                        fill={
                          interaction.windowPlacementError
                            ? "#be484833"
                            : "none"
                        }
                        stroke={
                          interaction.windowPlacementError
                            ? "#be4848"
                            : interaction.windowPlacementAdjusted
                              ? "#ab761e"
                              : "#197d61"
                        }
                        strokeWidth=".04"
                        strokeDasharray={
                          interaction.windowPlacementLocked
                            ? undefined
                            : ".08 .04"
                        }
                      />
                      <text
                        y="-.3"
                        fontSize=".16"
                        fill={
                          interaction.windowPlacementError
                            ? "#a33232"
                            : "#53644b"
                        }
                      >
                        {interaction.windowPlacementError
                          ? "Invalid placement"
                          : interaction.windowPlacementAdjusted
                            ? "Shifted inward to fit"
                            : interaction.windowPlacementLocked
                              ? "Position fixed"
                              : "Click to fix position"}
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}
        </g>
      )}
      {layers.rooms &&
        projection.rooms.flatMap((r) =>
          (r.boundaryEdges ?? [])
            .filter((e) => e.kind === "OPEN")
            .map((e) => (
              <line
                key={`${r.id}-open-${e.index}`}
                className="space-open-edge"
                data-space-id={r.id}
                x1={e.start.x}
                y1={e.start.y}
                x2={e.end.x}
                y2={e.end.y}
                stroke="#768d8e"
                strokeWidth=".04"
                strokeDasharray=".15 .12"
                pointerEvents="none"
              />
            )),
        )}
      {layers.labels &&
        projection.rooms.map((r) => (
          <g
            key={r.id}
            className="room-label selectable"
            onClick={(e) => pick(e, r.id)}
            transform={`translate(${r.center.x} ${r.center.y})`}
          >
            <text
              textAnchor="middle"
              y="-.03"
              fontSize={r.type === "hallway" ? ".20" : ".24"}
              fontWeight="500"
              fill="#454c42"
            >
              {r.name}
            </text>
            <text textAnchor="middle" y=".32" fontSize=".19" fill="#8a8f83">
              {r.computedArea === null
                ? "Area unknown"
                : `${r.computedArea.toFixed(1)} m²`}
              {r.floorElevation !== null
                ? ` · ${units.format(r.floorElevation)}`
                : ""}
            </text>
            {selected === r.id && (
              <g transform="translate(-.37 .55)">
                <rect width=".74" height=".25" rx=".08" fill="#d9e5d9" />
                <text
                  x=".37"
                  y=".172"
                  textAnchor="middle"
                  fontSize=".115"
                  fill="#4b7257"
                >
                  SELECTED
                </text>
              </g>
            )}
          </g>
        ))}
      {layers.dimensions && (
        <g stroke="#9a9f91" strokeWidth=".014" fill="none">
          {floor.dimensions.map((d) => {
            if (d.value === null) return null;
            const horizontal = Math.abs(d.end.y - d.start.y) < 0.01;
            if (horizontal) {
              const y = minY - 0.65;
              return (
                <g key={d.id}>
                  <path
                    d={`M ${d.start.x} ${minY - 0.3} V ${y - 0.13} M ${d.end.x} ${minY - 0.3} V ${y - 0.13} M ${d.start.x} ${y} H ${d.end.x}`}
                  />
                  {[d.start.x, d.end.x].map((x) => (
                    <path key={x} d={`M ${x - 0.07} ${y + 0.07} l .14 -.14`} />
                  ))}
                  <rect
                    x={(d.start.x + d.end.x) / 2 - 0.55}
                    y={y - 0.18}
                    width="1.1"
                    height=".3"
                    fill="#f7f8f3"
                    stroke="none"
                  />
                  <text
                    x={(d.start.x + d.end.x) / 2}
                    y={y + 0.04}
                    textAnchor="middle"
                    stroke="none"
                    fill="#818878"
                    fontSize=".19"
                  >
                    {units.format(d.value)}
                  </text>
                </g>
              );
            }
            const x = maxX + 0.65;
            return (
              <g key={d.id}>
                <path
                  d={`M ${maxX + 0.3} ${d.start.y} H ${x + 0.13} M ${maxX + 0.3} ${d.end.y} H ${x + 0.13} M ${x} ${d.start.y} V ${d.end.y}`}
                />
                <text
                  transform={`translate(${x + 0.24} ${(d.start.y + d.end.y) / 2}) rotate(-90)`}
                  textAnchor="middle"
                  stroke="none"
                  fill="#818878"
                  fontSize=".19"
                >
                  {units.format(d.value)}
                </text>
              </g>
            );
          })}
          <text
            x="0"
            y={maxY + 0.62}
            stroke="none"
            fontSize=".14"
            fill="#999e93"
            letterSpacing=".025"
          >
            {floor.name.toUpperCase()} · ALL DIMENSIONS IN METERS
          </text>
          <path
            d={`M ${maxX - 2} ${maxY + 0.52} h 2 m -2 -.07 v .14 m 1 -.14 v .14 m 1 -.14 v .14`}
          />
          <text
            x={maxX - 2}
            y={maxY + 0.84}
            fontSize=".13"
            fill="#999e93"
            stroke="none"
          >
            0
          </text>
          <text
            x={maxX}
            y={maxY + 0.84}
            textAnchor="end"
            fontSize=".13"
            fill="#999e93"
            stroke="none"
          >
            2 m
          </text>
        </g>
      )}
      {itemLayer}
    </svg>
  );
}

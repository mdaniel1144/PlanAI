import type { Window, Wall } from "@habitat/domain";
/** Thin wall-local elevation strip depicts rows as well as columns. Plan swing envelopes use wall normals. */
export function WindowGlyph({
  window: w,
  wall,
  selected,
}: {
  window: Window;
  wall: Wall;
  selected: boolean;
}) {
  if (!w.width || w.width <= 0) return null;
  const band = Math.max(wall.thickness ?? 0.12, 0.18),
    panels = w.assembly?.panels;
  return (
    <g
      data-window-glyph={w.id}
      data-window-type={w.type}
      data-panel-count={panels?.length ?? "unknown"}
    >
      <title>
        {w.name} · {w.type} ·{" "}
        {panels ? `${panels.length} panels` : "panel layout unknown"}
      </title>
      <rect
        y={-band / 2}
        width={w.width}
        height={band}
        fill={selected ? "#90b4bb" : "#d9e6e7"}
        stroke="#52787e"
        strokeWidth={w.assembly?.profile.frameFaceWidth ?? 0.025}
      />
      {!panels && (
        <path
          d={`M 0 0 H ${w.width}`}
          stroke="#69868a"
          strokeDasharray=".05 .04"
          strokeWidth=".02"
        />
      )}
      {panels?.map((p) => {
        const x = p.region.x * w.width!,
          pw = p.region.width * w.width!,
          y = band / 2 - (p.region.y + p.region.height) * band,
          ph = p.region.height * band;
        const hinged =
          ["CASEMENT", "TILT_TURN"].includes(p.operation) &&
          p.orientation &&
          p.orientation.hingeEndpoint !== "UNKNOWN" &&
          p.orientation.swingSide !== "UNKNOWN";
        const hinge =
            p.orientation?.hingeEndpoint === "PANEL_START" ? x : x + pw,
          side = p.orientation?.swingSide === "WALL_LEFT" ? 1 : -1;
        return (
          <g key={p.id} data-panel-id={p.id} data-operation={p.operation}>
            <rect
              x={x}
              y={y}
              width={pw}
              height={ph}
              fill="none"
              stroke="#52787e"
              strokeWidth=".018"
            />
            {p.operation === "FIXED" && (
              <path
                d={`M ${x + pw / 2 - 0.035} ${y + ph / 2} h .07 M ${x + pw / 2} ${y + ph / 2 - 0.035} v .07`}
                stroke="#52787e"
                strokeWidth=".014"
              />
            )}
            {p.operation === "SLIDING" && (
              <g stroke="#305e72" strokeWidth=".025" fill="none">
                <path
                  d={`M ${x + 0.15 * pw} ${y + ph / 2} H ${x + 0.85 * pw}`}
                  strokeDasharray={
                    p.slideDirection === "UNKNOWN" || p.slideDirection === null
                      ? ".05 .04"
                      : undefined
                  }
                />
                {["TOWARD_PANEL_START", "BIDIRECTIONAL"].includes(
                  p.slideDirection ?? "",
                ) && (
                  <path
                    d={`M ${x + 0.3 * pw} ${y + ph / 2 - 0.05} L ${x + 0.15 * pw} ${y + ph / 2} L ${x + 0.3 * pw} ${y + ph / 2 + 0.05}`}
                  />
                )}
                {["TOWARD_PANEL_END", "BIDIRECTIONAL"].includes(
                  p.slideDirection ?? "",
                ) && (
                  <path
                    d={`M ${x + 0.7 * pw} ${y + ph / 2 - 0.05} L ${x + 0.85 * pw} ${y + ph / 2} L ${x + 0.7 * pw} ${y + ph / 2 + 0.05}`}
                  />
                )}
              </g>
            )}
            {hinged && (
              <g
                stroke="#52787e"
                strokeWidth=".02"
                fill="none"
                data-hinge={p.orientation!.hingeEndpoint}
                data-swing={p.orientation!.swingSide}
              >
                <circle cx={hinge} cy={0} r=".035" fill="#52787e" />
                <path
                  d={`M ${hinge} 0 L ${hinge} ${side * pw} L ${hinge + (hinge === x ? pw : -pw)} 0`}
                  strokeDasharray=".06 .04"
                />
              </g>
            )}
            {p.operation === "TILT_TURN" && (
              <path
                d={`M ${x} ${y} L ${x + pw / 2} ${y + ph} L ${x + pw} ${y}`}
                fill="none"
                stroke="#52787e"
                strokeWidth=".018"
              />
            )}
            {p.operation === "AWNING" && (
              <path
                d={`M ${x} ${y + ph} L ${x + pw / 2} ${y} L ${x + pw} ${y + ph}`}
                fill="none"
                stroke="#52787e"
                strokeWidth=".018"
              />
            )}
          </g>
        );
      })}
    </g>
  );
}

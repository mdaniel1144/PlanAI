import { useState, type CSSProperties } from "react";
import {
  Box,
  Layers3,
  MousePointer2,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import {
  formatLength,
  formatLengthValue,
  type LengthDisplayUnit,
} from "@habitat/domain";
import type { AppTheme } from "@habitat/contracts";
import { themes } from "./themes";

export function WorkspacePreview({
  theme,
  unit,
  miniature = false,
}: {
  theme: AppTheme;
  unit: LengthDisplayUnit;
  miniature?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  return (
    <div
      className={`workspace-preview ${miniature ? "is-miniature" : ""}`}
      style={themes[theme].tokens as CSSProperties}
      aria-hidden={miniature || undefined}
    >
      <div className="preview-topbar">
        <span className="preview-brand">
          h<span>.</span>
        </span>
        <span>Residence / Living room</span>
        <span className="preview-view">Plan view</span>
      </div>
      <div className="preview-workspace">
        <div className="preview-rail">
          <MousePointer2 size={15} />
          <Layers3 size={15} />
          <Box size={15} />
        </div>
        <div className="preview-drawing">
          <svg
            viewBox="0 0 420 275"
            role="img"
            aria-label={`Living room floor plan, sofa width ${formatLength(2.4, unit)}`}
          >
            <g
              transform={`translate(205 140) scale(${zoom}) translate(-205 -140)`}
            >
              <path
                className="preview-floor"
                d="M61 38H330V228H244M181 228H61Z"
              />
              <path
                className="preview-wall"
                d="M61 38H330V228H244M181 228H61V38"
              />
              <path
                className="preview-door"
                d="M181 228V167A61 61 0 0 1 242 228"
              />
              <path className="preview-window" d="M115 36H242M115 41H242" />
              <rect
                className="preview-rug"
                x="124"
                y="80"
                width="148"
                height="115"
                rx="2"
              />
              <g className="preview-sofa">
                <rect x="134" y="69" width="128" height="45" rx="5" />
                <rect x="142" y="74" width="56" height="33" rx="3" />
                <rect x="199" y="74" width="55" height="33" rx="3" />
              </g>
              <rect
                className="preview-table"
                x="170"
                y="134"
                width="56"
                height="32"
                rx="15"
              />
              <circle className="preview-plant" cx="87" cy="65" r="12" />
              <path className="preview-door" d="M80 65L94 65M87 58V72" />
              <path
                className="preview-dimension"
                d="M134 53V43M134 48H262M262 43V53"
              />
              <text
                className="preview-measure"
                x="198"
                y="35"
                textAnchor="middle"
              >
                {formatLength(2.4, unit)}
              </text>
              <text
                className="preview-room-label"
                x="198"
                y="188"
                textAnchor="middle"
              >
                LIVING ROOM
              </text>
            </g>
          </svg>
          {!miniature && (
            <div className="preview-zoom">
              <button
                aria-label="Zoom preview out"
                disabled={zoom <= 0.8}
                onClick={() => setZoom((v) => Math.max(0.8, v - 0.1))}
              >
                <Minus size={13} />
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                aria-label="Zoom preview in"
                disabled={zoom >= 1.3}
                onClick={() => setZoom((v) => Math.min(1.3, v + 0.1))}
              >
                <Plus size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="preview-inspector">
          <span>
            <SlidersHorizontal size={12} /> Properties
          </span>
          <strong>Studio sofa</strong>
          <small>DIMENSIONS · {unit.toLowerCase()}</small>
          {(
            [
              ["Width", 2.4],
              ["Depth", 0.9],
              ["Height", 0.75],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <b>{formatLengthValue(value, unit)}</b>
            </div>
          ))}
          <i>Selected object</i>
        </div>
      </div>
      <div className="preview-status">
        <span>
          <span className="preview-status-dot" /> Workspace ready
        </span>
        <span>{unit === "CM" ? "Centimeters" : "Meters"} · 1:50</span>
      </div>
    </div>
  );
}

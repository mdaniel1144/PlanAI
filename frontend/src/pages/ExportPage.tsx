import { useState } from "react";
import { FileText, Download, CheckCircle2 } from "lucide-react";
import { downloadJson } from "../api/client";
import { PageHeading } from "../components/PageHeading";
import type { HomeScene } from "@habitat/domain";

export function ExportPage({ scene }: { scene: HomeScene }) {
  const [done, setDone] = useState(false);
  return (
    <div className="page-content narrow">
      <PageHeading
        eyebrow="Current scene"
        title="Your home, structured."
        description="Export the exact architectural data behind both views."
      />
      <div className="content-card export-card">
        <div className="export-icon">
          <FileText size={32} />
        </div>
        <h2>Canonical scene JSON</h2>
        <p>
          Your current home scene with floors, rooms, walls, hosted openings,
          dimensions, and geometry evidence. All world geometry uses meters.
        </p>
        <div className="export-meta">
          <span>JSON</span>
          <span>Schema v{scene.schemaVersion}</span>
          <span>
            {scene.floors.length} floor{scene.floors.length === 1 ? "" : "s"}
          </span>
        </div>
        <button
          className="button primary"
          onClick={() => {
            downloadJson(scene, "habitat-scene.json");
            setDone(true);
          }}
        >
          <Download size={16} /> Download scene JSON
        </button>
        {done && (
          <p className="green-text">
            <CheckCircle2 size={14} /> Export downloaded
          </p>
        )}
      </div>
      <p className="small muted export-note">
        Image, 3D, CAD and BIM exports are planned. Only canonical JSON export
        is available in this phase.
      </p>
    </div>
  );
}

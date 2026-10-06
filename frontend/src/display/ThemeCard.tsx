import { Check } from "lucide-react";
import type { AppTheme } from "@habitat/contracts";
import { themes } from "./themes";
import { WorkspacePreview } from "./WorkspacePreview";
export function ThemeCard({
  id,
  selected,
  onSelect,
}: {
  id: AppTheme;
  selected: boolean;
  onSelect: (id: AppTheme) => void;
}) {
  const theme = themes[id];
  return (
    <label className={`theme-card ${selected ? "is-selected" : ""}`}>
      <input
        type="radio"
        name="workspace-theme"
        aria-label={theme.name}
        checked={selected}
        onChange={() => onSelect(id)}
      />
      <div className="theme-card-image">
        <WorkspacePreview theme={id} unit="CM" miniature />
      </div>
      <div className="theme-card-caption">
        <strong>{theme.name}</strong>
        <span className="theme-check">
          {selected && <Check size={12} strokeWidth={2.5} />}
        </span>
        <small>{theme.description}</small>
      </div>
    </label>
  );
}

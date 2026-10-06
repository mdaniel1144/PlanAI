import { Link } from "react-router-dom";
import {
  Check,
  Cloud,
  CloudOff,
  Ruler,
  ArrowLeft,
  Monitor,
} from "lucide-react";
import { formatLengthValue, type LengthDisplayUnit } from "@habitat/domain";
import { Shell } from "../components/Layout";
import { useDisplayPreferences } from "../display/context";
import { themeIds } from "../display/themes";
import { ThemeCard } from "../display/ThemeCard";
import "../styles/Display.css";

const example = (unit: LengthDisplayUnit) =>
  [2.4, 0.9, 0.75].map((v) => formatLengthValue(v, unit)).join(" × ") +
  ` ${unit.toLowerCase()}`;
export function DisplayPage() {
  const display = useDisplayPreferences();
  return (
    <Shell>
      <div className="display-studio">
        <header className="display-heading">
          <div>
            <Link className="display-back" to="/settings/account">
              <ArrowLeft size={13} /> Settings
            </Link>
            <h1>Display &amp; Appearance</h1>
            <p>
              Customize how your workspace looks and how measurements are
              displayed.
            </p>
          </div>
          <div className="display-sync" role="status" aria-live="polite">
            {display.sync === "offline" ? (
              <CloudOff size={15} />
            ) : display.sync === "saving" ? (
              <Cloud size={15} />
            ) : (
              <Check size={15} />
            )}
            <span>
              {display.sync === "offline"
                ? "Saved on this device · sync pending"
                : display.sync === "saving"
                  ? "Saving preferences…"
                  : "All preferences saved"}
            </span>
            {display.sync === "offline" && (
              <button onClick={display.retry}>Retry</button>
            )}
          </div>
        </header>
        <section
          className="display-themes"
          aria-labelledby="workspace-theme-title"
        >
          <div className="display-section-heading">
            <div>
              <span className="display-section-number">01 / APPEARANCE</span>
              <h2 id="workspace-theme-title">Workspace Theme</h2>
              <p>Set the atmosphere for your next idea.</p>
            </div>
            <span className="display-section-note">
              <Monitor size={14} /> Applies across your workspace
            </span>
          </div>
          <fieldset className="theme-options">
            <legend className="sr-only">Workspace Theme</legend>
            {themeIds.map((id) => (
              <ThemeCard
                key={id}
                id={id}
                selected={display.theme === id}
                onSelect={(theme) => display.update({ theme })}
              />
            ))}
          </fieldset>
        </section>
        <div className="display-lower">
          <section
            className="display-measurements"
            aria-labelledby="measurements-title"
          >
            <div className="measurement-heading">
              <span className="display-section-number">02 / PRECISION</span>
              <h2 id="measurements-title">Measurements</h2>
              <p>
                Choose how dimensions and measurements appear throughout the
                workspace.
              </p>
            </div>
            <fieldset className="measurement-options">
              <legend className="sr-only">Measurement unit</legend>
              {(
                [
                  ["CM", "Centimeters"],
                  ["M", "Meters"],
                ] as const
              ).map(([unit, name]) => (
                <label
                  key={unit}
                  className={
                    display.lengthDisplayUnit === unit ? "is-selected" : ""
                  }
                >
                  <input
                    type="radio"
                    name="length-unit"
                    aria-label={name}
                    checked={display.lengthDisplayUnit === unit}
                    onChange={() => display.update({ lengthDisplayUnit: unit })}
                  />
                  <span>
                    <strong>{name}</strong>
                    <b>{unit.toLowerCase()}</b>
                  </span>
                  <small>{example(unit)}</small>
                </label>
              ))}
            </fieldset>
            <div className="measurement-sample">
              <Ruler size={19} strokeWidth={1.3} />
              <div>
                <span>THE SAME OBJECT. YOUR PERSPECTIVE.</span>
                <strong>{example(display.lengthDisplayUnit)}</strong>
                <small>Width × depth × height</small>
              </div>
            </div>
            <p className="display-footnote">
              Your preferred notation, everywhere you work.
              <br />
              Actual dimensions and project geometry stay the same.
            </p>
          </section>
        </div>
        <footer className="display-footer">
          <Cloud size={14} />
          <span>
            Preferences are personal to your account and follow you across
            devices.
          </span>
          <span>HABITAT / DISPLAY STUDIO</span>
        </footer>
      </div>
    </Shell>
  );
}

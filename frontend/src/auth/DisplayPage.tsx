import { useState } from "react";
import { Link } from "react-router-dom";
import type { LengthDisplayUnit } from "@habitat/domain";
import { Shell } from "../components/Layout";
import { useAuth } from "./context";
import { authClient } from "./api";
export function DisplayPage() {
  const { user, refreshUser } = useAuth();
  const [unit, setUnit] = useState<LengthDisplayUnit>(
    user?.lengthDisplayUnit ?? "CM",
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  return (
    <Shell>
      <main className="account-page">
        <p className="eyebrow">SETTINGS</p>
        <h1>Display &amp; Units</h1>
        <Link to="/settings/account">Account</Link>
        <p>
          Choose how lengths appear in the catalog and workspace. Product
          measurements and project geometry remain unchanged.
        </p>
        <form
          className="account-card account-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await authClient.display(unit);
              await refreshUser();
              try {
                localStorage.setItem(
                  "habitat:display-updated",
                  String(Date.now()),
                );
              } catch {
                /* The persisted preference still updates this tab. */
              }
              setMessage("Display preference saved.");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not save preference.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <legend>Length unit</legend>
            {(
              [
                ["CM", "Centimeters"],
                ["M", "Meters"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="length-unit"
                  value={value}
                  checked={unit === value}
                  onChange={() => setUnit(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <button className="button" disabled={busy}>
            Save display preference
          </button>
          {message && <p role="status">{message}</p>}
          {error && <p role="alert">{error}</p>}
        </form>
      </main>
    </Shell>
  );
}

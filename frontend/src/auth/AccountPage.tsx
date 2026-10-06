import { Link } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@habitat/contracts";
import { Shell } from "../components/Layout";
import { useAuth } from "./context";
import { authClient } from "./api";
export function AccountPage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrent] = useState(""),
    [newPassword, setNew] = useState(""),
    [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(event: FormEvent, password: boolean) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password && newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (password) {
        await authClient.password({ currentPassword, newPassword });
        setCurrent("");
        setNew("");
        setConfirm("");
        setMessage("Password changed. Other sessions have been signed out.");
      } else {
        await authClient.profile(name);
        await refreshUser();
        setMessage("Profile saved.");
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell>
      <div className="account-page">
        <p className="eyebrow">SETTINGS</p>
        <h1>Account</h1>
        <Link to="/settings/display">Display &amp; Appearance</Link>
        <p>Manage your profile and sign-in security.</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        <div className="account-grid">
          <section className="account-card">
            <h2>Profile</h2>
            <form
              className="account-form"
              onSubmit={(e) => void submit(e, false)}
            >
              <label>
                Name
                <input
                  required
                  maxLength={120}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Email
                <input value={user?.email ?? ""} readOnly />
              </label>
              <p>{user?.role === "ADMIN" ? "Administrator" : "User"}</p>
              <button className="button primary" disabled={busy}>
                Save profile
              </button>
            </form>
          </section>
          <section className="account-card">
            <h2>Security</h2>
            <form
              className="account-form"
              onSubmit={(e) => void submit(e, true)}
            >
              <label>
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={currentPassword}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </label>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={newPassword}
                  onChange={(e) => setNew(e.target.value)}
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <p>Use 12–128 characters. Longer passphrases work well.</p>
              <button className="button primary" disabled={busy}>
                Change password
              </button>
            </form>
          </section>
        </div>
      </div>
    </Shell>
  );
}

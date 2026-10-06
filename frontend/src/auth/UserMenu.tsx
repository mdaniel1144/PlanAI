import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useAuth } from "./context";
export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLAnchorElement>("nav a")?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div
      className="user-control"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className="user-trigger"
        aria-label={user.name}
        ref={trigger}
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen(!open)}
      >
        <span className="user-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="user-name">{user.name}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="user-popover" id="account-menu">
          <div className="user-summary">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <small>{user.role === "ADMIN" ? "Administrator" : "User"}</small>
          </div>
          <nav aria-label="Account menu">
            <Link to="/settings/account" onClick={() => setOpen(false)}>
              Settings
            </Link>
            <Link to="/settings/account" onClick={() => setOpen(false)}>
              Account
            </Link>
            <Link to="/settings/display" onClick={() => setOpen(false)}>
              Display &amp; Appearance
            </Link>
            {user.role === "ADMIN" && (
              <Link to="/admin/items" onClick={() => setOpen(false)}>
                Admin · Items
              </Link>
            )}
            {user.role === "ADMIN" && (
              <Link to="/admin/users" onClick={() => setOpen(false)}>
                Admin · Users
              </Link>
            )}
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await logout();
                } catch {
                  setError("Unable to sign out. Please try again.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </nav>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

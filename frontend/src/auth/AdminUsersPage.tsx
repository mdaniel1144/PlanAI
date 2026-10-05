import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  type ManagedUser,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@habitat/contracts";
import type { UserRole, UserStatus } from "@habitat/domain";
import { Shell } from "../components/Layout";
import { useAuth } from "./context";
import { authClient } from "./api";
function UserDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className="user-dialog"
      ref={dialog}
      aria-labelledby="user-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const box = dialog.current.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <h2 id="user-dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
function UserForm({
  user,
  onClose,
  onSaved,
}: {
  user: ManagedUser | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(user?.name ?? ""),
    [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<UserRole>(user?.role ?? "USER"),
    [status, setStatus] = useState<UserStatus>(user?.status ?? "ACTIVE");
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [reset, setReset] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function action(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
      setPassword("");
      setConfirm("");
      await onSaved();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if ((!user || reset) && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (reset && user) {
      if (
        window.confirm(
          `Reset the password for ${user.name}? All their sessions will be signed out.`,
        )
      )
        void action(() => authClient.reset(user.id, password));
    } else if (user) {
      if (
        ((user.role === "ADMIN" && role === "USER") ||
          (user.status === "ACTIVE" && status === "DISABLED")) &&
        !window.confirm(
          `Change access for ${user.name}? This may end their administrative access or sign them out.`,
        )
      )
        return;
      void action(() =>
        authClient.update(user.id, { name, email, role, status }),
      );
    } else
      void action(() => authClient.create({ name, email, role, password }));
  }
  return (
    <UserDialog
      title={
        reset
          ? `Reset password · ${user?.name}`
          : user
            ? "Edit user"
            : "Add user"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="account-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          {!reset && (
            <>
              <label>
                Name
                <input
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  autoComplete="off"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                Role
                <select
                  aria-label="Role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                >
                  <option value="USER">User</option>
                  <option value="ADMIN">Administrator</option>
                </select>
              </label>
              {user && (
                <label>
                  Status
                  <select
                    aria-label="Status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as UserStatus)}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DISABLED">Disabled</option>
                  </select>
                </label>
              )}
            </>
          )}
          {(!user || reset) && (
            <>
              <label>
                {reset ? "New password" : "Initial password"}
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </label>
              <small>Use 12–128 characters.</small>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button className="button primary" type="submit">
              {busy
                ? "Saving…"
                : reset
                  ? "Reset password"
                  : user
                    ? "Save"
                    : "Create user"}
            </button>
            <button className="button" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
          {user && !reset && (
            <div className="form-actions secondary-actions">
              <button
                className="button"
                type="button"
                onClick={() => {
                  setError("");
                  setReset(true);
                }}
              >
                Reset password
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  if (
                    user.status === "ACTIVE" &&
                    !window.confirm(
                      `Disable ${user.name}? All their sessions will be signed out.`,
                    )
                  )
                    return;
                  void action(() =>
                    authClient.status(user.id, user.status !== "ACTIVE"),
                  );
                }}
              >
                {user.status === "ACTIVE" ? "Disable user" : "Enable user"}
              </button>
            </div>
          )}
        </fieldset>
      </form>
    </UserDialog>
  );
}
export function AdminUsersPage() {
  const { refreshUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]),
    [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<ManagedUser | null | undefined>(
    undefined,
  );
  useEffect(() => {
    let active = true;
    authClient
      .users()
      .then((list) => {
        if (active) setUsers(list);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load users.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function reload() {
    await refreshUser();
    setUsers(await authClient.users());
  }
  const filtered = users.filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Shell>
      <div className="account-page users-page">
        <p className="eyebrow">ADMIN</p>
        <div className="users-heading">
          <div>
            <h1>Users</h1>
            <p>Manage workspace access and account security.</p>
          </div>
          <button className="button primary" onClick={() => setEditing(null)}>
            + Add user
          </button>
        </div>
        <label className="user-search">
          Search users
          <input
            type="search"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Loading users…</p>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <button
                        className="user-edit-link"
                        onClick={() => setEditing(user)}
                      >
                        {user.name}
                      </button>
                    </td>
                    <td>{user.email}</td>
                    <td>{user.role === "ADMIN" ? "Administrator" : "User"}</td>
                    <td>
                      <span
                        className={`user-status ${user.status.toLowerCase()}`}
                      >
                        {user.status === "ACTIVE" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString()
                        : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && <p className="users-empty">No users found.</p>}
          </div>
        )}
        {editing !== undefined && (
          <UserForm
            user={editing}
            onClose={() => setEditing(undefined)}
            onSaved={reload}
          />
        )}
      </div>
    </Shell>
  );
}

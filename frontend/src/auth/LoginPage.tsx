import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, House } from "lucide-react";
import { useAuth } from "./context";
import { AuthLoading } from "./RouteGuards";
import { ApiError } from "../api/client";
export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (auth.status === "LOADING") return <AuthLoading />;
  if (auth.status === "AUTHENTICATED")
    return <Navigate to="/projects" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await auth.login({ email, password });
      setPassword("");
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <House size={26} /> habitat<span>.</span>
        </div>
        <p className="eyebrow">YOUR ARCHITECTURAL WORKSPACE</p>
        <h1>Welcome back</h1>
        <p>Sign in to bring your next space to life.</p>
        <form className="account-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </label>
          <label htmlFor="login-password">Password</label>
          <div className="password-input">
            <input
              id="login-password"
              type={visible ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="login-help">Need access? Contact your administrator.</p>
      </section>
    </main>
  );
}

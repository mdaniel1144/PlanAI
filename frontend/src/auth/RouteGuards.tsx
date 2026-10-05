import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./context";
export function AuthLoading() {
  const { error, refreshUser } = useAuth();
  return (
    <main className="auth-loading" aria-live="polite">
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button className="button" onClick={() => void refreshUser()}>
            Try again
          </button>
        </>
      ) : (
        <p>Opening your workspace…</p>
      )}
    </main>
  );
}
export function ProtectedRoute() {
  const { status } = useAuth();
  if (status === "LOADING") return <AuthLoading />;
  return status === "AUTHENTICATED" ? (
    <Outlet />
  ) : (
    <Navigate to="/login" replace />
  );
}
export function AdminRoute() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? (
    <Outlet />
  ) : (
    <Navigate to="/projects" replace />
  );
}

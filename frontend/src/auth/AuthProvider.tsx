import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CurrentUser, LoginRequest } from "@habitat/contracts";
import { ApiError } from "../api/client";
import { AuthContext, type AuthState } from "./context";
import { authClient } from "./api";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("LOADING");
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const clear = useCallback(() => {
    revision.current++;
    window.dispatchEvent(new Event("habitat:clear-assets"));
    setUser(null);
    setStatus("UNAUTHENTICATED");
    setError(null);
  }, []);
  const refreshUser = useCallback(async () => {
    const requestRevision = ++revision.current;
    try {
      const current = await authClient.me();
      if (requestRevision !== revision.current) return;
      setUser(current);
      setStatus("AUTHENTICATED");
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (requestRevision === revision.current) clear();
        return;
      }
      if (requestRevision === revision.current)
        setError("Unable to connect. Please try again.");
    }
  }, [clear]);
  useEffect(() => {
    window.addEventListener("habitat:unauthenticated", clear);
    let active = true;
    queueMicrotask(() => {
      if (active) void refreshUser();
    });
    const focus = () => {
      void refreshUser();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "habitat:display-updated") void refreshUser();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("habitat:unauthenticated", clear);
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", storage);
      active = false;
    };
  }, [clear, refreshUser]);
  async function login(input: LoginRequest) {
    revision.current++;
    const current = await authClient.login(input);
    window.dispatchEvent(new Event("habitat:clear-assets"));
    setUser(current);
    setStatus("AUTHENTICATED");
    setError(null);
  }
  async function logout() {
    try {
      await authClient.logout();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    clear();
  }
  return (
    <AuthContext.Provider
      value={{ user, status, error, login, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

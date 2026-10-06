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
import { DisplayContext } from "../display/context";
import { DisplayStore } from "../display/store";
import { browserStorage } from "../display/cache";
import { applyTheme } from "../display/themes";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [display] = useState(
    () =>
      new DisplayStore({
        storage: browserStorage(),
        save: authClient.display,
        apply: applyTheme,
        saved: (userId) => {
          try {
            localStorage.setItem(
              "habitat:display-updated",
              JSON.stringify({ userId, nonce: crypto.randomUUID() }),
            );
          } catch {
            /* optional cross-tab notification */
          }
        },
      }),
  );
  const [user, setUser] = useState<CurrentUser | null>(null);
  const acceptUser = useCallback(
    (current: CurrentUser) => {
      display.activate(current.id);
      display.reconcile(current.id, current);
      document.documentElement.dataset.session = "ready";
      setUser(current);
    },
    [display],
  );
  const [status, setStatus] = useState<AuthState["status"]>("LOADING");
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const inFlight = useRef<{ revision: number; promise: Promise<void> } | null>(
    null,
  );
  const clear = useCallback(() => {
    revision.current++;
    display.reset();
    document.documentElement.dataset.session = "ready";
    window.dispatchEvent(new Event("habitat:clear-assets"));
    setUser(null);
    setStatus("UNAUTHENTICATED");
    setError(null);
  }, [display]);
  const refreshUser = useCallback((): Promise<void> => {
    if (inFlight.current?.revision === revision.current)
      return inFlight.current.promise;
    const requestRevision = ++revision.current;
    const promise = (async () => {
      try {
        const current = await authClient.me();
        if (requestRevision !== revision.current) return;
        acceptUser(current);
        setStatus("AUTHENTICATED");
        setError(null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          if (requestRevision === revision.current) clear();
          return;
        }
        if (requestRevision === revision.current)
          setError("Unable to connect. Please try again.");
      } finally {
        if (inFlight.current?.revision === requestRevision)
          inFlight.current = null;
      }
    })();
    inFlight.current = { revision: requestRevision, promise };
    return promise;
  }, [clear, acceptUser]);
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
      if (e.key !== "habitat:display-updated" || !e.newValue) return;
      try {
        if (JSON.parse(e.newValue).userId === display.getSnapshot().userId)
          void refreshUser();
      } catch {
        /* Ignore old/malformed notifications. */
      }
    };
    window.addEventListener("online", display.retry);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("habitat:unauthenticated", clear);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", display.retry);
      window.removeEventListener("storage", storage);
      active = false;
    };
  }, [clear, refreshUser, display]);
  async function login(input: LoginRequest) {
    revision.current++;
    const current = await authClient.login(input);
    window.dispatchEvent(new Event("habitat:clear-assets"));
    acceptUser(current);
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
      <DisplayContext.Provider value={display}>
        {children}
      </DisplayContext.Provider>
    </AuthContext.Provider>
  );
}

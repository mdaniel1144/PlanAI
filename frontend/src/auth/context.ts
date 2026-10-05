import { createContext, useContext } from "react";
import type { CurrentUser, LoginRequest } from "@habitat/contracts";
export type AuthState = {
  user: CurrentUser | null;
  status: "LOADING" | "AUTHENTICATED" | "UNAUTHENTICATED";
  error: string | null;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
}

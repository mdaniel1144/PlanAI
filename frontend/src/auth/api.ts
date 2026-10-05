import { z } from "zod";
import {
  currentUserSchema,
  managedUserSchema,
  type LoginRequest,
  type CreateUserRequest,
  type UpdateUserRequest,
  type ChangePasswordRequest,
} from "@habitat/contracts";
import { api } from "../api/client";
const ok = z.object({ ok: z.literal(true) });
const body = (method: string, input?: unknown): RequestInit => ({
  method,
  ...(input === undefined ? {} : { body: JSON.stringify(input) }),
});
export const authClient = {
  display: (lengthDisplayUnit: "CM" | "M") =>
    api(
      "/account/display",
      currentUserSchema,
      body("PATCH", { lengthDisplayUnit }),
    ),
  me: () => api("/auth/me", currentUserSchema),
  login: (input: LoginRequest) =>
    api("/auth/login", currentUserSchema, body("POST", input)),
  logout: () => api("/auth/logout", ok, body("POST")),
  profile: (name: string) =>
    api("/account", currentUserSchema, body("PATCH", { name })),
  password: (input: ChangePasswordRequest) =>
    api("/account/change-password", ok, body("POST", input)),
  users: () => api("/admin/users", z.array(managedUserSchema)),
  create: (input: CreateUserRequest) =>
    api("/admin/users", managedUserSchema, body("POST", input)),
  update: (id: string, input: UpdateUserRequest) =>
    api(`/admin/users/${id}`, managedUserSchema, body("PATCH", input)),
  status: (id: string, enabled: boolean) =>
    api(
      `/admin/users/${id}/${enabled ? "enable" : "disable"}`,
      managedUserSchema,
      body("POST"),
    ),
  reset: (id: string, newPassword: string) =>
    api(`/admin/users/${id}/reset-password`, ok, body("POST", { newPassword })),
};

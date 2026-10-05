import { z } from "zod";
import { sceneSchema, projectSchema } from "@habitat/domain";
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: { field: string; message: string }[];
  readonly blockingIssues: { code: string; message: string; step?: string }[];
  constructor(
    status: number,
    code: string,
    message: string,
    blockingIssues: { code: string; message: string; step?: string }[] = [],
    issues: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.blockingIssues = blockingIssues;
    this.issues = issues;
    this.status = status;
    this.code = code;
  }
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const r = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers:
      init?.body instanceof FormData
        ? { "X-Habitat-Request": "1", ...init.headers }
        : {
            "Content-Type": "application/json",
            "X-Habitat-Request": "1",
            ...init?.headers,
          },
  });
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => null);
    if (r.status === 401 && path !== "/auth/login")
      window.dispatchEvent(new Event("habitat:unauthenticated"));
    throw new ApiError(
      r.status,
      body && typeof body === "object" && "code" in body
        ? String(body.code)
        : "REQUEST_FAILED",
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `Request failed (${r.status})`,
      body &&
        typeof body === "object" &&
        "blockingIssues" in body &&
        Array.isArray(body.blockingIssues)
        ? body.blockingIssues
        : [],
      body &&
        typeof body === "object" &&
        "issues" in body &&
        Array.isArray(body.issues)
        ? body.issues
        : [],
    );
  }
  return schema.parse(await r.json());
}
export const client = {
  projects: () => api("/projects", z.array(projectSchema)),
  project: (id: string) => api(`/projects/${id}`, projectSchema),
  createProject: (body: unknown) =>
    api("/projects", projectSchema, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  scene: async (projectId: string) => {
    const rows = await api(
      `/projects/${projectId}/scenes`,
      z.array(z.object({ id: z.string(), revision: z.number() })),
    );
    return rows.length ? api(`/scenes/${rows[0].id}`, sceneSchema) : null;
  },
  createScene: (projectId: string, body: unknown) =>
    api(`/projects/${projectId}/scenes`, sceneSchema, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  save: (id: string, body: unknown) =>
    api(`/scenes/${id}`, sceneSchema, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  correct: (id: string, body: unknown) =>
    api(`/scenes/${id}/corrections`, sceneSchema, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  verify: (id: string, body: unknown) =>
    api(`/scenes/${id}/verifications`, sceneSchema, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
export function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

import { z } from "zod";
import { itemSchema, catalogPageSchema, taxonomySchema } from "@habitat/domain";
import { normalizeCatalogForm } from "./forms";
import { api } from "../../api/client";
const body = (method: string, value: unknown) => ({
  method,
  body: JSON.stringify(normalizeCatalogForm(value)),
});
export const catalogClient = {
  list: (query: URLSearchParams, admin = false) =>
    api(`${admin ? "/admin" : ""}/items?${query}`, catalogPageSchema),
  item: (id: string, admin = false) =>
    api(`${admin ? "/admin" : ""}/items/${id}`, itemSchema),
  create: (value: unknown) =>
    api("/admin/items", itemSchema, body("POST", value)),
  save: (id: string, value: unknown) =>
    api(`/admin/items/${id}`, itemSchema, body("PATCH", value)),
  action: (id: string, path: string, value: unknown, method = "POST") =>
    api(`/admin/items/${id}/${path}`, itemSchema, body(method, value)),
  taxonomy: (kind: "brands" | "categories", admin = false) =>
    api(`${admin ? "/admin" : ""}/item-${kind}`, z.array(taxonomySchema)),
  saveTaxonomy: (kind: "brands" | "categories", name: string) =>
    api(`/admin/item-${kind}`, z.array(taxonomySchema), body("POST", { name })),
  upload: (id: string, type: string, file: File, replace = false) =>
    api(`/admin/items/${id}/${type}`, z.object({ id: z.string() }), {
      method: replace ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-File-Name": file.name,
      },
      body: file,
    }),
  generatedThumbnail: (
    item: import("@habitat/domain").Item,
    blob: Blob,
    signal?: AbortSignal,
  ) =>
    api(`/admin/items/${item.id}/generated-thumbnail`, itemSchema, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": blob.type,
        "X-Thumbnail-Signature": item.thumbnailGeneration!.signature!,
        "X-Thumbnail-Previous": item.thumbnailAssetId ?? "none",
      },
      body: blob,
    }),
  resolve: (sceneId: string) =>
    api(`/scenes/${sceneId}/items`, z.array(itemSchema)),
};

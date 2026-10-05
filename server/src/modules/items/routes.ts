import { Router } from "express";
import { CatalogService } from "./service";
import { requireAdmin, identity } from "../auth/middleware";
import { fail } from "./errors";
export function catalogRoutes(c: CatalogService) {
  const r = Router();
  r.get("/items", (req, res) => res.json(c.list(req.query, false)));
  r.get("/items/:itemId", (req, res) => {
    const item = c.get(String(req.params.itemId));
    if (item.status !== "ACTIVE" || !item.setup?.publishable)
      fail("ITEM_NOT_FOUND", "Item not found", 404);
    res.json(c.visible(item));
  });
  for (const table of ["categories", "brands"] as const) {
    r.get(`/item-${table}`, (_req, res) =>
      res.json(c.taxonomies(table, false)),
    );
    r.get(`/admin/item-${table}`, requireAdmin, (_req, res) =>
      res.json(c.taxonomies(table, true)),
    );
    r.post(`/admin/item-${table}`, requireAdmin, (req, res) =>
      res.status(201).json(c.taxonomy(table, req.body)),
    );
    r.patch(`/admin/item-${table}/:id`, requireAdmin, (req, res) =>
      res.json(c.taxonomy(table, req.body, String(req.params.id))),
    );
  }
  r.use("/admin/items", requireAdmin);
  r.get("/admin/items", (req, res) => res.json(c.list(req.query, true)));
  r.post("/admin/items", (req, res) =>
    res.status(201).json(c.saveItem(req.body)),
  );
  r.get("/admin/items/:itemId", (req, res) =>
    res.json(c.get(String(req.params.itemId))),
  );
  r.patch("/admin/items/:itemId", (req, res) =>
    res.json(c.saveItem(req.body, String(req.params.itemId))),
  );
  r.get("/admin/items/:itemId/model-inspection", (req, res) =>
    res.json(
      c
        .get(String(req.params.itemId))
        .assets.filter((a) => a.type === "GLB_MODEL"),
    ),
  );
  r.patch("/admin/items/:itemId/assets/:assetId/calibration", (req, res) =>
    res.json(
      c.calibrate(
        String(req.params.itemId),
        String(req.params.assetId),
        req.body,
        identity(res).user.id,
      ),
    ),
  );
  r.post("/admin/items/:itemId/color-targets", (req, res) =>
    res.json(c.colorTargets(String(req.params.itemId), req.body)),
  );
  r.post("/admin/items/:itemId/colors", (req, res) =>
    res.status(201).json(c.saveColor(String(req.params.itemId), req.body)),
  );
  r.patch("/admin/items/:itemId/colors/:id", (req, res) =>
    res.json(
      c.saveColor(String(req.params.itemId), req.body, String(req.params.id)),
    ),
  );
  r.post("/admin/items/:itemId/variants", (req, res) =>
    res.status(201).json(c.saveVariant(String(req.params.itemId), req.body)),
  );
  r.patch("/admin/items/:itemId/variants/:id", (req, res) =>
    res.json(
      c.saveVariant(String(req.params.itemId), req.body, String(req.params.id)),
    ),
  );
  r.post("/admin/items/:itemId/slots", (req, res) =>
    res.status(201).json(c.slot(String(req.params.itemId), req.body)),
  );
  r.post("/admin/items/:itemId/bindings", (req, res) =>
    res.status(201).json(c.binding(String(req.params.itemId), req.body)),
  );
  r.patch("/admin/items/:itemId/bindings/:id", (req, res) =>
    res.json(
      c.binding(String(req.params.itemId), req.body, String(req.params.id)),
    ),
  );
  r.post("/admin/items/:itemId/materials", (req, res) =>
    res.status(201).json(c.material(String(req.params.itemId), req.body)),
  );
  r.patch("/admin/items/:itemId/materials/:id", (req, res) =>
    res.json(
      c.material(String(req.params.itemId), req.body, String(req.params.id)),
    ),
  );
  return r;
}

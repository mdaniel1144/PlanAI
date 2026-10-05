import { randomUUID, createHash } from "node:crypto";
import express, { Router } from "express";
import type { Database } from "better-sqlite3";
import { z } from "zod";
import { CatalogService } from "./service";
import { identity, requireAdmin } from "../auth/middleware";
import { CatalogAssetStorage } from "./storage";
import { inspectImage, imageLimit } from "./images";
import { fail } from "./errors";
export const modelLimit =
  Number(process.env.ITEM_GLB_MAX_BYTES) || 50 * 1024 * 1024;
export class AssetService {
  readonly storage: CatalogAssetStorage;
  constructor(
    readonly db: Database,
    root: string,
  ) {
    this.storage = new CatalogAssetStorage(root);
    this.storage.recover(
      new Set(
        (
          db.prepare("SELECT storage_key FROM item_assets").all() as {
            storage_key: string;
          }[]
        ).map((a) => a.storage_key),
      ),
    );
  }
  register(
    itemId: string,
    type: string,
    fileName: string,
    mimeType: string,
    bytes: Buffer,
    inspection: unknown = null,
    replace = false,
  ) {
    if (!this.db.prepare("SELECT id FROM items WHERE id=?").get(itemId))
      fail("ITEM_NOT_FOUND", "Item not found", 404);
    if (
      type === "GLB_MODEL" &&
      !replace &&
      this.db
        .prepare(
          "SELECT 1 FROM item_assets WHERE item_id=? AND type='GLB_MODEL'",
        )
        .get(itemId)
    )
      fail(
        "ITEM_MODEL_ALREADY_EXISTS",
        "This product already has a model. Use Replace model to change it.",
        409,
      );
    if (
      replace &&
      this.db
        .prepare("SELECT 1 FROM project_item_instances WHERE item_id=?")
        .get(itemId)
    )
      fail(
        "ITEM_IN_USE",
        "This model is used in a project and cannot be replaced.",
        409,
      );
    const oldModels = replace
      ? (this.db
          .prepare(
            "SELECT id,storage_key FROM item_assets WHERE item_id=? AND type='GLB_MODEL'",
          )
          .all(itemId) as { id: string; storage_key: string }[])
      : [];
    let key: string | undefined;
    try {
      const result = this.db.transaction(() => {
        key = this.storage.put(
          itemId,
          type === "GLB_MODEL"
            ? "models"
            : type === "TEXTURE"
              ? "textures"
              : "thumbnails",
          bytes,
        );
        const id = randomUUID();
        this.db
          .prepare("INSERT INTO item_assets VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            id,
            itemId,
            type,
            key,
            mimeType,
            fileName,
            bytes.length,
            createHash("sha256").update(bytes).digest("hex"),
            inspection ? JSON.stringify(inspection) : null,
            null,
            new Date().toISOString(),
          );
        if (type === "GLB_MODEL") {
          this.db
            .prepare(
              "UPDATE items SET base_model_asset_id=?,width=NULL,depth=NULL,height=NULL,dimension_verification_json=NULL,status='DRAFT',updated_at=? WHERE id=?",
            )
            .run(id, new Date().toISOString(), itemId);
          if (replace) {
            this.db
              .prepare("DELETE FROM item_material_bindings WHERE item_id=?")
              .run(itemId);
            for (const old of oldModels)
              this.db.prepare("DELETE FROM item_assets WHERE id=?").run(old.id);
          }
        } else if (type === "THUMBNAIL") {
          this.db
            .prepare(
              "UPDATE items SET thumbnail_asset_id=?,updated_at=? WHERE id=?",
            )
            .run(id, new Date().toISOString(), itemId);
        }
        return id;
      })();
      // Committed files stay valid even if removal of an obsolete file fails.
      for (const old of oldModels) {
        try {
          this.storage.remove(old.storage_key);
        } catch {
          /* Startup recovery removes unreferenced files. */
        }
      }
      return result;
    } catch (error) {
      if (key) this.storage.remove(key);
      throw error;
    }
  }
  async generatedThumbnail(
    itemId: string,
    bytes: Buffer,
    signature: string,
    previous: string | null,
  ) {
    const decoded = await inspectImage(bytes);
    if (
      !["image/webp", "image/png"].includes(decoded.mimeType) ||
      decoded.width !== 512 ||
      decoded.height !== 512
    )
      fail(
        "ITEM_THUMBNAIL_INVALID",
        "Use a 512 × 512 WebP or PNG product image.",
      );
    let key: string | undefined;
    let obsolete: { id: string; storage_key: string } | undefined;
    const catalog = new CatalogService(this.db);
    try {
      this.db.transaction(() => {
        const item = catalog.get(itemId);
        if (!item.thumbnailGeneration?.signature)
          fail(
            "ITEM_DIMENSIONS_UNCONFIRMED",
            "Confirm real dimensions before generating the product image.",
          );
        if (
          signature !== item.thumbnailGeneration.signature ||
          previous !== item.thumbnailAssetId
        )
          fail(
            "ITEM_THUMBNAIL_STALE",
            "The product changed while its image was generating. Try again.",
            409,
          );
        const old = item.assets.find((a) => a.id === item.thumbnailAssetId);
        key = this.storage.put(itemId, "thumbnails", bytes);
        const id = randomUUID(),
          createdAt = new Date().toISOString();
        const metadata = {
          source: "GENERATED_FROM_GLB",
          modelAssetId: item.baseModelAssetId,
          defaultColorId:
            item.variants.find(
              (v) => v.id === item.defaultVariantId && v.status === "ACTIVE",
            )?.id ?? null,
          signature,
          width: 512,
          height: 512,
        };
        this.db
          .prepare("INSERT INTO item_assets VALUES (?,?,?,?,?,?,?,?,?,?,?)")
          .run(
            id,
            itemId,
            "THUMBNAIL",
            key,
            decoded.mimeType,
            decoded.mimeType === "image/webp" ? "product.webp" : "product.png",
            bytes.length,
            createHash("sha256").update(bytes).digest("hex"),
            JSON.stringify(metadata),
            null,
            createdAt,
          );
        this.db
          .prepare("UPDATE items SET thumbnail_asset_id=? WHERE id=?")
          .run(id, itemId);
        // Do not touch updated_at: unrelated forms must not remount while an image finishes.
        if (
          old?.generated &&
          !this.db
            .prepare(
              "SELECT 1 FROM item_variants WHERE thumbnail_asset_id=? UNION ALL SELECT 1 FROM items WHERE thumbnail_asset_id=?",
            )
            .get(old.id, old.id)
        ) {
          obsolete = this.db
            .prepare("SELECT id,storage_key FROM item_assets WHERE id=?")
            .get(old.id) as typeof obsolete;
          this.db.prepare("DELETE FROM item_assets WHERE id=?").run(old.id);
        }
      })();
    } catch (error) {
      if (key) this.storage.remove(key);
      throw error;
    }
    if (obsolete) {
      try {
        this.storage.remove(obsolete.storage_key);
      } catch {
        /* Startup recovery removes the obsolete file. */
      }
    }
    return catalog.get(itemId);
  }
  canRead(assetId: string, user: { id: string; role: string }) {
    if (user.role === "ADMIN") return true;
    const row = this.db
      .prepare("SELECT item_id FROM item_assets WHERE id=?")
      .get(assetId) as { item_id: string } | undefined;
    if (!row) return false;
    const variants = this.db
      .prepare(
        `SELECT v.*,i.base_model_asset_id,i.thumbnail_asset_id AS item_thumbnail FROM item_variants v JOIN items i ON i.id=v.item_id WHERE i.id=? AND ((i.status='ACTIVE' AND v.status='ACTIVE') OR EXISTS(SELECT 1 FROM project_item_instances p JOIN scene_state s ON s.id=p.state_id JOIN home_scenes h ON h.id=s.scene_id JOIN projects pr ON pr.id=h.project_id WHERE p.variant_id=v.id AND pr.owner_user_id=?))`,
      )
      .all(row.item_id, user.id) as {
      id: string;
      model_asset_id: string | null;
      base_model_asset_id: string | null;
      thumbnail_asset_id: string | null;
      item_thumbnail: string | null;
    }[];
    return variants.some((v) => {
      if (
        [
          v.base_model_asset_id,
          v.thumbnail_asset_id,
          v.item_thumbnail,
        ].includes(assetId)
      )
        return true;
      return !!this.db
        .prepare(
          `SELECT 1 FROM variant_material_overrides o JOIN item_material_textures t ON t.material_id=o.material_id WHERE o.variant_id=? AND t.asset_id=?`,
        )
        .get(v.id, assetId);
    });
  }
}
export function assetRoutes(
  service: AssetService,
  inspectModel?: (bytes: Buffer) => Promise<unknown>,
) {
  const router = Router();
  router.get("/item-assets/:assetId", (req, res) => {
    const asset = service.db
      .prepare("SELECT * FROM item_assets WHERE id=?")
      .get(req.params.assetId) as
      { storage_key: string; mime_type: string; file_size: number } | undefined;
    if (!asset) fail("ITEM_NOT_FOUND", "Asset not found", 404);
    if (!service.canRead(String(req.params.assetId), identity(res).user))
      fail("AUTH_FORBIDDEN", "Asset is not available to this account", 403);
    if (!service.storage.exists(asset.storage_key))
      fail("ITEM_ASSET_MISSING", "Stored asset is unavailable", 404);
    res
      .set({
        "Content-Type": asset.mime_type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'",
      })
      .send(service.storage.read(asset.storage_key));
  });
  router.post(
    "/admin/items/:itemId/generated-thumbnail",
    requireAdmin,
    express.raw({ type: ["image/webp", "image/png"], limit: imageLimit }),
    (req, res, next) => {
      void (async () => {
        if (!Buffer.isBuffer(req.body) || !req.body.length)
          fail("ITEM_THUMBNAIL_INVALID", "Send a generated WebP or PNG image.");
        const signature = z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(req.get("X-Thumbnail-Signature"));
        const rawPrevious = req.get("X-Thumbnail-Previous");
        const previous =
          rawPrevious === "none" ? null : z.uuid().parse(rawPrevious);
        const item = await service.generatedThumbnail(
          String(req.params.itemId),
          req.body,
          signature,
          previous,
        );
        res.status(201).json(item);
      })().catch(next);
    },
  );
  for (const [route, type, method] of [
    ["model", "GLB_MODEL", "post"],
    ["model", "GLB_MODEL", "put"],
    ["textures", "TEXTURE", "post"],
    ["thumbnails", "THUMBNAIL", "post"],
  ] as const) {
    router[method](
      `/admin/items/:itemId/${route}`,
      requireAdmin,
      express.raw({
        type: "application/octet-stream",
        limit: type === "GLB_MODEL" ? modelLimit : imageLimit,
      }),
      (req, res, next) => {
        void (async () => {
          if (!Buffer.isBuffer(req.body) || !req.body.length)
            fail(
              "ITEM_GLB_INVALID",
              "Send file bytes as application/octet-stream",
            );
          const name = req.get("X-File-Name") ?? "";
          if (
            !name ||
            name.length > 200 ||
            /[\\/]/.test(name) ||
            [...name].some((c) => c.charCodeAt(0) < 32)
          )
            fail("ITEM_GLB_INVALID", "Invalid filename");
          let inspection: unknown = null,
            mimeType: string;
          if (type === "GLB_MODEL") {
            if (!/\.glb$/i.test(name) || !inspectModel)
              fail(
                "ITEM_GLB_INVALID",
                "Only supported GLB models are accepted",
              );
            inspection = await inspectModel(req.body);
            mimeType = "model/gltf-binary";
          } else {
            const image = await inspectImage(req.body);
            mimeType = image.mimeType;
            const ext =
              mimeType === "image/jpeg"
                ? /\.jpe?g$/i
                : mimeType === "image/png"
                  ? /\.png$/i
                  : /\.webp$/i;
            if (!ext.test(name))
              fail(
                "ITEM_TEXTURE_INVALID",
                "Filename does not match image content",
              );
          }
          const id = service.register(
            String(req.params.itemId),
            type,
            name,
            mimeType,
            req.body,
            inspection,
            method === "put",
          );
          res.status(201).json({ id });
        })().catch(next);
      },
    );
  }
  return router;
}

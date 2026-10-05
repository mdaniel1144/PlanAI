import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import { z } from "zod";
import {
  itemSchema,
  dimensionPlausibility,
  renderedDimensionsMatch,
  itemInput,
  variantInput,
  materialInput,
  bindingInput,
  dimensionsInput,
  uniformCalibration,
  simpleColorInput,
  colorTargetsInput,
  calibratedDimensions,
  type Item,
  type ItemVariant,
  type ItemSetup,
  type SetupStep,
  type HomeScene,
  projectItemInstanceSchema,
  entitiesOf,
} from "@habitat/domain";
import { thumbnailSignature } from "./thumbnail-source";
import { fail, ItemError } from "./errors";
type SQLInputValue = string | number | bigint | null | Buffer;
const camel = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
const now = () => new Date().toISOString();
const fields = (schema: z.ZodObject, row: object) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => key in schema.shape),
  );
export class CatalogService {
  constructor(readonly db: Database) {}
  rows(sql: string, ...args: SQLInputValue[]) {
    return (this.db.prepare(sql).all(...args) as Record<string, unknown>[]).map(
      camel,
    );
  }
  write(table: string, row: Record<string, SQLInputValue>, id?: string) {
    const keys = Object.keys(row),
      columns = keys.map((k) =>
        k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
      );
    if (id)
      this.db
        .prepare(
          `UPDATE ${table} SET ${columns.map((c) => `${c}=?`).join(",")} WHERE id=?`,
        )
        .run(...Object.values(row), id);
    else
      this.db
        .prepare(
          `INSERT INTO ${table}(${columns.join(",")}) VALUES(${keys.map(() => "?").join(",")})`,
        )
        .run(...Object.values(row));
  }
  transaction<T>(fn: () => T) {
    try {
      return this.db.transaction(fn)();
    } catch (error) {
      if (
        error instanceof Error &&
        /item_variants\.(sku|color_sku)/.test(error.message)
      )
        fail("ITEM_SKU_DUPLICATE", "SKU already exists", 409);
      if (error instanceof Error && error.message.includes("UNIQUE constraint"))
        fail("ITEM_DUPLICATE", "This name or mapping already exists", 409);
      throw error;
    }
  }
  get(id: string, card = false): Item {
    if (card) {
      const item = this.get(id);
      const colors = item.variants
        .filter((v) => v.id === item.defaultVariantId)
        .map((v) => ({ ...v, overrides: [] }));
      return {
        ...item,
        variants: colors,
        colors,
        defaultColor: colors[0] ?? null,
        assets: [],
        materials: [],
        slots: [],
        bindings: [],
      };
    }
    const row = this.rows(
      "SELECT i.*,b.name AS brand_name,c.name AS category_name,(SELECT COUNT(*) FROM project_item_instances p WHERE p.item_id=i.id) AS usage_count FROM items i JOIN brands b ON b.id=i.brand_id JOIN categories c ON c.id=i.category_id WHERE i.id=?",
      id,
    )[0];
    if (!row) fail("ITEM_NOT_FOUND", "Item not found", 404);
    const variants = this.rows(
      `SELECT * FROM item_variants WHERE item_id=? ${card ? "AND id=?" : ""} ORDER BY created_at,id`,
      ...(card ? [id, String(row.defaultVariantId)] : [id]),
    ).map(({ colorSku, ...v }) => ({
      ...v,
      id: v.id,
      sku: colorSku,
      effectiveSku: colorSku ?? row.itemCode,
      width: row.width,
      depth: row.depth,
      height: row.height,
      modelAssetId: null,
      priceMinor: row.samePriceForAllColors
        ? (row.basePriceMinor ?? 0)
        : (v.priceOverrideMinor ?? row.basePriceMinor ?? 0),
      currency: row.samePriceForAllColors
        ? row.currency
        : (v.currencyOverride ?? row.currency),
      overrides: card
        ? []
        : this.rows(
            "SELECT slot_id,material_id,base_color FROM variant_material_overrides WHERE variant_id=?",
            String(v.id),
          ),
    }));
    const { dimensionVerificationJson, ...itemRow } = row;
    const item = itemSchema.parse({
      ...itemRow,
      dimensionVerification: dimensionVerificationJson
        ? JSON.parse(String(dimensionVerificationJson))
        : null,
      samePriceForAllColors: !!row.samePriceForAllColors,
      dimensions:
        row.width && row.depth && row.height
          ? { width: row.width, depth: row.depth, height: row.height }
          : null,
      colors: variants,
      defaultColor: variants.find((v) => v.id === row.defaultVariantId) ?? null,
      variants,
      assets: card
        ? []
        : this.rows(
            "SELECT id,item_id,type,mime_type,file_name,file_size,sha256,inspection_json,calibration_json,created_at FROM item_assets WHERE item_id=?",
            id,
          ).map((a) => ({
            ...a,
            inspection:
              a.type === "GLB_MODEL" && a.inspectionJson
                ? JSON.parse(String(a.inspectionJson))
                : null,
            generated:
              a.type === "THUMBNAIL" && a.inspectionJson
                ? JSON.parse(String(a.inspectionJson))
                : null,
            calibration: a.calibrationJson
              ? JSON.parse(String(a.calibrationJson))
              : null,
          })),
      slots: card
        ? []
        : this.rows("SELECT * FROM item_material_slots WHERE item_id=?", id),
      bindings: card
        ? []
        : this.rows("SELECT * FROM item_material_bindings WHERE item_id=?", id),
      materials: card
        ? []
        : this.rows("SELECT * FROM item_materials WHERE item_id=?", id).map(
            (m) => ({
              ...m,
              textures: this.rows(
                "SELECT channel,asset_id FROM item_material_textures WHERE material_id=?",
                String(m.id),
              ),
            }),
          ),
    });
    const ready = { ...item, setup: this.readiness(item) };
    const signature = thumbnailSignature(ready);
    return {
      ...ready,
      calibrationStatus: ready.setup.dimensionsConfirmed
        ? "VERIFIED"
        : item.dimensionVerification
          ? "INVALID"
          : "UNCONFIRMED",
      thumbnailGeneration: {
        signature,
        current:
          !!signature &&
          item.assets.find((a) => a.id === item.thumbnailAssetId)?.generated
            ?.signature === signature,
      },
    };
  }
  readiness(item: Item): ItemSetup {
    const model = item.assets.find(
      (a) => a.id === item.baseModelAssetId && a.type === "GLB_MODEL",
    );
    const dimensions = model ? calibratedDimensions(model) : null;
    const active = item.variants.filter((c) => c.status === "ACTIVE");
    const defaultColor = active.find((c) => c.id === item.defaultVariantId);
    const productInfoComplete =
      !!item.name.trim() &&
      !!this.db.prepare("SELECT id FROM brands WHERE id=?").get(item.brandId) &&
      !!this.db
        .prepare("SELECT id FROM categories WHERE id=?")
        .get(item.categoryId);
    const modelUploaded = !!model,
      modelValid =
        !!model?.inspection &&
        Object.values(model.inspection.dimensions).every(
          (n) => Number.isFinite(n) && n > 0,
        );
    const dimensionsConfirmed =
      modelValid &&
      !!item.dimensionVerification &&
      item.dimensionVerification.categoryId === item.categoryId &&
      item.dimensionVerification.modelAssetId === model?.id &&
      item.dimensionVerification.modelSha256 === model?.sha256 &&
      item.dimensionVerification.orientation ===
        model?.calibration?.orientation &&
      item.dimensionVerification.metresPerModelUnit ===
        model?.calibration?.metresPerModelUnit &&
      renderedDimensionsMatch(
        item.dimensionVerification.renderedBoundsMeters,
        item.dimensionVerification.canonicalDimensionsMeters,
      ) &&
      (["width", "depth", "height"] as const).every(
        (k) =>
          item[k] === item.dimensionVerification!.canonicalDimensionsMeters[k],
      ) &&
      !!dimensions &&
      (["width", "depth", "height"] as const).every(
        (k) =>
          item[k] !== null &&
          item[k]! > 0 &&
          Math.abs(dimensions[k] - item[k]!) <= dimensions[k] * 0.01,
      );
    const bindings = item.bindings.filter((b) => b.modelAssetId === model?.id);
    const colorTargetsConfigured =
      dimensionsConfirmed &&
      bindings.length > 0 &&
      bindings.every((b) => {
        const inspection = model!.inspection!;
        return (
          item.slots.some((s) => s.id === b.slotId) &&
          inspection.materials.some((m) => m.index === b.materialIndex) &&
          (b.nodeIndex === null ||
            inspection.meshes
              .find(
                (m) =>
                  m.index ===
                  inspection.nodes.find((n) => n.index === b.nodeIndex)?.mesh,
              )
              ?.primitives.some((p) => p.materialIndex === b.materialIndex))
        );
      });
    const hasActiveColor = active.length > 0,
      defaultColorValid = !!defaultColor;
    const basePriceValid =
      item.basePriceMinor !== null &&
      Number.isSafeInteger(item.basePriceMinor) &&
      item.basePriceMinor >= 0;
    const thumbnailReady = item.assets.some(
      (a) =>
        a.id === (defaultColor?.thumbnailAssetId ?? item.thumbnailAssetId) &&
        a.type === "THUMBNAIL",
    );
    const blockingIssues: ItemSetup["blockingIssues"] = [];
    const checkRequirement = (
      valid: boolean,
      code: string,
      step: SetupStep,
      message: string,
      field?: string,
    ) => {
      if (!valid)
        blockingIssues.push({
          code,
          step,
          message,
          ...(field ? { field } : {}),
        });
    };
    checkRequirement(
      productInfoComplete,
      "ITEM_INFORMATION_MISSING",
      "INFORMATION",
      "Save the product name, brand, and category.",
    );
    checkRequirement(
      modelUploaded,
      "ITEM_MODEL_MISSING",
      "MODEL",
      "Upload a 3D model.",
    );
    if (modelUploaded)
      checkRequirement(
        modelValid,
        "ITEM_GLB_INVALID",
        "MODEL",
        "Upload a valid supported GLB model.",
      );
    checkRequirement(
      dimensionsConfirmed,
      "ITEM_DIMENSIONS_UNCONFIRMED",
      "DIMENSIONS",
      "Real product dimensions still need confirmation.",
    );
    checkRequirement(
      !!item.dimensionVerification?.dimensionSource,
      "ITEM_DIMENSION_SOURCE_REQUIRED",
      "DIMENSIONS",
      "Choose a verified source for the real product dimensions.",
      "dimensionSource",
    );
    if (item.dimensionVerification && !dimensionsConfirmed)
      checkRequirement(
        false,
        "MODEL_RENDERED_DIMENSION_MISMATCH",
        "DIMENSIONS",
        "Reconfirm dimensions: the stored rendered-size proof no longer matches this product.",
      );
    checkRequirement(
      colorTargetsConfigured,
      "ITEM_COLOR_TARGET_MISSING",
      "COLOR_TARGETS",
      "Select and confirm the parts that change color.",
    );
    checkRequirement(
      hasActiveColor,
      "ITEM_COLOR_INVALID",
      "COLORS",
      "Add at least one active color.",
    );
    checkRequirement(
      defaultColorValid,
      "ITEM_DEFAULT_COLOR_INVALID",
      "COLORS",
      "Choose an active default color.",
      "defaultVariantId",
    );
    checkRequirement(
      basePriceValid,
      "ITEM_PRICE_MISSING",
      "PRICING",
      "Set the base product price.",
      "basePriceMinor",
    );
    checkRequirement(
      thumbnailReady,
      "ITEM_THUMBNAIL_MISSING",
      "THUMBNAIL",
      "Generate the product image before publishing.",
      "thumbnailAssetId",
    );
    let appearancesValid = true;
    if (dimensionsConfirmed && colorTargetsConfigured)
      for (const color of active) {
        try {
          this.validateVariant(item, color, true);
        } catch (error) {
          if (!(error instanceof ItemError)) throw error;
          appearancesValid = false;
          blockingIssues.push({
            code: error.code,
            step: "COLORS",
            message: error.message,
          });
        }
      }
    const publishable = blockingIssues.length === 0;
    const steps: ItemSetup["steps"] = [
      { id: "INFORMATION", complete: productInfoComplete, accessible: true },
      {
        id: "MODEL",
        complete: modelUploaded && modelValid,
        accessible: productInfoComplete,
      },
      {
        id: "DIMENSIONS",
        complete: dimensionsConfirmed,
        accessible: modelValid,
      },
      {
        id: "COLOR_TARGETS",
        complete: colorTargetsConfigured,
        accessible: dimensionsConfirmed,
      },
      {
        id: "COLORS",
        complete: hasActiveColor && defaultColorValid && appearancesValid,
        accessible: colorTargetsConfigured,
      },
      {
        id: "PRICING",
        complete: basePriceValid,
        accessible: productInfoComplete,
      },

      { id: "REVIEW", complete: publishable, accessible: true },
    ];
    return {
      productInfoComplete,
      modelUploaded,
      modelValid,
      dimensionsConfirmed,
      colorTargetsConfigured,
      hasActiveColor,
      defaultColorValid,
      basePriceValid,
      thumbnailReady,
      publishable,
      blockingIssues,
      nextRequiredStep: steps.find((s) => !s.complete)?.id ?? "REVIEW",
      steps,
    };
  }
  assertPublishable(item: Item) {
    const setup = this.readiness(item);
    if (!setup.publishable)
      throw new ItemError(
        400,
        "ITEM_NOT_PUBLISHABLE",
        "Complete the remaining setup requirements before publishing.",
        setup.blockingIssues,
      );
  }
  repairDefault(itemId: string) {
    const row = this.db
      .prepare("SELECT default_variant_id FROM items WHERE id=?")
      .get(itemId) as { default_variant_id: string | null };
    const active = this.db
      .prepare(
        "SELECT id FROM item_variants WHERE item_id=? AND status='ACTIVE' ORDER BY created_at,id",
      )
      .all(itemId) as { id: string }[];
    const next =
      active.find((c) => c.id === row.default_variant_id)?.id ??
      active[0]?.id ??
      null;
    if (next !== row.default_variant_id)
      this.write("items", { defaultVariantId: next, updatedAt: now() }, itemId);
  }
  visible(item: Item) {
    const variants = item.variants.filter((v) => v.status === "ACTIVE");
    const materialIds = new Set(
        variants.flatMap((v) => v.overrides.map((o) => o.materialId)),
      ),
      materials = item.materials.filter((m) => materialIds.has(m.id));
    const assetIds = new Set([
      item.thumbnailAssetId,
      ...variants.flatMap((v) => [
        item.baseModelAssetId,
        v.thumbnailAssetId ?? item.thumbnailAssetId,
      ]),
      ...materials.flatMap((m) => m.textures.map((t) => t.assetId)),
    ]);
    return {
      ...item,
      usageCount: 0,
      variants,
      colors: variants,
      defaultColor:
        variants.find((v) => v.id === item.defaultVariantId) ?? null,
      assets: item.assets.filter((a) => assetIds.has(a.id)),
      materials,
      bindings: item.bindings.filter((b) => assetIds.has(b.modelAssetId)),
    };
  }
  list(query: unknown, admin: boolean) {
    const q = z
      .object({
        search: z.string().max(120).default(""),
        category: z.string().default(""),
        brand: z.string().default(""),
        status: z.enum(["", "DRAFT", "ACTIVE", "INACTIVE"]).default(""),
        currency: z.string().default(""),
        minPrice: z.coerce.number().int().nonnegative().optional(),
        maxPrice: z.coerce.number().int().nonnegative().optional(),
        sort: z
          .enum([
            "name",
            "price-asc",
            "price-desc",
            "newest",
            "brand",
            "category",
            "status",
          ])
          .default("name"),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(60).default(24),
      })
      .strict()
      .parse(query);
    const where: string[] = [],
      args: SQLInputValue[] = [];
    if (!admin) {
      where.push("i.status='ACTIVE' AND v.status='ACTIVE'");
    } else if (q.status) {
      where.push("i.status=?");
      args.push(q.status);
    }
    for (const [field, value] of [
      ["i.category_id", q.category],
      ["i.brand_id", q.brand],
      [
        "CASE WHEN i.same_price_for_all_colors=1 THEN i.currency ELSE COALESCE(v.currency_override,i.currency) END",
        q.currency,
      ],
    ])
      if (value) {
        where.push(`${field}=?`);
        args.push(value);
      }
    if (q.search) {
      where.push(
        `(instr(lower(i.name),lower(?))>0 OR instr(lower(COALESCE(i.item_code,'')),lower(?))>0 OR EXISTS(SELECT 1 FROM item_variants sv WHERE sv.item_id=i.id AND instr(lower(COALESCE(sv.color_sku,i.item_code)),lower(?))>0 ${admin ? "" : "AND sv.status='ACTIVE'"}))`,
      );
      args.push(q.search, q.search, q.search);
    }
    if (
      q.minPrice !== undefined ||
      q.maxPrice !== undefined ||
      q.sort.startsWith("price")
    ) {
      if (!q.currency)
        fail("ITEM_PRICE_INVALID", "Choose a currency for price comparisons");
    }
    if (q.minPrice !== undefined) {
      where.push(
        "(CASE WHEN i.same_price_for_all_colors=1 THEN i.base_price_minor ELSE COALESCE(v.price_override_minor,i.base_price_minor) END)>=?",
      );
      args.push(q.minPrice);
    }
    if (q.maxPrice !== undefined) {
      where.push(
        "(CASE WHEN i.same_price_for_all_colors=1 THEN i.base_price_minor ELSE COALESCE(v.price_override_minor,i.base_price_minor) END)<=?",
      );
      args.push(q.maxPrice);
    }
    const base = `FROM items i LEFT JOIN item_variants v ON v.id=i.default_variant_id JOIN brands b ON b.id=i.brand_id JOIN categories c ON c.id=i.category_id ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
    const sort = {
      name: "i.name COLLATE NOCASE",
      "price-asc":
        "(CASE WHEN i.same_price_for_all_colors=1 THEN i.base_price_minor ELSE COALESCE(v.price_override_minor,i.base_price_minor) END) ASC",
      "price-desc":
        "(CASE WHEN i.same_price_for_all_colors=1 THEN i.base_price_minor ELSE COALESCE(v.price_override_minor,i.base_price_minor) END) DESC",
      newest: "i.created_at DESC",
      brand: "b.name",
      category: "c.name",
      status: "i.status",
    }[q.sort];
    if (!admin) {
      const ready = this.rows(
        `SELECT i.id ${base} ORDER BY ${sort},i.id`,
        ...args,
      )
        .map((row) => this.get(String(row.id), true))
        .filter((item) => item.setup?.publishable);
      return {
        items: ready
          .slice((q.page - 1) * q.pageSize, q.page * q.pageSize)
          .map((item) => this.visible(item)),
        total: ready.length,
        page: q.page,
        pageSize: q.pageSize,
      };
    }
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS total ${base}`).get(...args) as {
        total: number;
      }
    ).total;
    const items = this.rows(
      `SELECT i.id ${base} ORDER BY ${sort},i.id LIMIT ? OFFSET ?`,
      ...args,
      q.pageSize,
      (q.page - 1) * q.pageSize,
    ).map((row) => {
      const item = this.get(String(row.id), true);
      return admin ? item : this.visible(item);
    });
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  asset(item: Item, id: string | null, type: string) {
    const asset = item.assets.find((a) => a.id === id && a.type === type);
    if (!asset)
      fail(
        type === "GLB_MODEL" ? "ITEM_MODEL_MISSING" : "ITEM_TEXTURE_INVALID",
        "Select a valid asset belonging to this Item",
      );
    return asset;
  }
  validateVariant(
    item: Item,
    v: ItemVariant,
    requireReady = item.status === "ACTIVE",
  ) {
    const asset = item.baseModelAssetId
      ? this.asset(item, item.baseModelAssetId, "GLB_MODEL")
      : null;
    const dims = asset ? calibratedDimensions(asset) : null;
    if (requireReady && (!dims || !item.width || !item.depth || !item.height))
      fail(
        "ITEM_DIMENSIONS_UNCONFIRMED",
        "Confirm the real product dimensions first.",
      );
    if (dims && item.width && item.depth && item.height)
      for (const k of ["width", "depth", "height"] as const)
        if (Math.abs(dims[k] - item[k]!) > dims[k] * 0.01)
          fail(
            "MODEL_DIMENSION_PROPORTION_MISMATCH",
            "Check the real product dimensions and model orientation.",
          );
    if (v.thumbnailAssetId) this.asset(item, v.thumbnailAssetId, "THUMBNAIL");
    if (requireReady && !v.overrides.length)
      fail(
        "ITEM_COLOR_INVALID",
        "Choose a solid color or texture for each active color before publishing.",
      );
    const seen = new Set<string>();
    for (const o of v.overrides) {
      if (seen.has(o.slotId) || !item.slots.some((s) => s.id === o.slotId))
        fail("ITEM_MATERIAL_SLOT_INVALID", "Invalid or repeated semantic slot");
      seen.add(o.slotId);
      const bindings = item.bindings.filter(
        (b) => b.slotId === o.slotId && b.modelAssetId === asset?.id,
      );
      if (requireReady && !bindings.length)
        fail(
          "ITEM_MATERIAL_BINDING_INVALID",
          "Map this slot to the selected model first",
        );
      if (o.materialId) {
        const material = item.materials.find((m) => m.id === o.materialId);
        if (!material)
          fail(
            "ITEM_VARIANT_MATERIAL_INVALID",
            "Material must belong to this Item",
          );
        if (material.textures.length)
          for (const binding of bindings) {
            const meshes =
              binding.nodeIndex === null
                ? asset!.inspection!.meshes
                : asset!.inspection!.meshes.filter(
                    (m) =>
                      m.index ===
                      asset!.inspection!.nodes.find(
                        (n) => n.index === binding.nodeIndex,
                      )?.mesh,
                  );
            if (
              meshes
                .flatMap((m) => m.primitives)
                .some(
                  (p) => p.materialIndex === binding.materialIndex && !p.hasUV,
                )
            )
              fail(
                "ITEM_TEXTURE_UV_MISSING",
                "This selected product surface cannot use texture images because the model has no usable UV mapping for this region. You can still use a solid color.",
              );
          }
      }
    }
  }
  validate(item: Item) {
    if (
      !this.db
        .prepare("SELECT id FROM categories WHERE id=?")
        .get(item.categoryId)
    )
      fail("ITEM_INVALID_CATEGORY", "Category not found");
    if (!this.db.prepare("SELECT id FROM brands WHERE id=?").get(item.brandId))
      fail("ITEM_INVALID_BRAND", "Brand not found");
    if (item.baseModelAssetId)
      this.asset(item, item.baseModelAssetId, "GLB_MODEL");
    if ([item.width, item.depth, item.height].some((v) => v !== null)) {
      if (!item.width || !item.depth || !item.height)
        fail(
          "ITEM_DIMENSIONS_INVALID",
          "All three real dimensions are required",
        );
      const model = this.asset(item, item.baseModelAssetId, "GLB_MODEL"),
        dims = calibratedDimensions(model);
      if (!dims)
        fail(
          "ITEM_MODEL_CALIBRATION_INVALID",
          "Confirm real product dimensions",
        );
      for (const k of ["width", "depth", "height"] as const)
        if (Math.abs(dims[k] - item[k]!) > dims[k] * 0.01)
          fail(
            "MODEL_DIMENSION_PROPORTION_MISMATCH",
            "Item dimensions must match uniformly calibrated geometry",
          );
    }
    if (item.thumbnailAssetId)
      this.asset(item, item.thumbnailAssetId, "THUMBNAIL");
    for (const v of item.variants) this.validateVariant(item, v, false);
    if (
      item.defaultVariantId &&
      !item.variants.some((v) => v.id === item.defaultVariantId)
    )
      fail(
        "ITEM_DEFAULT_COLOR_INVALID",
        "The selected color does not belong to this product.",
      );
    if (
      item.defaultVariantId &&
      item.variants.find((v) => v.id === item.defaultVariantId)?.status !==
        "ACTIVE"
    )
      fail("ITEM_DEFAULT_COLOR_INVALID", "Choose an active default color.");
    if (item.status === "ACTIVE") this.assertPublishable(item);
  }

  saveItem(input: unknown, id?: string) {
    return this.transaction(() => {
      const previous = id ? this.get(id) : null;
      const parsed = itemInput.parse({
        ...(previous ? fields(itemInput, previous) : {}),
        ...z.record(z.string(), z.unknown()).parse(input),
      });
      if (
        previous?.usageCount &&
        (["baseModelAssetId", "width", "depth", "height"] as const).some(
          (k) => parsed[k] !== previous[k],
        )
      )
        fail("ITEM_IN_USE", "Used models cannot be replaced", 409);
      if (parsed.defaultVariantId === null && previous)
        parsed.defaultVariantId =
          previous.variants.find((v) => v.status === "ACTIVE")?.id ?? null;
      const itemId = id ?? randomUUID();
      // Validate before FK errors, including explicit cross-Item reference attempts.
      const candidate = {
        ...previous,
        ...parsed,
        id: itemId,
        variants: previous?.variants ?? [],
        assets: previous?.assets ?? [],
        slots: previous?.slots ?? [],
        bindings: previous?.bindings ?? [],
        materials: previous?.materials ?? [],
      } as Item;
      this.validate(candidate);
      this.write(
        "items",
        {
          ...parsed,
          samePriceForAllColors: Number(parsed.samePriceForAllColors),
          ...(id ? {} : { id: itemId, createdAt: now() }),
          updatedAt: now(),
        },
        id,
      );
      if (parsed.width && parsed.depth && parsed.height)
        this.db
          .prepare(
            "UPDATE item_variants SET width=?,depth=?,height=? WHERE item_id=?",
          )
          .run(parsed.width, parsed.depth, parsed.height, itemId);
      return this.get(itemId);
    });
  }
  saveVariant(itemId: string, input: unknown, id?: string) {
    return this.transaction(() => {
      const item = this.get(itemId),
        previous = id ? item.variants.find((v) => v.id === id) : null;
      if (id && !previous)
        fail("ITEM_VARIANT_MISSING", "Variant not found", 404);
      const parsed = variantInput.parse({
        ...(previous
          ? {
              ...fields(variantInput, previous),
              priceMinor: previous.priceOverrideMinor,
              currency: previous.currencyOverride,
            }
          : {}),
        ...z.record(z.string(), z.unknown()).parse(input),
      });
      if (
        !id &&
        this.db
          .prepare(
            "SELECT id FROM item_variants WHERE item_id=? AND lower(name)=lower(?)",
          )
          .get(itemId, parsed.name)
      )
        fail(
          "ITEM_COLOR_DUPLICATE",
          "A color with this name already exists. Edit the existing color instead.",
          409,
        );
      const variantId = id ?? randomUUID();

      if (parsed.currency && parsed.priceMinor === null)
        fail(
          "ITEM_PRICE_INVALID",
          "A currency override requires a price override",
        );
      const v = {
        ...parsed,
        ...(item.dimensions ?? {
          width: previous?.width ?? 1,
          depth: previous?.depth ?? 1,
          height: previous?.height ?? 1,
        }),
        modelAssetId: null,
        priceMinor: item.samePriceForAllColors
          ? (item.basePriceMinor ?? 0)
          : (parsed.priceMinor ?? item.basePriceMinor ?? 0),
        currency: item.samePriceForAllColors
          ? item.currency
          : (parsed.currency ?? item.currency),
        priceOverrideMinor: parsed.priceMinor,
        currencyOverride: parsed.currency,
        effectiveSku: parsed.sku ?? item.itemCode,
        id: variantId,
        itemId,
        createdAt: previous?.createdAt ?? now(),
        updatedAt: now(),
      };
      this.validateVariant(item, v);
      const { overrides, effectiveSku: _effectiveSku, ...record } = v;
      void _effectiveSku;
      this.write(
        "item_variants",
        { ...record, sku: `__color:${variantId}`, colorSku: parsed.sku },
        id,
      );
      this.db
        .prepare("DELETE FROM variant_material_overrides WHERE variant_id=?")
        .run(variantId);
      for (const o of overrides)
        this.write("variant_material_overrides", { itemId, variantId, ...o });
      this.repairDefault(itemId);
      this.write("items", { updatedAt: now() }, itemId);
      const result = this.get(itemId);
      this.validate(result);
      return result;
    });
  }
  calibrate(itemId: string, assetId: string, input: unknown, actorId?: string) {
    return this.transaction(() => {
      const item = this.get(itemId),
        asset = this.asset(item, assetId, "GLB_MODEL");
      const raw = z.record(z.string(), z.unknown()).parse(input);
      if ("metresPerModelUnit" in raw) dimensionsInput.parse(raw);
      if (!raw.dimensionSource)
        fail(
          "ITEM_DIMENSION_SOURCE_REQUIRED",
          "Choose the verified dimension source.",
        );
      if (raw.dimensionsVerified !== true)
        fail(
          "ITEM_DIMENSIONS_UNCONFIRMED",
          "Verify the dimensions against the real product.",
        );
      if (
        typeof raw.orientation !== "number" ||
        ![0, 90, 180, 270].includes(raw.orientation)
      )
        fail(
          "MODEL_ORIENTATION_INVALID",
          "Choose 0°, 90°, 180°, or 270° product orientation.",
        );
      if (!raw.renderedBoundsMeters)
        fail(
          "MODEL_RENDERED_DIMENSION_MISMATCH",
          "Wait for the calibrated model size check.",
        );
      const parsed = dimensionsInput.parse(input);
      if (
        !actorId ||
        !this.db
          .prepare(
            "SELECT id FROM users WHERE id=? AND role='ADMIN' AND status='ACTIVE'",
          )
          .get(actorId)
      )
        fail(
          "ITEM_ADMIN_REQUIRED",
          "Only an active administrator can verify dimensions.",
          403,
        );
      const warning = dimensionPlausibility(item.categoryId, parsed);
      if (warning && !parsed.unusualDimensionsAcknowledged)
        fail(
          warning.code,
          warning.message +
            " Verify the units or explicitly acknowledge these unusual dimensions.",
        );
      if (item.baseModelAssetId && item.baseModelAssetId !== assetId)
        fail("ITEM_MODEL_MISSING", "Calibrate the Item's canonical model");
      if (
        item.usageCount &&
        (["width", "depth", "height"] as const).some(
          (k) => item[k] !== parsed[k],
        )
      )
        fail("ITEM_IN_USE", "Used product dimensions are locked", 409);
      let calibration;
      try {
        calibration = uniformCalibration(asset!.inspection!.dimensions, parsed);
      } catch {
        fail(
          "MODEL_DIMENSION_PROPORTION_MISMATCH",
          "The entered product dimensions do not match the proportions of the uploaded 3D model. Check Width, Depth, Height, or model orientation.",
        );
      }
      if (
        item.usageCount &&
        JSON.stringify(calibration) !== JSON.stringify(asset.calibration)
      )
        fail("ITEM_IN_USE", "Used model calibration is locked", 409);
      const calculated = calibratedDimensions({ ...asset, calibration })!;
      const expectedBounds = {
        min: [-calculated.width / 2, 0, -calculated.depth / 2] as [
          number,
          number,
          number,
        ],
        max: [
          calculated.width / 2,
          calculated.height,
          calculated.depth / 2,
        ] as [number, number, number],
      };
      if (
        !renderedDimensionsMatch(parsed.renderedBoundsMeters, parsed) ||
        !renderedDimensionsMatch(parsed.renderedBoundsMeters, calculated) ||
        !renderedDimensionsMatch(expectedBounds, parsed)
      )
        fail(
          "MODEL_RENDERED_DIMENSION_MISMATCH",
          "The rendered calibrated model does not match the verified real dimensions.",
        );
      const verification = {
        dimensionsVerified: true,
        dimensionSource: parsed.dimensionSource,
        verifiedByUserId: actorId,
        verifiedAt: now(),
        modelAssetId: assetId,
        modelSha256: asset.sha256,
        orientation: parsed.orientation,
        metresPerModelUnit: calibration.metresPerModelUnit,
        canonicalDimensionsMeters: {
          width: parsed.width,
          depth: parsed.depth,
          height: parsed.height,
        },
        renderedBoundsMeters: parsed.renderedBoundsMeters,
        unusualDimensionsAcknowledged:
          !!warning && parsed.unusualDimensionsAcknowledged,
        categoryId: item.categoryId,
      };
      this.write(
        "item_assets",
        { calibrationJson: JSON.stringify(calibration) },
        assetId,
      );
      this.write(
        "items",
        {
          baseModelAssetId: assetId,
          dimensionVerificationJson: JSON.stringify(verification),
          width: parsed.width,
          depth: parsed.depth,
          height: parsed.height,
          updatedAt: now(),
        },
        itemId,
      );
      // Deprecated non-null columns are compatibility mirrors only.
      this.db
        .prepare(
          "UPDATE item_variants SET width=?,depth=?,height=?,model_asset_id=NULL WHERE item_id=?",
        )
        .run(parsed.width, parsed.depth, parsed.height, itemId);
      this.validate(this.get(itemId));
      return this.get(itemId);
    });
  }
  colorTargets(itemId: string, input: unknown) {
    return this.transaction(() => {
      const item = this.get(itemId),
        { targets } = colorTargetsInput.parse(input);
      if (item.usageCount)
        fail("ITEM_IN_USE", "Used color mappings are locked", 409);
      if (!item.dimensions)
        fail("ITEM_MODEL_CALIBRATION_INVALID", "Confirm dimensions first");
      let slot = item.slots.find((s) => s.name === "PRODUCT_COLOR");
      if (!slot) {
        this.slot(itemId, { name: "PRODUCT_COLOR" });
        slot = this.get(itemId).slots.find((s) => s.name === "PRODUCT_COLOR")!;
      }
      this.db
        .prepare("DELETE FROM item_material_bindings WHERE slot_id=?")
        .run(slot.id);
      // Validate each mapping without validating temporarily incomplete color overrides.
      for (const target of targets)
        this.binding(
          itemId,
          { ...target, slotId: slot.id, modelAssetId: item.baseModelAssetId },
          undefined,
          true,
        );
      this.validate(this.get(itemId));
      return this.get(itemId);
    });
  }
  saveColor(itemId: string, input: unknown, id?: string) {
    return this.transaction(() => {
      // Parse normalized values; retain omission semantics on PATCH.
      const supplied = z.record(z.string(), z.unknown()).parse(input);
      const normalized = simpleColorInput.partial().parse(supplied);
      const raw = Object.fromEntries(
        Object.entries(normalized).filter(([key]) => key in supplied),
      ) as typeof normalized;
      const { baseColor, textureAssetId, ...parsedRest } = raw;
      const rest: Record<string, unknown> = parsedRest;
      const item = this.get(itemId),
        previous = item.variants.find((v) => v.id === id);
      if (id && !previous)
        fail(
          "ITEM_COLOR_INVALID",
          "This color is no longer available. Reload the product.",
          404,
        );
      if (baseColor !== undefined || textureAssetId !== undefined) {
        const slot = item.slots.find((s) => s.name === "PRODUCT_COLOR");
        if (!slot || !item.bindings.some((b) => b.slotId === slot.id))
          fail(
            "ITEM_MATERIAL_BINDING_INVALID",
            "Select and confirm product color parts first",
          );
        const other = (previous?.overrides ?? []).filter(
          (o) => o.slotId !== slot.id,
        );
        if (textureAssetId) {
          const result = this.material(itemId, {
            name: String(rest.name ?? previous?.name ?? "Color"),
            baseColor: baseColor ?? "#ffffff",
            roughness: 0.8,
            metalness: 0,
            opacity: 1,
            textures: [{ channel: "BASE_COLOR", assetId: textureAssetId }],
          });
          const material = result.materials.find(
            (m) => !item.materials.some((old) => old.id === m.id),
          )!;
          rest.overrides = [
            ...other,
            { slotId: slot.id, materialId: material.id, baseColor: null },
          ];
        } else
          rest.overrides = [
            ...other,
            {
              slotId: slot.id,
              materialId: null,
              baseColor: baseColor ?? "#ffffff",
            },
          ];
        rest.color = baseColor ?? null;
      }
      return this.saveVariant(itemId, rest, id);
    });
  }
  slot(itemId: string, input: unknown) {
    return this.transaction(() => {
      this.get(itemId);
      const { name } = z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(input);
      this.write("item_material_slots", { id: randomUUID(), itemId, name });
      return this.get(itemId);
    });
  }
  binding(
    itemId: string,
    input: unknown,
    id?: string,
    deferValidation = false,
  ) {
    return this.transaction(() => {
      const item = this.get(itemId);
      if (item.usageCount)
        fail("ITEM_IN_USE", "Used material mappings are locked", 409);
      if (id && !item.bindings.some((b) => b.id === id))
        fail("ITEM_MATERIAL_BINDING_INVALID", "Binding not found", 404);
      const b = bindingInput.parse(input);
      if (b.modelAssetId !== item.baseModelAssetId)
        fail(
          "ITEM_MATERIAL_BINDING_INVALID",
          "Map the canonical Item model only",
        );
      const asset = this.asset(item, b.modelAssetId, "GLB_MODEL"),
        inspection = asset!.inspection!;
      if (
        !item.slots.some((s) => s.id === b.slotId) ||
        !inspection.materials.some((m) => m.index === b.materialIndex)
      )
        fail(
          "ITEM_MATERIAL_BINDING_INVALID",
          "Select an inspected material and an Item slot",
        );
      const node =
        b.nodeIndex === null
          ? null
          : inspection.nodes.find((n) => n.index === b.nodeIndex);
      if (
        b.nodeIndex !== null &&
        (!node ||
          !inspection.meshes
            .find((m) => m.index === node.mesh)
            ?.primitives.some((p) => p.materialIndex === b.materialIndex))
      )
        fail(
          "ITEM_MATERIAL_BINDING_INVALID",
          "Node does not use that material",
        );
      if (
        item.bindings.some(
          (other) =>
            other.id !== id &&
            other.modelAssetId === b.modelAssetId &&
            other.materialIndex === b.materialIndex &&
            (other.nodeIndex === null ||
              b.nodeIndex === null ||
              other.nodeIndex === b.nodeIndex),
        )
      )
        fail(
          "ITEM_MATERIAL_BINDING_INVALID",
          "This material is already mapped",
        );
      this.write(
        "item_material_bindings",
        { ...b, itemId, ...(id ? {} : { id: randomUUID() }) },
        id,
      );
      if (!deferValidation) this.validate(this.get(itemId));
      return this.get(itemId);
    });
  }
  material(itemId: string, input: unknown, id?: string) {
    return this.transaction(() => {
      const item = this.get(itemId),
        previous = id ? item.materials.find((m) => m.id === id) : null;
      if (id && !previous)
        fail("ITEM_VARIANT_MATERIAL_INVALID", "Material not found", 404);
      const m = materialInput.parse({
        ...(previous ? fields(materialInput, previous) : {}),
        ...z.record(z.string(), z.unknown()).parse(input),
      });
      const channels = new Set<string>();
      for (const t of m.textures) {
        this.asset(item, t.assetId, "TEXTURE");
        if (channels.has(t.channel))
          fail("ITEM_TEXTURE_INVALID", "Duplicate texture channel");
        channels.add(t.channel);
      }
      const materialId = id ?? randomUUID(),
        { textures, ...record } = m;
      this.write(
        "item_materials",
        {
          ...record,
          itemId,
          ...(id ? {} : { id: materialId, createdAt: now() }),
          updatedAt: now(),
        },
        id,
      );
      this.db
        .prepare("DELETE FROM item_material_textures WHERE material_id=?")
        .run(materialId);
      for (const t of textures)
        this.write("item_material_textures", { itemId, materialId, ...t });
      this.validate(this.get(itemId));
      return this.get(itemId);
    });
  }
  taxonomy(table: "brands" | "categories", input: unknown, id?: string) {
    return this.transaction(() => {
      const values = z
        .object({
          name: z.string().trim().min(1).max(120),
          active: z.boolean().default(true),
        })
        .strict()
        .parse(input);
      if (id && !this.db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id))
        fail("ITEM_NOT_FOUND", "Record not found", 404);
      this.write(
        table,
        {
          ...values,
          active: Number(values.active),
          ...(id ? {} : { id: randomUUID() }),
        },
        id,
      );
      return this.taxonomies(table, true);
    });
  }
  validateInstances(scene: HomeScene, previous: HomeScene) {
    const previousInstances = new Map(
      previous.floors
        .flatMap((f) => f.itemInstances ?? [])
        .map((i) => [i.id, i]),
    );
    const seen = new Set(
      scene.floors.flatMap((f) => [f.id, ...entitiesOf(f).map((e) => e.id)]),
    );
    const cache = new Map<string, Item>();
    for (const floor of scene.floors)
      for (const input of floor.itemInstances ?? []) {
        const i = projectItemInstanceSchema.parse(input);
        if (seen.has(i.id) || i.floorId !== floor.id)
          fail(
            "PROJECT_ITEM_VARIANT_INVALID",
            "Duplicate instance or incorrect floor",
          );
        seen.add(i.id);
        const persisted = this.db
          .prepare("SELECT state_id FROM project_item_instances WHERE id=?")
          .get(i.id) as { state_id: string } | undefined;
        if (persisted && persisted.state_id !== scene.id)
          fail(
            "PROJECT_ITEM_VARIANT_INVALID",
            "Instance ID belongs to another scene",
          );
        const old = previousInstances.get(i.id);
        if (old && old.itemId !== i.itemId)
          fail(
            "PROJECT_ITEM_VARIANT_INVALID",
            "An instance can only switch Variants of the same Item",
          );
        let item = cache.get(i.itemId);
        if (!item) {
          item = this.get(i.itemId);
          cache.set(i.itemId, item);
        }
        const variant = item.variants.find((v) => v.id === i.variantId);
        if (!variant)
          fail(
            "PROJECT_ITEM_VARIANT_INVALID",
            "Variant does not belong to this Item",
          );
        if (
          (item.status !== "ACTIVE" || variant.status !== "ACTIVE") &&
          !(old && old.itemId === i.itemId && old.variantId === i.variantId)
        )
          fail("ITEM_INACTIVE", "Inactive Items cannot be newly placed");
        this.validateVariant(item, variant, true);
        const room = i.spaceId
          ? floor.rooms.find((r) => r.id === i.spaceId)
          : null;
        if (i.spaceId && !room)
          fail(
            "PROJECT_ITEM_VARIANT_INVALID",
            "Space must belong to the same floor",
          );
        const elevation = room ? room.floorElevation : floor.elevation;
        if (elevation == null)
          fail(
            "ITEM_PLACEMENT_ELEVATION_UNKNOWN",
            "Confirm the Space or Floor elevation before placement",
          );
      }
  }
  resolve(scene: HomeScene) {
    const ids = [
      ...new Set(
        scene.floors.flatMap((f) =>
          (f.itemInstances ?? []).map((i) => i.itemId),
        ),
      ),
    ];
    return ids.map((id) => {
      const item = this.get(id),
        used = new Set(
          scene.floors.flatMap((f) =>
            (f.itemInstances ?? [])
              .filter((i) => i.itemId === id)
              .map((i) => i.variantId),
          ),
        );
      const visible = this.visible({
        ...item,
        variants: item.variants.map((v) => ({
          ...v,
          status:
            used.has(v.id) ||
            (item.status === "ACTIVE" && v.status === "ACTIVE")
              ? "ACTIVE"
              : "INACTIVE",
        })),
      });
      return {
        ...visible,
        defaultColor: visible.defaultColor
          ? (item.variants.find((v) => v.id === visible.defaultColor!.id) ??
            null)
          : null,
        colors: visible.variants.map((v) =>
          item.variants.find((original) => original.id === v.id)!,
        ),
        variants: visible.variants.map((v) =>
          item.variants.find((original) => original.id === v.id)!,
        ),
      };
    });
  }

  taxonomies(table: "brands" | "categories", admin: boolean) {
    return this.rows(
      `SELECT * FROM ${table} ${admin ? "" : "WHERE active=1"} ORDER BY name,id`,
    ).map((r) => ({ ...r, active: !!r.active }));
  }
}

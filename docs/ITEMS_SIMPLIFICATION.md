# Items simplification

The subsequent [setup hardening phase](ITEMS_SETUP_HARDENING.md) adds eight resumable steps, atomic model replacement, server readiness, and draft/default validation. That report supersedes this phase’s seven-step setup and upload-only workflow.

## Pre-implementation audit — 2026-10-04

- **Current Item model:** product metadata, brand/category, base model, cover, default Variant, publication status.
- **Current Variant model:** name, mandatory unique SKU and price, dimensions, optional model override, material overrides.
- **Current dimension ownership:** Variant; calibration lives on the GLB asset.
- **Current model ownership:** Item base model with optional Variant replacement.
- **Current material workflow:** separate slot, binding, material, and Variant stages; index dropdowns, no visual selection.
- **Target simple Item model:** one canonical model, fixed metre dimensions, base price/currency/code, default color.
- **Target color model:** appearance, optional SKU/price overrides, status and optional cover; stable existing Variant IDs.
- **Database delta:** additive Item dimensions/pricing and nullable color override columns. Retain old non-null Variant columns as internal compatibility mirrors, never client-controlled geometry.
- **Safe legacy migration:** inspect all Variants, including inactive configurations, for identical dimensions and effective model. Abort atomically with ITEM_REQUIRES_SPLIT_BY_SIZE on incompatibility. Preserve bindings, appearance, IDs and project references. Drafts without colors require dimension confirmation.
- **Admin UI delta:** seven stages, real dimensions first, visual multiselect color targets, solid/texture colors, inherited pricing. Technical tools remain under Advanced.
- **User UI delta:** one fixed dimension display, Color selection, move/rotate/color only in workspace.
- **Server validation delta:** strict color inputs reject geometry; Item geometry and calibration remain locked after use; selected targets must map unambiguously and textures require UVs.
- **No-stretch enforcement:** one uniform calculated scale, proportionality validation, strict instance contract, Item-derived footprints and model.

### Live data and safety

Read-only audit found one draft Item (`a3aa02bd-a493-40c5-a417-d517a195af94`), one GLB (`modern__sofa.glb`), zero Variants, zero bindings/material overrides, and zero project instances. No incompatible legacy geometry or appearance references exist. The draft's previous scale is 80 metres/model-unit at 90 degrees; this is preserved but not treated as confirmed real product dimensions. Admin must enter and confirm real dimensions before colors/publication. No dimensions are guessed.

SQLite backup: `/tmp/habitat-before-simplification.sqlite`; per-table baseline hashes: `/tmp/habitat-before-simplification-hashes.json`. GLB bytes are retained unchanged.

## Item Model

One Item is one physical product: `baseModelAssetId`, canonical `width/depth/height` in metres, metadata, `basePriceMinor`, currency, product code, and default color. Draft dimensions and price may remain null during setup; colors require confirmed dimensions and publication requires a base price. `dimensions`, `colors`, and `defaultColor` are explicit response fields. Compatibility `variants` and `defaultVariantId` remain available.

## Color Options

Existing `item_variants` IDs remain stable. Colors carry name, status, appearance, optional SKU and price/currency overrides, and optional thumbnail. Both `/colors` and the compatibility `/variants` write endpoints strictly reject `width`, `depth`, `height`, and `modelAssetId`, even when equal to Item values. Existing multi-slot overrides remain intact.

`POST /api/admin/items/:id/colors` accepts, for example, `{ "name": "Blue", "baseColor": "#31577a", "textureAssetId": null, "status": "ACTIVE" }`. PATCH uses `/colors/:colorId`. SKU and price may be omitted; `priceMinor`/`currency` on writes mean optional overrides, while responses include resolved `priceMinor`/`currency` plus explicit `priceOverrideMinor`/`currencyOverride`.

## Dimensions

Dimensions belong to Item because all colors represent the same physical product. Deprecated non-null Variant dimension columns are written only as compatibility mirrors of Item values. Responses likewise project Item dimensions; renderers and footprints read Item directly. Clients cannot write those mirrors.

## GLB

New products can upload exactly one GLB. A second GLB upload returns `ITEM_MODEL_ALREADY_EXISTS`; another physical geometry/size requires a separate Item. Legacy unused assets are retained for data preservation but cannot act as color geometry. Rendering and asset visibility use the Item model. Original bytes are never modified for colors.

## No Stretch

The strict project-instance schema allows translation and rotation, with no scale/resize properties. Its stored `variantId` is the selected color ID. The renderer uses one scalar unit conversion, never independent axis scaling. Tests create independent 220 cm and 260 cm Items with separately authored models and reject color geometry or `scaleX` instance input.

## Calibration

Admin enters centimetres and chooses 0/90/180/270-degree orientation, then confirms the real measurements. The API accepts metre dimensions, orientation, and `confirmed: true` at `PATCH /api/admin/items/:id/assets/:assetId/calibration`. It accounts for orientation, calculates three implied scales, and requires every axis ratio to fall within 1% of their mean. Mismatch returns `MODEL_DIMENSION_PROPORTION_MISMATCH`. Accepted models use the one mean scale; there is no corrective stretch. Calculated metres per model unit is read-only under Advanced.

Item dimensions, model, calibration, and bindings remain protected by `ITEM_IN_USE` after placement. Appearance updates retain the geometry and may propagate as before.

## Product Color Mapping

Admin clicks actual regions in the GLB preview. A click identifies the GLTF material and owning node, including material arrays and nested meshes. Multiple regions can be selected; selected regions highlight, and a second click or Remove selection removes one. Confirm atomically creates/reuses `PRODUCT_COLOR` and validates node/material pairs. Invalid, duplicate, overlapping, cross-Item, and in-use mappings are rejected. Existing mappings belonging to other slots are not silently reassigned. The model camera frames the loaded geometry rather than the initial empty scene.

`POST /api/admin/items/:id/color-targets` takes `{ "targets": [{ "materialIndex": 0, "nodeIndex": 3 }] }`. Indices are internal data produced by clicks, not fields in the primary admin workflow. Advanced inspection and mapping editors remain available.

## Colors

Solid colors override selected materials' base color. Optional PNG/JPEG/WebP textures use the existing authenticated upload/storage and UV-validation pipeline. Unselected parts retain original GLB materials. Live solid and texture previews use cached GLBs with cloned instance materials; geometry remains shared and material edits remain isolated. Color cards support preview, editing, and removal by deactivation, preserving project references. An active Item must retain an active default color.

Legacy colors that use existing advanced slots/materials retain their complete appearance. Their advanced material editor remains available; introducing overlapping PRODUCT_COLOR mappings is rejected rather than changing legacy appearance implicitly.

## Price / SKU

The Item owns base price/currency and an optional product code. “Same price for all colors” resolves all colors to the base price; disabling it permits nullable per-color price/currency overrides. A missing override inherits. An omitted color SKU inherits the displayed Item code without reserving a duplicate SKU. Explicit SKUs remain case-insensitively unique. Price sorting/filtering uses the effective default-color price/currency; search includes explicit color SKUs and Item code. Existing currency minor-unit conversion is retained.

## Database

Migration `0012_fixed_product_colors.sql` is additive:

- Item: nullable positive `width`, `depth`, `height`, nullable `base_price_minor`, currency and `same_price_for_all_colors`.
- Color: nullable, uniquely indexed `color_sku`, `price_override_minor`, `currency_override`.
- Stable existing Item/Variant IDs, material tables and project references.

Old Variant dimensions are deprecated server-owned mirrors; `model_asset_id` is cleared after safe migration and always null in new writes. Old non-null SKU/price/currency columns are compatibility storage only; new writes use an internal UUID-based SKU key. Public commercial SKU is `color_sku`; resolved price reads Item/override columns, never stale compatibility prices. Destructive column/table removal is deferred.

## Legacy Compatibility

The migration compares every pair of an Item's Variants, including inactive ones. Different dimensions or effective GLBs abort the entire migration transaction with `ITEM_REQUIRES_SPLIT_BY_SIZE`, leaving every configuration intact. Compatible records share the Item geometry, retain IDs/materials/appearances, and preserve differing commercial prices/currencies as overrides. Incompatible data must be deliberately split into separate Items before retry; migration does not guess how to rewrite project references.

For this workspace, the one existing draft and its original GLB are preserved. No legacy colors or project Item placements existed. Real dimensions remain unset because there were no Variant dimensions to migrate; the old technical calibration is retained until the admin confirms actual measurements. All original columns across the 22 non-migration tables compare equal to the backup, the GLB SHA-256 is unchanged, and foreign-key checking returns no violations. The database contains all 12 migrations.

## Admin UI

Product information → 3D model → Dimensions & orientation → Colors → Price & SKU → Thumbnail → Review & publish. Normal setup requires no material index dropdown, slot creation, roughness/metalness configuration, or repeated prices. Advanced retains inspection, slot/binding editing and texture-channel/material tools. Catalog grids remain thumbnail-first and paginated; no eager GLB requests.

## User Catalog

Product detail shows fixed Item dimensions once, a Color selector, effective SKU/price, preview and Add to Project. Brand/category/search/pagination and server-enforced ADMIN/USER permissions are retained. Users cannot manage the catalog.

## Workspace

Move, rotate, select a color, or remove the instance. Footprints derive only from Item width/depth; switching color preserves position, rotation, floor/Space assignment, geometry and dimensions. Existing project ownership and current-state persistence are unchanged.

## Tests

`pnpm test`: 18 files, 145 tests passed. Includes safe migration with existing references/appearance, atomic refusal of different sizes and inactive different models, legacy price preservation, independent physical sizes, base-price/SKU inheritance and explicit uniqueness, no-stretch API/domain checks, UV rejection with solid-color fallback, two-region recoloring with a fixed third, instance isolation, storage, ownership, and architectural regressions.

## E2E

The complete admin/user catalog workflow passed in Chromium: one model, real-dimension confirmation, actual clicks selecting two regions, Blue/White/Green creation including a texture, base price and optional SKU, publication, thumbnail-only grid, user placement, 45-degree rotation, save/reload, fixed footprint, and Blue → White. Assertions verify one model asset, no extra GLB request on color switching, unchanged transform/catalog, and no resize controls.

The saved browser artifact is [workspace after switching to White](images/items-simplified-workspace.png).

### Verification commands

| Command           | Result                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm test`       | 18 test files, 145 tests passed (56.99 s).                                                          |
| `pnpm typecheck`  | Passed across all workspace packages, tools, and tests; repeated successfully by the final build.   |
| `pnpm lint`       | Passed.                                                                                             |
| `pnpm build`      | Passed; Vite built 2,598 modules. Existing large-chunk warnings remain for the main and 3D bundles. |
| `pnpm db:migrate` | Passed on a database copy and the workspace database; all 12 migrations applied.                    |
| `pnpm test:e2e`   | 21 tests passed (3.0 min), including the complete admin/user color workflow.                        |

After the final correction preserving inactive status in the historical `defaultColor` response, the affected catalog API integration test passed again, as did server typecheck and ESLint for the changed files.

Commands used the repository-local pnpm executable with `node_modules/.bin` on PATH. HTTP/browser tests ran with local-listener permission, and Chromium was installed under `/tmp/habitat-playwright`. No external catalog data or production test fixtures were created. Browser logs retain the existing Drei/Three Clock deprecation warning.

## Limitations

Product families and multiple sizes within an Item are intentionally absent. Different geometry requires a separate Item. GLB support remains static, self-contained, uncompressed glTF 2 triangles; animation, skins, morph targets and extension-dependent/compressed models remain unsupported. Material targets require a safely identifiable material/node pair; overlapping advanced mappings must be resolved explicitly. Existing used bindings remain locked. Deprecated database mirrors and response aliases remain for compatibility and can be removed in a later migration.

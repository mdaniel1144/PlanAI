# ITEMS catalog: pre-implementation audit and proposed architecture

Historical audit: its prerequisites were subsequently approved and implemented. See [Items delivery](ITEMS_CATALOG.md) for current behavior and verification.

Date: 2026-10-03. Status: **audit complete; implementation stopped under section 112 of the supplied specification.** Everything labeled proposed below is a design, not implemented functionality.

## Stop conditions and scope

The current application has no active file-storage service or controlled asset-delivery route. Migration 0005 deliberately removed the old upload subsystem. `STORAGE_PATH` now locates retired files for cleanup, rather than configuring a usable asset service. This triggers the instruction to stop if “storage cannot safely serve catalog assets.”

There is also no application GLB loader, material-isolation implementation, or model-unit calibration to audit. The installed Three.js libraries provide a basis for implementing these, but their availability is not evidence of verified per-instance behavior. No GLB was found in the project or available attachment files. Missing assets are not evidence that future uploads are unsuitable; a reference product asset is not inherently required to build a generic catalog.

Current persistence has no catalog-reference type. Adding an unknown field to a scene is unsafe: existing Zod schemas omit it, and the repository writes only known entity kinds. The proposed persistence extension below must be verified before placement is enabled.

ADMIN/USER authorization **is** enforced server-side. However, project access is intentionally shared by all authenticated users. There is no project owner or membership field. The requested “their own project workspace” behavior requires an explicit ownership migration and authorization change; catalog role checks alone would not provide it.

No production code, migrations, catalog UI, or workspace behavior was changed in this pass. The prerequisite work described here must be authorized after reviewing these findings, because section 112 explicitly requires stopping before implementation.

## Current asset system

- [Runtime paths](../server/src/runtime-paths.ts) resolve database and former storage locations relative to the workspace.
- [Application startup](../server/src/app.ts) calls `removeRetiredFiles`; it has JSON APIs but no binary upload or asset-serving handler.
- [Migration 0005](../server/migrations/0005_current_scene_only.sql) drops `source_artifacts` and `derived_artifacts`, preserving a temporary cleanup queue. [Cleanup](../server/src/infrastructure/database/remove-retired-files.ts) deletes only recorded retired files.
- No current asset table, GLB/template registry, texture library, or model inspection service exists. The earlier [window template audit](WINDOW_TEMPLATE_AUDIT.md) also describes a proposed, unimplemented asset pipeline.

Introduce a new catalog namespace under `storage/items/{itemId}/{models,textures,thumbnails}/`, separate from legacy cleanup. Use generated immutable file keys and asset-ID delivery. Preserve uploaded GLB bytes; SQLite holds metadata only. Temporary upload, validation, atomic file promotion, database registration, and failed-registration cleanup must have defined failure behavior. Never accept a storage path supplied by the browser or return an absolute server path.

## Current project 3D system

[SceneView](../frontend/src/features/viewer3d/SceneView.tsx) uses React Three Fiber, procedural geometry, orbit controls, lighting, and a shared centered group. Windows are procedural assemblies. The editor lazily imports the complete 3D viewer, but there is no GLB cache or loader.

The coordinate mapping is plan `(x, y)` to Three.js `(x, elevation, -y)`. Place catalog models inside the same group as architectural geometry. Resolve vertical placement from a referenced Space's `floorElevation`; use Floor elevation for explicit floor placement. Unknown Space elevation must remain an actionable validation error rather than silently becoming zero.

[Editor](../frontend/src/features/editor/Editor.tsx), `useDrawing`, and in-memory history share a scene draft across 2D and 3D. [SceneService](../server/src/modules/scenes/service.ts) validates saves with revision conflict detection. [Repository.writeScene](../server/src/infrastructure/database/repository.ts) deletes and recreates dependent current-state rows inside a transaction. There are no persisted scene snapshots to extend.

## Target Item model

An Item owns shared product information, Category, Brand, default Variant, base model, thumbnail, assets, and semantic material slots. A Variant owns SKU, price in integer minor units, currency, confirmed metre dimensions, color/finish, status, and optional geometry override. Even a simple product has one Variant.

Blue, White, and Green variants reuse the base model unless geometry changes. Material definitions and texture assets are referenced, not embedded in every Variant or project instance. A project instance stores only catalog IDs, Space/Floor location, and its transform.

No existing SKU or money convention was found. Proposed SKU scope is globally unique, case-insensitive, normalized by trimming, including inactive variants. Proposed price storage is a nonnegative JavaScript-safe integer with a validated supported ISO currency code; convert decimal UI input using that currency's minor-unit exponent. Do not assume every currency has two decimal places or compare mixed currencies as equivalent amounts.

## Material and texture strategy

Cache the parsed source model by immutable asset ID. Each render instance gets an independent hierarchy and cloned editable materials, including material arrays; skinned hierarchies require a skeleton-safe clone. Geometry and textures can be shared while immutable. Dispose only instance-owned resources. Variant switching on the same asset must not reload or mutate the cached source GLB.

Slots have stable semantic IDs such as FABRIC and LEGS. Per-model bindings use GLB material indices and optional node indices, with names shown only as labels. Validate each binding against the inspected asset. Alternative geometry requires its own bindings to the same semantic slots.

At render time a Variant's slot override applies a MaterialDefinition or a simple base color. Material definitions support base color, roughness, metalness, opacity, and base-color/normal/roughness texture references. Never rewrite the source GLB to produce colors.

Upload PNG/JPEG/WebP to registered texture assets. Validate signature, actual decode, byte size, and decoded resolution; reject SVG and unsupported payloads. Inspect UV availability per affected primitive and reject textured mappings that lack usable coordinates. Preserve texture orientation/color-space handling consistently with the selected loader. Load textures only for visible instances or the selected preview. Cache immutable textures by asset ID.

## GLB inspection and dimensions

Validate `.glb` extension plus GLB header, version, total length, chunk structure, JSON parseability, buffer/accessor bounds, supported features, and configured resource limits. Reject external resource URIs so uploaded files cannot initiate arbitrary remote or filesystem fetches. Bound file size, nodes, primitives, materials, embedded image dimensions, and decoded geometry complexity. Unsupported compression/extensions need explicit rejection until supported.

Record scene/node hierarchy, mesh/material identities, texture references, UV coverage, bounds, animations, and counts. These are technical inspection results, not commercial product dimensions.

Proposed normalization uses an admin-confirmed uniform metres-per-model-unit factor, orientation, and anchor. Show measured bounds and ask the admin to confirm real width/depth/height. Validate proportional agreement within a documented tolerance; never silently apply nonuniform stretching. A materially different-sized Variant requires another calibrated GLB. Arbitrary instance scale is absent in this phase. Animated or deformed geometry whose static bounds cannot be validated remains unpublished with a structured issue.

## Database delta — proposed exact tables and columns

Use additive ordered migration `0010_items_catalog.sql`, registered in `database.ts`. Preserve historical migrations and existing architectural rows. All IDs are TEXT; timestamps are UTC TEXT; flags and minor prices are INTEGER; physical dimensions/transforms are REAL. Required values are NOT NULL unless marked optional. Structured inspection fields are validated JSON TEXT. No binary, history, version, or restore table is proposed.

| Table                        | Proposed columns                                                                                                                                                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`                 | `id` PK, `name`, `slug` unique, `parent_id` optional FK categories, `active`, `created_at`, `updated_at`                                                                                                                                                                                                                               |
| `brands`                     | `id` PK, `name` unique case-insensitively, `active`, `created_at`, `updated_at`                                                                                                                                                                                                                                                        |
| `items`                      | `id` PK, `name`, `description`, `item_code` optional, `brand_id` FK brands, `category_id` FK categories, `model_asset_id` optional, `thumbnail_asset_id` optional, `default_variant_id` optional, `status`, `created_at`, `updated_at`                                                                                                 |
| `item_assets`                | `id` PK, `item_id` FK items, `type`, `storage_key` unique, `mime_type`, `file_name`, `file_size`, `sha256`, `inspection_json` optional, `metres_per_unit` optional, `rotation_json` optional, `anchor_json` optional, `source_width` optional, `source_depth` optional, `source_height` optional, `dimensions_confirmed`, `created_at` |
| `item_variants`              | `id` PK, `item_id` FK items, `name`, `sku` unique case-insensitively, `price_minor`, `currency`, `width`, `depth`, `height`, `color` optional, `finish` optional, `model_asset_id` optional, `thumbnail_asset_id` optional, `status`, `created_at`, `updated_at`                                                                       |
| `item_material_slots`        | `id` PK, `item_id` FK items, `key`, `name`                                                                                                                                                                                                                                                                                             |
| `item_material_bindings`     | `id` PK, `item_id`, `slot_id`, `model_asset_id`, `material_index`, `node_index` optional                                                                                                                                                                                                                                               |
| `materials`                  | `id` PK, `name`, `base_color`, `roughness`, `metalness`, `opacity`, `active`, `created_at`, `updated_at`                                                                                                                                                                                                                               |
| `material_textures`          | `material_id` FK materials, `channel`, `asset_id` FK item_assets; PK (`material_id`, `channel`)                                                                                                                                                                                                                                        |
| `variant_material_overrides` | `item_id`, `variant_id`, `slot_id`, `material_id` optional FK materials, `base_color` optional; PK (`variant_id`, `slot_id`)                                                                                                                                                                                                           |
| `project_item_instances`     | `id` PK, `state_id`, `floor_id`, `space_id` optional, `item_id`, `variant_id`, `position_x`, `position_y`, `rotation`                                                                                                                                                                                                                  |

Constraints and indexes:

- Add unique (`item_id`, `id`) keys to assets, variants, and slots. Composite FKs ensure item default/override assets, default Variant, bindings, and overrides belong to their Item. Use deferred FKs for the Item/default-Variant cycle. Enforce correct asset types in authoritative service validation.
- `items.default_variant_id` is the sole persisted default designation. Derive `isDefault` in responses. Creating the first Variant sets it transactionally. Publication requires an active default, confirmed valid geometry, dimensions, and a thumbnail. Default reassignment and deactivation are atomic.
- CHECK status in ACTIVE/INACTIVE; positive dimensions; safe nonnegative integer prices; material numeric ranges [0,1]; nonnegative binding indices; valid asset type/size; texture channels BASE_COLOR/NORMAL/ROUGHNESS. Overrides must specify exactly one of `material_id` or `base_color`.
- Unique (`item_id`, `key`) on slots; prohibit overlapping bindings on the same model/material/node target during validation. Prevent category hierarchy cycles in the service.
- Instances use composite (`item_id`, `variant_id`) FK to variants, (`state_id`, `floor_id`) FK to floors, and nullable (`state_id`, `floor_id`, `space_id`) FK to entities. Validate that a Space reference is a room. Project/scene ownership derives from `scene_state → home_scenes → projects`; return `projectId` in contracts without a redundant writable column.
- Referenced catalog records use restrictive deletion. Deactivation is the supported management operation. Add indexes for item status/category/brand, variant item/price/currency, instance item/variant usage, and floor lookup.
- Seed the requested initial category names without fixing the schema to an enum.

Brand logos and a general cross-item asset library are optional later features. Reuse uploaded item textures across that item's Variants now; materials may be reused through references without copying bytes.

Project ownership needs a separate proposed migration `0011_project_ownership.sql`: add nullable `projects.owner_user_id REFERENCES users(id)` and an owner index. Require a current owner on new non-demo projects. Existing projects have no recorded creator, so ownership cannot be safely inferred. Preserve them pending explicit administrator assignment; the legacy/demo access policy must be settled before enabling private project access. Do not backfill arbitrary users or silently retain global USER access while describing projects as private.

## Server delta and authorization

Add catalog repository/service/routes, asset storage/validation, model inspection, and project-instance validation. Put runtime schemas in `packages/domain` and request/response contracts in `packages/contracts`; keep Node and Three.js dependencies out of shared packages.

| Access                | Proposed APIs                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Authenticated catalog | `GET /api/items`, `GET /api/items/:itemId`, `GET /api/item-categories`, `GET /api/item-brands`                                   |
| Authenticated assets  | `GET /api/item-assets/:assetId`; check active catalog visibility or authorized persisted project use                             |
| ADMIN items           | `GET/POST /api/admin/items`, `GET/PATCH /api/admin/items/:itemId`                                                                |
| ADMIN assets          | `POST /api/admin/items/:itemId/model`, `/textures`, `/thumbnails`; `GET /api/admin/items/:itemId/model-inspection`               |
| ADMIN configuration   | create/update Variant, semantic slot, model binding, material, category, and brand resources below `/api/admin`                  |
| Project workspace     | existing current-scene GET/PUT extended with Item references; authorized project catalog-resolution read for persisted instances |

Reuse [requireAuthenticatedUser and requireAdmin](../server/src/modules/auth/middleware.ts). [Auth routes](../server/src/modules/auth/routes.ts) already mount an `/admin` role boundary before later APIs. Give the new admin router its own explicit guard as well. Authorize uploads before consuming binary bodies. Preserve CSRF checks. A valid USER request to an admin catalog/upload endpoint must return 403 regardless of payload.

Read routes must not return inactive variants, assets, or configuration through otherwise active items. Existing authorized project instances may still resolve their inactive Item/Variant and assets so deactivation does not erase furniture. Validate that this exception is tied to persisted project use, not arbitrary IDs supplied by a client.

Project ownership checks must cover list/read, scene/floor reads, saves, corrections, verification, clarification access, and referenced asset resolution—not just the new placement endpoint.

Return structured validation codes from the specification, with conflict errors for in-use geometry changes and stale scene writes. Unknown JSON fields, inconsistent IDs, nonfinite transforms, invalid dimensions, unsupported mappings, and invalid money are rejected server-side.

## Catalog update policy

Instances reference current definitions. Name, description, price, and appearance changes propagate. While used by any persisted project instance, reject changing the effective model, model calibration, Variant dimensions, or slot bindings for that instance. Return usage count and a clear conflict; creating a separate Item/Variant is the alternative. Shared asset calibration is locked if any consuming instance uses it.

Deactivation prevents new placements but preserves existing rendering and transform edits. An unchanged inactive reference must survive scene save. Copying it into a new instance, or changing an existing instance to a different inactive Variant, must be rejected. Removing a project instance affects only that instance. No catalog hard-delete workflow is needed.

Run usage checks and catalog writes in the same transaction as relevant validation; scene saves must recheck catalog validity. This prevents stale dialogs from bypassing geometry locks.

## Admin frontend and model inspector

Extend the existing `AdminRoute` with `/admin/items` and `/admin/items/:itemId`, and add Items to admin navigation. Use thumbnail cards with name, brand/category, default price/SKU, and status. Support text, category, brand, status, price/currency filters, sorting, and pagination.

Create inactive drafts through stages: information → GLB upload → inspection/calibration → semantic slots → materials and Variants → thumbnail/preview → review and activate. Offer inline category/brand management. The inspector shows hierarchy, meshes, material indices/names, UV problems, source bounds, animations, and validation issues. Preview offers orbit, zoom, reset camera, neutral light, and live Variant changes. Display usage count without exposing private project identities.

## User catalog and workspace integration

Add an editor “Add Item” drawer with a read-only catalog, filters, paginated thumbnail grid, details, lazy 3D preview, and active Variant selection. Admin controls never appear there. Choosing Add to Project enters ghost placement on the active floor. Click commits; Escape cancels.

Add `Floor.itemInstances` with an empty legacy default. Keep catalog definitions outside the canonical scene; resolve distinct Item/Variant IDs into a client cache. Extend editor selection/properties, undo/redo, delete, rotation, translation, save, reload, export, and validation deliberately rather than pretending furniture is an existing architectural entity kind.

Persistence must delete instance rows before the current repository deletes floors/entities/state, and recreate instances after their parents, all inside the same scene transaction. Return them on scene reconstruction. Add `items-v1` writer capability checks analogous to existing window capability guards: stale clients must receive a conflict instead of silently dropping furniture. Tests must cover both regular save and correction/verification paths.

For 2D, draw the rotated width-by-depth footprint with orientation and selection affordances. For 3D, use the calibrated GLB plus independent Variant materials at the instance transform and derived elevation. No scaling handles or scale fields. Variant changes affecting footprint require placement validation and a clear dimensions-change message; the central catalog remains untouched.

## Performance

Use server pagination with a bounded page size and deterministic tie-breaker. Search product name and SKU without parsing models. Filter/sort with database queries and indexes; choose a currency when comparing prices. Cards request thumbnails only. Resolve project definitions in batches. Load GLBs only for detail, placement, or required workspace instances, and textures only for selected materials. Preserve immutable asset identities and bounded cache lifetime; private asset delivery must not use publicly shared cache policies.

## Verification and required follow-up

Read-only inspection of `data/habitat.sqlite` found these 12 tables: `clarifications`, `entities`, `entity_evidence`, `evidence`, `floors`, `home_scenes`, `migrations`, `projects`, `scene_state`, `space_boundary_edges`, `user_sessions`, `users`. `PRAGMA foreign_key_check` returned no violations. `projects` has no owner column. No catalog or active asset table exists.

Targeted baseline verification: **3 files passed, 25 tests passed** (`tests/auth.test.ts`, `tests/migrations.test.ts`, `tests/integration.test.ts`; 26.99 seconds). `pnpm` was absent from PATH, so the installed CLI was invoked as `node node_modules/pnpm/bin/pnpm.cjs exec vitest run tests/auth.test.ts tests/migrations.test.ts tests/integration.test.ts`. The initial restricted run could not start Supertest listeners (14 failed, 11 passed); the authorized rerun outside that restriction passed completely. These tests establish existing authentication, migrations, and persistence behavior, not catalog functionality.

The full test suite, typecheck, lint, build, migration command, and browser E2E were not run for this documentation-only stop report. No catalog browser flow or GLB render exists to verify yet. The workspace database was inspected read-only; no migration was applied to it.

After prerequisite authorization, verify storage traversal/URI/size/decode rejection, exact original GLB byte round-trip and restart, USER write/upload 403, ADMIN success, database FKs, one-model-many-colors, simultaneous material isolation, UV failures, money round-trip, pagination/filtering, inactive visibility, in-use update rejection, transaction races, Space elevation, stale writer rejection, placement/rotation/save/reload/Variant switching, and cross-user project denial. Exercise both specified ADMIN and USER browser journeys and inspect browser console/network requests for failures and unintended GLB preloading.

Run the full requested `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm db:migrate`, and `pnpm test:e2e` after implementation. Perform migration validation on a populated disposable copy before applying any migration to workspace data.

Deliberately deferred: procurement, suppliers, checkout, stock, history, model optimization, arbitrary stretching, full collision/physics, category-specific schema engines, and automatic thumbnail generation. These deferrals do not substitute for the blocked storage, GLB-safety, persistence, or ownership prerequisites.

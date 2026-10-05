# ITEMS catalog delivery

> Historical infrastructure delivery. The fixed-product and color-only model in [Items simplification](ITEMS_SIMPLIFICATION.md) supersedes the Variant geometry, calibration, pricing, and admin workflow sections below. Storage, GLB validation, authorization, and ownership remain in use.

The catalog is implemented in the existing Habitat application. The earlier [audit](ITEMS_CATALOG_AUDIT.md) is historical; its missing prerequisites were explicitly approved for implementation. No supplier, procurement, checkout, stock, or history system was added.

## Project Ownership

New API-created projects belong to the authenticated creator, including projects created by administrators. USER accounts can list, read, and edit only their own projects. ADMIN accounts can access all projects. Legacy ownerless projects remain ownerless and ADMIN-only; migration never guesses an owner.

`PATCH /api/admin/projects/:projectId/owner` with `{ "ownerUserId": "<active-user-id>" }` assigns/reassigns ownership. It requires an administrator, the normal session cookie, and `X-Habitat-Request: 1`. The target account must exist and be ACTIVE. This phase supplies the controlled API, without an ownership-management screen.

Project guards resolve ownership for project, scene, floor, correction, verification, clarification, batch catalog resolution, and current-scene save routes. Inactive-asset delivery checks actual persisted project ownership in SQLite.

## Asset Storage

`CatalogAssetStorage` provides put/read/remove/exists and startup recovery. Storage keys are generated server-side as `items/{itemId}/{models|textures|thumbnails}/{uuid}` under `STORAGE_PATH` (default `storage`). Original filenames are display metadata only. No browser contract contains a storage key or absolute path.

Uploads require ADMIN before the raw body parser. The API accepts bounded `application/octet-stream` bytes with `X-File-Name`. Validation and inspection happen before registration. Within a database transaction, files are written to a temporary file, atomically renamed to an immutable final key, and registered; registration failure removes the promoted file. Startup removes unregistered catalog files left by interrupted uploads. The deployment uses one API process per SQLite/storage root; simultaneous independent storage-recovery processes are not supported.

GLBs, textures, and thumbnails live outside SQLite. Assets are delivered through authenticated `GET /api/item-assets/:assetId` with verified visibility, correct MIME, `nosniff`, and private/no-store headers. Active catalog content is readable by authenticated users. Inactive content is readable only by administrators or owners of projects with persisted references to the relevant Variant. Unused alternate assets are not made public by an active Item.

## GLB Validation

Only self-contained GLB 2 static triangle models are accepted. Validation checks extension, magic, version, declared length, chunk alignment/bounds, JSON structure, buffer/accessor ranges, attribute counts, index ranges, finite coordinates, node references/cycles, resource limits, embedded image decoding, and actual POSITION bounds. All external/data URIs and extension-dependent payloads are rejected. Original bytes are retained without optimization or re-export.

Inspection records hierarchy, mesh/material indices and names, primitive UV availability, texture references, actual transformed scene bounds/dimensions, and warnings. Animation metadata is empty for the supported static-model subset. Unsupported animations, skins, morph targets, sparse accessors, compressed extensions, and nontriangle primitives produce explicit upload errors rather than being silently altered.

## Model Units

Admin confirms `metresPerModelUnit` and orientation (0/90/180/270 degrees). Rendering uses uniform unit conversion and a bottom-center anchor. The calibrated bounds must match each Variant's width/depth/height within 1%, with a 2 mm absolute tolerance. Zero or unsupported dimensions fail validation. There is no arbitrary instance scale or whole-model nonuniform stretching. Different geometry uses a separately uploaded/calibrated model and its own bindings.

## Catalog Database

Migration `0010_items_catalog.sql` adds these current-state tables:

| Table                        | Fields and relationships                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categories`                 | id, unique case-insensitive name, active                                                                                                                         |
| `brands`                     | id, unique case-insensitive name, active                                                                                                                         |
| `items`                      | id, name, description, item_code, brand_id, category_id, base_model_asset_id, thumbnail_asset_id, default_variant_id, status, created_at, updated_at             |
| `item_assets`                | id, item_id, type, immutable storage_key, mime_type, file_name, file_size, sha256, inspection_json, calibration_json, created_at                                 |
| `item_variants`              | id, item_id, name, unique case-insensitive SKU, price_minor, currency, width/depth/height, color, finish, model_asset_id, thumbnail_asset_id, status, timestamps |
| `item_material_slots`        | id, item_id, unique per-Item semantic name                                                                                                                       |
| `item_material_bindings`     | id, item_id, slot_id, model_asset_id, material_index, nullable node_index                                                                                        |
| `item_materials`             | id, item_id, name, base_color, roughness, metalness, opacity, timestamps                                                                                         |
| `item_material_textures`     | item_id, material_id, channel, asset_id; primary key material/channel                                                                                            |
| `variant_material_overrides` | item_id, variant_id, slot_id, material_id or base_color; primary key Variant/slot                                                                                |
| `project_item_instances`     | id, state_id, floor_id, nullable space_id, item_id, variant_id, position_x, position_y, rotation                                                                 |

Composite foreign keys enforce same-Item assets, materials, slots, overrides, and Variants. Instances reference a Variant belonging to their Item and a Floor/Space in the same current scene. Server validation additionally enforces asset type, Space kind, binding existence/uniqueness, and resource applicability. Status, positive dimensions, integer safe money, material ranges, texture channels, and override exclusivity have SQL CHECK constraints. Referenced catalog records use restrictive deletion; management deactivates rather than deletes.

`items.default_variant_id` is the sole default designation. First-Variant/default creation and default reassignment run transactionally. Disabling an active default selects another active Variant or rejects the change if publication would be invalid.

Indexes support catalog filtering, currency/price sorting, instance usage, and floor lookup. Migration `0011_project_ownership.sql` then adds nullable `projects.owner_user_id REFERENCES users(id)` plus an owner index. Historical migrations were not changed.

Both migrations were first applied to a populated disposable database copy. Every existing row in 11 data tables survived unchanged; the only added existing-table field was null ownership. The workspace database was then backed up and migrated. Its 23 tables pass `foreign_key_check`, and pre/post row hashes confirm preservation of all 11 original data tables.

## Items

Items hold shared product information and normalized Brand/Category relations. DRAFT, ACTIVE, and INACTIVE states are supported. Thirteen initial categories are seeded as rows, not a fixed product enum. Admin APIs create/update brands and categories; the information stage includes inline creation.

Publication requires a calibrated usable model, matching Variant dimensions, an active default Variant, and a cover image. Unused drafts may remain incomplete. Structured errors explain invalid references, dimensions, bindings, money, duplicate SKUs, and in-use edits.

## Variants

Variants carry commercial SKUs, configuration dimensions, integer minor-unit price, ISO currency, appearance metadata, overrides, and optional alternate model/thumbnail. SKU uniqueness is global and case-insensitive, including inactive records. UI decimal prices are converted through integer arithmetic using the currency's minor-unit exponent: `6900.50 ILS → 690050`; JPY accepts no fractional minor digits.

## Materials

Materials are Item-scoped. Semantic slots refer to inspected material indices and optional node indices; names are labels. Variants reference an Item Material or a simple base color. Material definitions support roughness, metalness, opacity, and base color. Cross-Item configuration is rejected by service validation and composite foreign keys.

## Textures

PNG/JPEG/WebP textures are validated by signature-aware actual decoding with Sharp, byte and resolution limits, and single-image restrictions. SVG and unsupported image payloads are rejected. BASE_COLOR, NORMAL, and ROUGHNESS channels reuse immutable stored images. Textured overrides are rejected when a mapped primitive lacks UV coordinates. Base-color textures use sRGB; data textures remain linear, with GLB-compatible UV orientation.

## One Model / Many Colors

A centralized GLTFLoader cache uses immutable asset IDs. Geometry is shared. Each preview/placement gets its own skeleton-safe hierarchy clone, transforms, and editable material copies, including material arrays. Runtime overrides never rewrite source GLB bytes. Textures are loaded only as required and cached by asset/channel. The cache limits retained sources to 16 and textures to 64; per-instance leases keep evicted resources alive until the last user releases them. Session changes clear the caches.

The real-browser proof loads one complete binary fixture once, renders Blue and White with the runtime override code, then changes Blue to Green and verifies White remains unchanged. Unit tests additionally verify material-array isolation and source-material preservation. The admin flow creates a real fabric texture and Blue/White Variants with one model asset, and the integration flow checks Blue/White/Green with one model asset.

## Admin Items

`/admin/items` provides thumbnail cards, name/SKU search, category/brand/status filters, currency-aware price ordering, name/newest/brand/category/status sorting, and bounded server pagination. No GLB loads on the grid.

`/admin/items/:itemId` provides eight stages: information, model upload, inspection/calibration, semantic mapping, materials/textures, Variants, thumbnail, review/publication. It supports metadata, model, calibration, Material, draft mapping, Variant, price/SKU, and publication edits. The inspector shows actual hierarchy, material indices, UV coverage, source dimensions, and an interactive orbit/zoom/reset preview. Usage is a count only; private project details are not exposed.

## User Catalog

The editor's Add Item action opens an accessible read-only drawer with search, filters, pagination, details, dimensions, price/SKU, Variant selection, and lazy 3D preview. Only ACTIVE Items/Variants are selectable. Admin controls remain protected by `AdminRoute` and are absent from this flow.

## Project Instances

Scene drafts store only instance IDs, catalog Item/Variant references, Floor/Space reference, X/Y position, and rotation. Catalog definitions and binary models are not copied into scenes. One batch endpoint resolves the distinct product definitions required by the project.

Instances participate in the existing current-state save transaction. Dependent instance rows are removed before parent replacement and restored after floors/entities. The `items-v1` writer capability prevents old clients from silently removing furniture. Saves, corrections, and verification preserve references. Local undo/redo uses the existing draft history; deleting an instance leaves the catalog intact.

Deactivation hides products from new placement but preserves existing persisted rendering and transform edits. Copying a disabled reference to a new instance is rejected. Used model identity, calibration, physical dimensions, and bindings are locked with `ITEM_IN_USE`; metadata, price, and appearance updates propagate. Variant switching only changes the instance and requires an active Variant of the same Item. Footprint changes produce a notice.

## 2D

Placement uses a moving ghost, click confirmation, and Escape cancellation. Instances show a rotated width-by-depth footprint, orientation marker, name, and selection. Properties provide position, rotation, surface, Variant, and removal controls. Exact mesh contours and collision detection are deferred.

## 3D

The calibrated original GLB renders at `(positionX, surfaceElevation, -positionY)` with vertical-axis rotation and the chosen Variant appearance. The surface derives from the referenced Space, or the explicitly selected Floor. Missing elevation is rejected instead of becoming zero. No scale handles or scale field exist.

## Performance

Grid responses contain metadata and a default Variant; inspection/material arrays are omitted from grid results. Models and textures are lazy, with shared geometry and per-instance material ownership. Query sorting is deterministic and page size is bounded to 60. Prices are compared only within a selected currency. Batch project resolution avoids per-instance HTTP requests.

## Security

Authentication wraps catalog reads. Every catalog mutation and upload checks ADMIN on the server. Project access checks enforce owner or ADMIN throughout the existing editor APIs. Immutable generated file paths, traversal checks, symlink rejection, explicit image/GLB validation, and controlled delivery separate storage from browser input. No GLB binary column or user-supplied storage path exists.

## Tests

Checkpoint A: 8 ownership/persistence tests passed, followed by 18 authentication/migration tests. Checkpoint B: storage/delivery/restart/rollback test passed. Checkpoint C: 3 inspection/cache/calibration/money tests and the real-browser render proof passed. Catalog management and instance tests passed before workspace integration.

Full-suite and final command results are recorded at the end of this report after final verification. These are executed results, not assertions inferred from implementation.

## E2E

The new combined browser journey logs in as ADMIN, creates Sofa 123 and its Brand, uploads/inspects/calibrates a GLB, maps FABRIC/LEGS, creates Blue/White materials and Variants, adds a thumbnail, publishes, searches by SKU, and checks that the grid does not fetch the GLB. It then logs in as USER, creates an owned project, previews/selects a Variant, places a ghost, rotates, saves/reloads, views the GLB, and switches to White. It compares the central catalog definition before/after and checks for browser page errors.

The standalone WebGL proof also verifies the rendered dimensions after uniform calibration and pixel differences for the simultaneous color Variants. Existing architectural and authentication browser tests are included in the full regression run.

## Limitations

The supported model subset is static, self-contained, uncompressed triangle GLB 2; unsupported features are explicitly rejected. Orientation calibration offers quarter turns and a bottom-center anchor, not arbitrary exporter-axis authoring. There is no automatic model optimizer, thumbnail renderer, precise mesh footprint, furniture collision/physics engine, parametric resizing, global material library, supplier workflow, commerce workflow, or catalog history.

The current storage deployment assumes one API process per storage root. The source cache retains at most 16 entries and the texture cache at most 64 entries. Evicted resources remain alive while instances reference them; session changes clear the caches. Brand/category edits and project ownership reassignment are available through admin APIs; the UI supplies inline taxonomy creation. Large 3D bundle warnings and the underlying Three.js Clock deprecation are recorded separately from application errors.

## Final verification results

Verified on 2026-10-03:

| Command/check                                  | Executed result                                                                                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`                                    | **16 files, 139 tests passed** after the final resource-cleanup fix (78.28 s).                                                                                                                                              |
| `pnpm typecheck`                               | Passed across all workspace packages, tooling, and tests; also rerun by the final build.                                                                                                                                    |
| `pnpm lint`                                    | Passed after final changes.                                                                                                                                                                                                 |
| `pnpm build`                                   | Passed, with the existing large-chunk warning for the lazy 3D bundle.                                                                                                                                                       |
| `pnpm db:migrate`                              | Passed: all 11 migrations applied.                                                                                                                                                                                          |
| `pnpm test:e2e`                                | **21 tests passed** (3.5 minutes), covering catalog, ownership-dependent editor access, authentication, architectural drawing, Spaces, windows, and responsive layout.                                                      |
| Browser rerun after the last cache cleanup fix | **2 affected journeys passed**: full ADMIN/USER catalog flow and real WebGL isolation/calibration proof (1.1 minutes).                                                                                                      |
| Populated disposable migration copy            | All original rows in 11 data tables preserved; ownership added as null; foreign keys valid.                                                                                                                                 |
| Workspace migration                            | Protected backup created first; all original data-table row hashes preserved; 23 tables, 13 seed categories, no foreign-key violations.                                                                                     |
| Storage                                        | Files outside SQLite, generated immutable keys, original-byte preservation, controlled ID delivery, restart access, traversal rejection, and failed-registration compensation verified.                                     |
| Catalog security                               | USER admin write/upload rejection; cross-user project denial; inactive-asset access tied to persisted ownership; duplicate SKU, dimension mismatch, cross-Item references, missing UVs, and used-geometry changes rejected. |
| Browser network/console                        | Catalog grid did not request the GLB. Full catalog flow reported no page errors. The underlying Three.js dependency emits a Clock deprecation warning.                                                                      |

The first full browser attempt exposed shared test-session invalidation; the catalog test was isolated and the complete 21-test rerun passed. A new cache test exposed duplicate cleanup of geometry shared by two meshes; cleanup now deduplicates geometry/materials and the final complete unit suite plus affected browser journeys pass.

The environment did not expose `pnpm` on PATH, so commands used the installed `node node_modules/pnpm/bin/pnpm.cjs` entry point, adding `node_modules/.bin` to PATH for nested scripts. Chromium was installed at `/tmp/habitat-playwright`; browser runs used `PLAYWRIGHT_BROWSERS_PATH`. Test fixtures are confined to disposable databases; the workspace catalog remains empty, ready for admin-created products.

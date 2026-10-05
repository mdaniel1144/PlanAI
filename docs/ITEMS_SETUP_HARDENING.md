# Post-GLB setup hardening

This records the earlier setup phase. [Automatic thumbnails](ITEMS_AUTO_THUMBNAILS.md) supersedes its manual Thumbnail step: the current wizard has seven steps and generates the product image from the calibrated GLB.

## Pre-fix audit — 2026-10-04

**Root cause:** Review rendered a default-color select with no options on a valid draft, then serialized `FormData.get("defaultVariantId")` through `String(value ?? "")`. Clicking Save publication sent an empty reference.

**Reproduced payload:** `{"defaultVariantId":"","status":"DRAFT"}`. On a disposable copy of the real draft, `CatalogService.saveItem` produced Zod `invalid_format`, path `defaultVariantId`, message `Invalid UUID`; the API formatter returned `Default color: Invalid UUID`.

**Contract expectation:** `defaultVariantId` is either an existing same-Item active color ID or `null`. Null is valid for a draft without colors. Existing API field names and IDs will remain compatible.

**Database state:** One draft (`a3aa02bd-a493-40c5-a417-d517a195af94`), GLB `modern__sofa.glb`, zero colors/bindings, null default, null Item dimensions. The asset has the old scale 80/orientation 90 calibration; it does not constitute confirmed real dimensions. Foreign-key checking returns no violations. Backup: `/tmp/habitat-before-setup-hardening.sqlite`.

**Other risks:** Optional model/thumbnail/default/texture/material references and SKU conversions are scattered. Advanced binding node inputs convert separately. Review and pricing use uncontrolled defaults; color preview can retain removed selections. Wizard position resets on reload. Model upload and Item attachment use separate requests. No central publication-readiness result exists. First-color logic can choose an inactive color; removing the last draft color can retain an inactive default. Duplicate mutation clicks lack a synchronous guard.

**Implementation policy:** Preserve draft validity and all existing data. Introduce shared normalization and server readiness, transactional upload/attachment and safe replacement of unused models, atomic default repair and color creation, eight resumable steps, friendly structured/field errors, and no arbitrary scale or geometry overrides. Published Items reject removal of their final active color; draft/inactive Items may have none, with null default. Normal color setup requires at least one selected color surface and active color; this policy is explicit in the UI. Existing advanced mappings remain compatible.

## Root Cause

The original generic message hid a contract mismatch. An empty default-color select submitted `defaultVariantId: ""` while saving a valid incomplete draft. The server expected a UUID or null. The reproduced API error was `Default color: Invalid UUID`. The empty select has been removed, and empty optional references now normalize to null on both sides.

## Systemic Reference Fix

Shared form helpers in `frontend/src/features/items/forms.ts` handle optional IDs, trimmed strings, finite optional numbers, and currency-aware money. Catalog request serialization normalizes optional model, thumbnail, texture, material, default-color, SKU, and product-code values. Required references remain required. Shared domain schemas also normalize empty optional references for direct API clients.

Malformed nonempty IDs still fail validation. Valid-looking IDs must refer to the same product and correct asset/material type. No fabricated references, relaxed foreign keys, or replacement IDs are used for persisted data. PATCH preserves omitted fields, including existing SKU, status, price overrides, and appearance mappings.

## Draft State

A draft may lack a model, real dimensions, colors, default color, price, or thumbnail. Draft saves enforce structural integrity while publication enforces completeness. Replacing an unused model returns the product to DRAFT and retains its colors, materials, SKU, and pricing. Read-only color dimension projections may be null while the Item dimensions are unconfirmed; clients still cannot write color geometry.

The live draft and original GLB remain unchanged. Its old scale-80 calibration is retained until real measurements are confirmed and does not mark the Dimensions step complete.

## Setup Readiness

`CatalogService.readiness` is the shared server source for `productInfoComplete`, `modelUploaded`, `modelValid`, `dimensionsConfirmed`, `colorTargetsConfigured`, `hasActiveColor`, `defaultColorValid`, `basePriceValid`, `thumbnailReady`, `publishable`, `blockingIssues`, and `nextRequiredStep`. Each response also includes ordered step completion/accessibility. Readiness checks active appearance mappings and UV compatibility.

The eight steps are Information, Model, Dimensions, Color parts, Available colors, Pricing, Thumbnail, and Review. The editor consumes this result for progress, resume, navigation, and publication. Public list/detail reads also exclude unready products, including inconsistent legacy ACTIVE records.

## GLB Upload

`POST /api/admin/items/:id/model` validates the GLB, writes immutable bytes, registers metadata, and attaches the canonical model in one database transaction. The frontend fetches the resulting Item; it no longer performs a second attachment PATCH. Repeating normal upload returns a friendly existing-model error.

`PUT /api/admin/items/:id/model` explicitly replaces an unused model. Replacement clears obsolete bindings and confirmed Item dimensions, retains appearance/commercial records, and requires setup confirmation again. Used models return `ITEM_IN_USE`. Old bytes are removed only after commit; failed registration or attachment removes new bytes and rolls back database changes. Startup recovery handles files left by an interrupted process.

## Calibration

The form uses real centimetres and 0/90/180/270-degree orientation. Detected width/depth swap immediately with orientation, and the preview reflects orientation. Confirm requires valid proportional dimensions and explicit measurement confirmation. The server independently checks positive finite dimensions and a uniform scale; no stretching is introduced. Saved dimensions and orientation appear in a confirmation summary. Technical scale remains under Advanced.

## Color Targets

Color parts have their own step. Actual model clicks toggle highlighted regions; multiple regions, individual removal, and Reset selection are supported. Confirmation validates node/material/Item references transactionally. Selected regions without UVs are identified early, with solid color presented as the available alternative. Existing advanced mappings remain accessible.

The supported publication policy requires at least one mapped surface and an active appearance color. Unselected parts retain authored materials. No separate no-color publication mode was introduced.

## Colors

Color cards show name, status, effective price, inheritance, and default status. Solid colors and uploaded texture images preview against the fixed shared GLB. SKU and price overrides are optional. Editing a textured color retains its selected texture; PATCH updates preserve unrelated appearance fields. Deactivation retains IDs and historical project references.

Creating the first ACTIVE color assigns it as default in the same transaction. An INACTIVE color never becomes the automatic default. Duplicate new color names within a product are rejected before committing additional appearance records. Rendering continues to use cached source geometry with isolated material clones.

## Default Color

The admin selects a default through a named color card's **Set as Default** action and badge. There is no empty ID dropdown. A default must be an active same-Item color. Deactivating it selects the first remaining active color deterministically by creation time and ID. A draft or inactive product with no active colors has a null default. Deactivating the final active color of a published product is rejected and rolled back. Clearing a default when active colors exist repairs it to a valid active choice.

## Pricing / SKU

Base and override prices convert to integer minor units before requests. Blank optional prices remain null, and zero is a valid price. Invalid numbers, negative prices, unsupported currencies, and excessive fractional precision produce useful errors. Grouped values such as `6,900.50` are supported. Empty SKU/code values become null; explicit SKU uniqueness remains enforced. Colors inherit base price and product code unless an override applies. Editing a color exposes and preserves its override currency instead of silently changing it to the Item currency.

## Thumbnail

Thumbnail upload registers and attaches the image transactionally, then reloads authoritative product data. Image-content and filename validation remain in place. A product needs a valid default-color thumbnail or product cover before publication; the checklist explains the missing cover.

## Publish

Review shows readiness for each step, named colors/default, dimensions, price, and actionable blockers. Publish is disabled until the server result is ready. Direct API publication independently calls the same readiness validator and returns `ITEM_NOT_PUBLISHABLE` with structured blockers. Draft-save and hide actions send status alone, so stale form defaults cannot overwrite current references.

## Resume / Reload

Reload fetches current product/setup data and opens the first unfinished step; completed products reopen Review. Completed accessible steps remain editable. Navigation checks unsaved changes and provides an explicit discard action. Mutation responses refresh authoritative data, and a generation guard prevents an older initial fetch from overwriting newer mutation results.

A synchronous mutation guard plus disabled controls prevents duplicate clicks before React rerenders. Browser regression assertions count exactly one calibration request, three color creation requests, and one publish request despite paired clicks.

## Transactions

Model registration/attachment, thumbnail attachment, model replacement, calibration, target mappings, color/material/override creation, default repair, and publication validation use transaction boundaries. Tests inject database failures to prove uploaded files and metadata roll back together and old model/mapping state survives failed replacement. No schema migration or destructive data conversion was needed; all 12 existing migrations remain applied.

## Error UX

The API retains structured codes, fields, issues, and publication blockers. The editor shows friendly summaries and field messages for product information and pricing, specific dimension guidance, texture/UV alternatives, and publication blockers linked to steps. UUID-format failures are translated to selection guidance. Draft saves no longer pass through a publication-only default requirement. Saving, saved, texture-uploaded, draft-saved, and published states are visible.

## Tests

| Command           | Final result                                        |
| ----------------- | --------------------------------------------------- |
| `pnpm test`       | 155 tests passed across 19 files                    |
| `pnpm typecheck`  | Passed for all workspace packages, tools, and tests |
| `pnpm lint`       | Passed                                              |
| `pnpm build`      | Passed; production assets generated                 |
| `pnpm db:migrate` | All 12 migrations applied; foreign keys enabled     |
| `pnpm test:e2e`   | 22 tests passed in 3.3 minutes                      |

The 10 setup regression tests also passed after the final currency-preservation assertion; the expanded test TypeScript check passed. Tests cover empty/malformed/foreign references, individual publication prerequisites, first/inactive/default/last-color transitions, omitted PATCH fields, duplicate color creation, upload/attachment rollback, replacement rollback, calibration reset, and money normalization. API integration checks cover UV rejection, same-Item references, in-use replacement refusal, authorization, and historical project restoration.

Non-blocking output: Vite reports the existing large bundle-size warning; the 3D dependency reports `THREE.Clock` deprecation warnings. No browser exceptions or unexpected catalog API failures occurred. The catalog E2E deliberately submits one invalid product name and asserts that sole expected HTTP 400.

Read-only preservation comparison: all rows and columns in Items, assets, colors, slots, bindings, materials, material textures, overrides, and project Item instances match the pre-change backup. Foreign-key violations: **0**. Original GLB SHA-256: `457abe4175f00599e74d2b25963ba7e2d8cce237cf945a80003f0bf928521301`.

Local verification artifacts: [existing-draft copy preview](../test-results/existing-draft-copy.png), [copy workflow results](../test-results/existing-draft-copy.json), and [preservation comparison](../test-results/items-setup-preservation.json). These test artifacts describe the disposable copy, not publication of the live draft.

## E2E

The catalog browser regression covers create-draft validation, atomic upload, reload after each setup step, orientation feedback, visual selection of two actual regions, solid/texture colors, automatic and explicit defaults, optional SKU and inherited price, thumbnail, review, publication, and reload. The user then browses metadata without eager GLB downloads, places the Item, rotates, saves/reloads, and changes color without resizing or reloading the GLB. API request counts and browser errors are asserted.

A second browser regression verifies that editing a EUR-priced color on an ILS product retains its currency, price, SKU, and ID, then replaces the unused model through the UI and verifies one canonical GLB, retained colors, cleared dimensions/mappings, DRAFT status, and reload at Dimensions.

The existing draft was also opened and completed in a disposable database/storage copy with its actual GLB. It resumed at Dimensions, accepted the formerly failing empty-reference draft payload, and completed through publication. Source-matching test measurements were used only on the copy; the actual product's real dimensions remain unconfirmed. The copy had no catalog request failures, browser exceptions, or foreign-key violations. The expected unauthenticated `/auth/me` 401 occurs before login. The live Item row and original GLB SHA-256 were verified unchanged.

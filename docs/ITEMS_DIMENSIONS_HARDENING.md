# Item dimensions, calibration, and display units

## Pre-fix audit — 2026-10-05

Backup: `/tmp/habitat-before-dimensions-hardening.sqlite`, created with SQLite's backup API before changes.

- **Raw GLB bounds meaning:** geometry positions after GLB node transforms, in model units. The sofa's stored raw dimensions are width 2, depth 0.7836620287528853, height 0.6017000281644043. Inspection bounds remain raw and immutable.
- **Current orientation meaning:** the saved 90° rotates the product around Y. Its oriented width/depth are 0.7836620287528853 and 2 model units. The previous “Detected model bounds” label actually displayed these oriented dimensions. This is independent of the camera.
- **Current UI unit bug:** dimensions inputs multiply canonical metres by 100 and submissions divide by 100; the confirmed summary does the same conversion. These conversions are consistent. The ambiguity is presenting oriented raw values beside centimetre inputs and treating a proportions-only confirmation as verified physical dimensions, without provenance or a plausibility warning.
- **Existing sofa database values:** Item `a3aa02bd-a493-40c5-a417-d517a195af94` is ACTIVE (not currently a draft), with width 0.007837, depth 0.02, height 0.006017. Its calibration is 0.010000161355975886 metres/model-unit, orientation 90°, technical `confirmed: true`. Thus its saved physical size really is 0.7837 × 2 × 0.6017 cm. No project instances reference it.
- **Other existing product:** the lamp is ACTIVE, with 0.357226 × 0.355269 × 1.5086590000000002 metres, orientation 90°, scale approximately 0.01. Its raw GLB is about 35.53 × 35.72 × 150.87 model units. This demonstrates why one universal ×100 data correction would be unsafe.
- **Current API unit:** calibration `width/depth/height` are metres. The UI posts canonical values after dividing centimetre input by 100. `uniformCalibration` independently calculates three oriented ratios and their mean, rejecting deviations over 1%.
- **Current DB unit:** `items.width/depth/height` are metres; deprecated variant dimensions mirror them. No centimetre columns exist.
- **Current render unit:** 3D uses one scalar metres/model-unit, a Y rotation, and bottom-center anchoring. The 2D footprint reads Item width/depth in metres. Camera parameters do not enter either size calculation.
- **Data versus presentation:** the saved sofa size is implausibly small, but there is no evidence of a pipeline conversion bug or enough evidence to infer its correct physical measurements. Its verified real size is unknown. Stop conditions concerning unknown storage/render units, ambiguous axis mapping, or demonstrated conversion corruption were not found. No stored dimension will be multiplied/divided automatically.

## Proposed fix

Centralize length conversion/formatting, persist a CM/M preference on the authenticated user (CM default), and apply it to dimension displays and editors. Separate immutable raw bounds, product orientation, and real dimensions. Require dimension source, ADMIN verification, category-warning acknowledgment where needed, and actual rendered-bounds proof. Recalculate uniform calibration and validate the proof independently on the server. Legacy confirmations become unverified and existing ACTIVE products return to DRAFT pending evidence; preserve their dimensions, calibration, models, colors, covers, and prices. Model or dimension changes invalidate verification. Test real GLB world bounds, camera independence, settings persistence, canonical payloads, migration safety, and the complete confirmation/publication flow.

## Unit Architecture

Canonical database columns, API payloads, 2D geometry, and 3D world coordinates remain metres. `units.ts` owns CM/M conversion, parsing, input formatting, and human-readable formatting. Conversion does not round canonical values; display formatting removes floating-point noise. `DimensionsMeters`, `ModelUnitDimensions`, and `WorldBoundsMeters` distinguish semantics in names and contracts. Areas remain explicitly labelled m²; this setting controls lengths.

## User Settings

`/settings/display` exposes Display & Units to both roles. `PATCH /api/account/display` updates only the authenticated user's `users.length_display_unit`; default CM. The enum is server-validated with `ITEM_DISPLAY_UNIT_INVALID`. The current-user response carries the preference. Context refresh and cross-tab storage notifications update mounted forms; the preference itself is persisted in SQLite, not localStorage. Length inputs convert at the UI boundary, while rotation, ratios, track counts, zoom, and prices remain unchanged.

## Raw GLB Bounds

Inspection retains immutable geometry bounds after GLB node transforms in model units. The primary Raw GLB bounds line always shows the original width/depth/height, explicitly labelled model units. A separate oriented-axis line updates immediately when the product orientation changes.

## Orientation

0°/180° preserve horizontal axis sizes; 90°/270° exchange width and depth. Height is the Y axis. Product orientation is a Y rotation within the calibrated model group. Camera orbit, zoom, and viewport size affect projection only. They never enter calibration or stored measurements.

## Real Dimensions

The admin enters real width/depth/height using their display preference. Inputs retain canonical numeric state so a live preference switch cannot reinterpret 2 metres as 2 centimetres. Clearing an input immediately invalidates pending confirmation. Confirmation requires a selected source, an explicit verification checkbox, valid proportions, actual rendered bounds, and acknowledgment of any unusual-size warning. Technical scale values are not primary inputs.

## Calibration

Each real dimension is divided by its oriented model dimension. One arithmetic mean of the three ratios becomes `metresPerModelUnit`. The existing policy rejects any ratio deviating more than 1% from the mean. Main preview, workspace model, thumbnail renderer, and measurement path use the same `calibratedModel()` factory: bottom-center anchor, one scalar, and product Y rotation. No project-instance scale or axis-specific scale is introduced.

## Proportion Validation

`MODEL_DIMENSION_PROPORTION_MISMATCH` blocks inconsistent proportions. The server recalculates the mean and ratios independently; frontend success text is not trusted. Proportion agreement is described as a shape check, never proof of real-world accuracy.

## Plausibility Validation

`categoryDimensionGuidance` centralizes broad metre ranges for sofa, chair, table, bed, cabinet, wardrobe, and door categories. Outside-range dimensions produce `ITEM_DIMENSIONS_IMPLAUSIBLE`. If ×100 or ÷100 would enter the broad range, the UI offers a non-authoritative unit interpretation to check against a verified source. It never applies that factor automatically. Unusual products can be explicitly acknowledged and verified; acknowledgment is persisted. Categories without defined guidance do not get invented limits.

## Dimension Source

`items.dimension_verification_json` records `dimensionsVerified`, one of four source enums, actor ID, timestamp, canonical dimension snapshot, model ID/hash, orientation, uniform scale, measured world bounds, category at verification, and unusual-size acknowledgment. The server derives actor/timestamp/source-model identity and requires a current active ADMIN. Item writes cannot inject verification metadata. Model replacement clears it; dimension/model/calibration/category changes invalidate its match. A changed category requires verification under that category’s plausibility guidance. API output exposes UNCONFIRMED, VERIFIED, or INVALID.

## Rendered Dimension Verification

The browser loads the actual GLB, clones an owned instance, applies the shared transform, and measures precise Three.js world bounds before confirmation. It releases the clone afterward. Publication requires the persisted proof to match the current source and canonical dimensions. The server independently calculates expected calibrated bounds from inspected geometry and compares both canonical dimensions and the supplied rendered proof. Size tolerance is 1.1% (covering the inverse of the 1% ratio policy), minimum absolute 0.0000001 m; bottom-center anchor tolerance is 0.000001 m. Incorrect bounds produce `MODEL_RENDERED_DIMENSION_MISMATCH`. This is a geometry consistency check, not proof that a manufacturer specification is truthful.

## Existing Draft

The audited products were ACTIVE, including the tiny sofa. Migration 0013 does not convert any numeric measurement, modify GLBs, or infer provenance. It adds the preference and verification fields and moves legacy ACTIVE products to DRAFT for real-world verification. Existing dimensions, technical calibrations, colors, thumbnails, prices, and project references are retained. Their final thumbnails remain pending until verification succeeds. No replacement sofa measurements or verification source have been invented.

## 2D

The Item footprint still reads canonical Item width/depth, and project instances retain position, rotation, and color only. Labels, architectural length controls, elevations, grid spacing, and measurements use the shared preference. Changing units does not rewrite scenes or instance geometry.

## 3D

The canonical model receives the same uniform transform in preview, workspace, thumbnail, and dimension proof. Preview diagnostics expose actual measured bounds for browser regression checks. Camera changes leave those world dimensions and saved calibration unchanged.

## Tests

- `pnpm test`: **172 passed across 22 files**.
- `pnpm typecheck`: passed (also included in the production build).
- `pnpm lint`: passed.
- `pnpm build`: passed; Vite reports its existing large-main-chunk advisory.
- `pnpm db:migrate`: **all 13 migrations applied**, foreign keys enabled.
- `pnpm test:e2e`: **26 passed (5.5 minutes)**. After the final empty-input, negative-offset, and form-layout corrections, both focused dimensions browser tests passed again (**2 passed, 33.6 seconds**).
- The original sofa was opened in a disposable copy of the backed-up database and storage: DRAFT, UNCONFIRMED, original tiny metre values preserved, no invented source, unusual-size warning visible, confirmation disabled, thumbnail pending, zero thumbnail uploads, and no browser errors.

After migration, a read-only comparison with the pre-change backup confirmed every pre-existing table column unchanged except the intended legacy Item status change. Both products retain their exact dimensions and null verification; both are DRAFT. All asset bytes match stored SHA-256 hashes, all user preferences default to CM, and `PRAGMA foreign_key_check` returns no violations.

## E2E

The added browser workflow checks raw versus oriented bounds, the tiny-sofa unit warning, centimetre input and canonical metre network payload, provenance confirmation, automatic thumbnail, reload, cross-tab CM→M switching, actual preview bounds, and camera orbit/zoom/viewport independence. Clearing a real dimension disables confirmation and resets the verification checkbox. A workspace workflow checks CM/M wall lengths, negative offsets through live unit changes, no-op focus and unit changes preserving scene geometry, and a 900 cm edit saving as a 9 m wall. Existing catalog, placement, window, and architectural workflows remain part of the full suite.

The complete calibration flow uses a controlled GLB fixture with known test dimensions. The actual existing sofa is checked separately without fabricating real measurements or provenance; its physical size must be confirmed from a real product source before publication.

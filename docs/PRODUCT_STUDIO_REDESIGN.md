# Architectural Product Studio redesign

## Audit and implementation plan

The pre-change application already had reliable seven-step readiness, admin permissions, model inspection, physical-size verification, color mapping, thumbnail generation, and placement. The UI presented these capabilities as a horizontal button row above long forms. The generated cover occupied a large separate panel; model previews appeared after controls. Color options used large cards, the project catalog covered most of the workspace, and technical validation codes appeared in primary dimension messages. Existing browser workflows covered publication, thumbnails, material isolation, unit preferences, and placement.

The redesign preserves those contracts and prioritizes: a persistent setup rail; a dominant shared viewer beside an inspector; compact dimension and color controls; a publication summary; visual catalog cards; a focused placement drawer; and consistent display settings. New presentation tokens are scoped to these surfaces. Server architecture, schema, calibration, ownership, and publication policy remain unchanged. The only server edit expands the lightweight card projection to include all finish metadata; the visual audit exposed that the old default-only projection produced incorrect color counts. GLB and material payloads remain excluded from cards.

## Design Direction

Warm off-white canvas, localized white inspectors, charcoal text, muted supporting labels, restrained green selection, thin dividers, small corner radii, and typography-led hierarchy. The original Habitat identity remains. Actual GLB models are the primary visual; no stock imagery or artificial product renders were introduced.

## Information Architecture

`ProductStudioShell` separates product identity and saved state, a persistent setup rail, and the working area. `StudioSplit` provides the shared viewer/inspector layout. The existing seven readiness stages remain intact, including separate color-part selection and available colors. Automatic Product image remains a compact persistent rail section rather than another required form.

## Item Setup

Numbered navigation shows the current step, completed state, and blocked prerequisites. Readiness expands to a checklist. Existing save, discard, busy, and step-access safeguards remain. Product information uses grouped fields and a secondary taxonomy disclosure. Model upload supports file selection and drag/drop; after upload the object replaces the empty state, with replacement and inspection in the inspector.

## 3D Viewer

The shared viewer includes Fit, Front, Side, Top, and Reset camera controls, orbit/zoom guidance, neutral studio lighting, subtle contact shadows, and automatic framing. Camera controls operate on the camera and bounds controller; they do not alter physical calibration. The existing clone/material isolation and shared uniform model transform remain in use. Fullscreen was optional in the brief and is not added.

## Dimensions

Real-product inputs, validation, and verification are distinct inspector sections. Orientation uses four keyboard-accessible radio segments and rotates the preview even before all real dimensions are entered. Width/depth interpretation updates immediately. Units are attached to compact inputs. Compact formatting affects presentation only; canonical values remain unchanged until edited. Raw bounds sit beneath the viewer as supporting information. Technical codes and provenance remain available under Advanced calibration. All source, unusual-size acknowledgment, verification, and rendered-bounds gates remain enforced.

## Colors

Clicking model regions still highlights/toggles selection; selected parts are named, removable, and explicitly confirmed. Available finishes use compact swatch rows with preview, default, edit, and activation actions. Add/Edit color opens a focused native dialog styled as a side sheet, with live model preview, texture selection/upload, SKU, inherited pricing, and optional overrides. Closing discards local edits and restores focus to the opener. Advanced appearance stays collapsed.

## Pricing

Product price, currency, product code, and shared-color pricing remain explicit. Color overrides are separated from base pricing and explain inheritance. Existing minor-unit parsing and override currencies are preserved.

## Thumbnail

The compact Product image panel retains automatic generation, status, retry, and regeneration, and uses the existing verified-dimensions prerequisite. Images are not regenerated for camera movements or display-unit changes. Existing covers remain visible during replacement/failure.

## Review

The full-size 3D product stays visible next to dimensions, available finishes, base price, default color, readiness, and publication actions. Blocking issues link to their setup stage. Publication still uses server readiness rather than visual completion alone.

## Admin Catalog

Image-led cards present name, brand, fixed dimensions, price, visual finishes, and quiet status. Search/category/brand/status/sort retain their existing API behavior. Grid is the default; no additional list view was needed. Empty results and first-product states have purposeful copy; initial loading uses card skeletons.

## User Catalog

`/items` provides a protected collection entry in the application rail. Product detail pairs a large viewer with dimensions, price, description, and interactive finish swatches. It exposes no admin management controls. A Choose a project action leads to the user’s projects; actual placement remains initiated inside the selected project workspace.

## Workspace Catalog

Add Item opens a side drawer so the plan remains in view. Search, product selection, preview, and Add to Project retain the existing flow: drawer closes, a fixed-size ghost follows the cursor, click places, and Escape cancels. Properties show fixed dimensions, color, position, rotation, and removal without scale controls. The audit also found and corrected a presentation bug where the CM preference divided rotation input by 100; degrees now remain degrees in both preferences. The plan caption now follows the selected length unit.

## Design System

`Studio.css` defines a shared `--studio-*` token layer for colors, surface, border, radius, and control height. Reusable components include ProductStudioShell, StudioSplit, InspectorSection, ColorSwatch, ProductCard, ColorSheet, and the unit-aware LengthInput. Colors and Pricing were extracted from the large admin page; form utilities and step constants are separate modules.

## Responsive

Desktop uses a 196–210px rail, flexible viewer, and 310–370px inspector. At smaller widths the rail becomes a compact horizontal navigator; narrow screens stack viewer and inspector. Additional overflow checks passed at 800px and 390px for the setup, dimensions, color, and review screens. Catalog cards and the workspace drawer adapt without changing placement geometry.

## Accessibility

Visible focus styles, labelled inputs, native radio segments, semantic buttons, current-step state, named dialogs, and keyboard camera actions are retained or added. The color dialog supports Escape, focus containment, and explicit focus restoration. The workspace catalog is also a native dialog, retaining Escape, focus containment, and return to its opener. Reduced-motion preference disables presentation transitions. Muted text and green accents use readable neutral surfaces; status is also conveyed with text/icons.

## Tests

- `pnpm test`: **172 tests passed across 22 files** (60.61 seconds).
- `pnpm typecheck`: passed, including all packages, frontend, server, tooling, and test types.
- `pnpm lint`: passed.
- `pnpm build`: passed. Vite retains its large-chunk advisory; the main bundle is about 636 kB before gzip. The final CSS-only viewport adjustment was followed by another successful production bundle build.
- `pnpm test:e2e`: **26 browser tests passed (4.8 minutes)**.

Behavioral assertions retain duplicate-submit protection, GLB/material isolation, source verification, publication gates, thumbnail freshness, ownership, placement, and persistence. Updated selectors use the orientation radio segments, finish swatches, and visible taxonomy disclosure. Additional assertions cover all camera presets preserving world dimensions, 45° rotation while displaying CM, accurate three-color cards without GLB requests, and unit-aware plan captions.

Read-only inspection confirms the two production products remain DRAFT with their original dimensions and null verification. All five stored asset hashes match, and SQLite reports no foreign-key violations. No catalog records were rewritten for this redesign.

## Screenshots

Visual review uses a disposable database/storage copy with the existing sofa and lamp GLBs. Display names and verification values in that copy are controlled review fixtures, not real-product claims or edits to production data. Screenshots are captured at 1440×1024; layout checks also cover 1280px and 1920px. No horizontal overflow was found at the requested desktop widths. The viewer remains wider than the inspector at laptop/desktop sizes; controls and longer verification content are reachable through normal vertical scrolling. Focus returns to the color-sheet opener after Escape. No browser page errors occurred in the visual review.

- [Product information](screenshots/product-studio/01-product.png)
- [Dimensions and orientation](screenshots/product-studio/02-dimensions.png)
- [Color-part selection](screenshots/product-studio/03-color-parts.png)
- [Available colors](screenshots/product-studio/04-colors.png)
- [Review and publication](screenshots/product-studio/05-review.png)
- [Add-color side sheet](screenshots/product-studio/06-color-sheet.png)
- [Admin library](screenshots/product-studio/07-library.png)
- [User product detail](screenshots/product-studio/08-product-detail.png)
- [Workspace catalog drawer](screenshots/product-studio/09-workspace-catalog.png)
- [Display and units](screenshots/product-studio/10-display-units.png)

Additional desktop visual checks: [1280px dimensions](screenshots/product-studio/dimensions-1280.png) and [1920px dimensions](screenshots/product-studio/dimensions-1920.png).

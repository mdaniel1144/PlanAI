# Window template system: pre-implementation audit

Status: **source audit complete; GLB audit blocked; implementation not started.**

This report addresses sections 85–87 of the supplied Final Window Template System specification. The attachment contains only `Pasted text.txt`. No GLB, glTF, or Blender asset was found in the project or available attachment directories. The requested Double Casement asset must be supplied before its capabilities can be established. Proposed changes below are not implemented behavior.

## Current window system

Windows are hosted openings with a wall ID, along-wall position, width, and vertical dimensions. New windows persist canonical world `bottomElevation` and `topElevation`; sill height is a contextual editing value. The existing reference calculation uses a known adjacent Space elevation, or explicitly falls back to a known Floor elevation. Unknown elevations must remain unknown.

The optional assembly stores profile, panels, glazing, shutter, and screen data. There is no template reference or capability registry. Add Window currently opens a generic placement card: hover previews a candidate, click locks it, and confirmation creates the window. Properties allow generic type and panel edits.

Sources: [domain schema](../packages/domain/src/index.ts), [assembly schema](../packages/domain/src/window-assembly.ts), [placement geometry](../packages/geometry/src/window-placement.ts), [drawing workflow](../frontend/src/features/editor/useDrawing.tsx), [properties](../frontend/src/features/editor/WindowFields.tsx).

## Current 3D rendering

[WindowAssembly](../frontend/src/features/viewer3d/WindowAssembly.tsx) renders procedural boxes for frame, sash, divider, and glass parts. There is no window GLB loader, semantic node resolver, asset cache, or opening preview.

Its local coordinates already use X for width, Y for height, and Z for depth. The instance origin is the opening start at its bottom elevation, rotated along the host wall. Wall cutouts are independently computed from canonical opening intervals and elevations in [geometry](../packages/geometry/src/core.ts). This separation can be retained when replacing the template instance renderer.

## Uploaded GLB audit

**Not executable: the reference asset is missing.** No claim about its actual structure or supported capabilities is possible yet.

| Required inspection | Current result |
| --- | --- |
| Scene hierarchy, mesh names, unique node addresses | Unverified |
| Two separately addressable sashes | Unverified |
| Separate frame, profile, and glass material slots | Unverified |
| Authored hinge pivots, axes, and closed transforms | Unverified |
| Units, orientation, anchor, and bounding dimensions | Unverified |
| Safe semantic resizing and supported size ranges | Unverified |
| Per-instance material and transform isolation | Unverified |

After receiving the asset, record its actual hierarchy and measurements, then build explicit mappings. Do not register a usable template from guessed names, dimensions, pivots, or capabilities. A missing asset is not evidence that the asset itself is unsuitable.

## Template model

Proposed: a server-backed current-state `WindowTemplate` registry with ID, name, description, GLB asset ID, thumbnail asset ID, status, manifest, and explicit capabilities. Start with `FIXED_STRUCTURE`; reserve `PARAMETRIC_STRUCTURE` for a future implementation.

The first template is intended to represent two-leaf Double Casement construction, subject to inspection. Each instance stores `templateId`, canonical placement and dimensions, and validated overrides. Template topology is resolved from the registry rather than duplicated as independently editable instance panels. No supplier or commerce fields are introduced.

## Manifest model

Proposed: strict runtime schemas describing asset normalization, root/frame/sash/glass roles, material slots, immutable structural topology, resize rules, and optional opening transforms. Resolve each supplied node selector uniquely against the actual asset; reject missing nodes, ambiguous selectors, and conflicting role mappings.

Normalize into the existing opening-start/bottom anchor convention using explicit asset rotation, unit scale, and offset. Unit normalization is distinct from instance resizing. Preserve the original GLB file.

## Capability model

Proposed: explicit booleans for width/height resizing, profile color/finish/geometry, glass type/appearance, leaf count, panel topology, operation type, hinge topology, opening preview, shutter, and screen. Unproven capabilities remain disabled.

Double Casement structure remains fixed. Changing structural type requires deliberate template replacement, with a warning identifying incompatible values that will be discarded. Preserve only compatible values. Strict server validation must reject forbidden payloads such as `leafCount: 3`; hiding controls or silently stripping unknown fields is insufficient.

## Resize strategy

Use `LOCKED_SIZE` unless the asset audit proves `SEMANTIC_FRAME_RESIZE` safe. Semantic resizing needs explicit fixed profile regions, stretch regions, anchors, sash layout constraints, and verified minimum/maximum dimensions. Never resize architectural profiles by nonuniformly scaling the complete GLB. Reject unsupported dimensions on the server as well as in the editor.

No numeric default sizes or resize limits can be assigned before measuring the asset.

## Material override strategy

Cache the parsed source asset, then clone the node hierarchy and editable materials for each instance, including material arrays. Share geometry/textures only while immutable; copy geometry before any instance-specific deformation. Dispose only resources owned by the instance.

Keep architectural glass specification separate from visual glass appearance. Apply profile color/finish and glass appearance only to manifest-mapped slots. Prove isolation with two simultaneous instances before enabling controls. Selection highlighting must preserve the configured materials.

## Opening/pivot strategy

Opening preview is temporary editor state keyed by instance ID. It does not alter saved canonical opening dimensions or wall cutouts. Transform only mapped sash groups around inspected authored pivots or explicit manifest pivots, retaining their closed transforms for restoration. Do not infer hinges from bounding boxes. Preview remains unavailable until these mappings are verified.

## Database delta

Proposed: an additive SQLite table for current template metadata and manifest JSON; asset binaries remain outside SQLite. Existing entity persistence serializes non-scalar fields into `entities.data_json`, so `templateId` and validated overrides can use that path after domain/schema updates. Verify canonical round trips before relying on this compatibility path.

Retain the existing current-state scene persistence and revision conflict checks. Do not add template history, snapshots, or restoration features. No database migration was run for this audit.

Source: [entity records](../server/src/infrastructure/database/entity-records.ts).

## Asset storage delta

The current server has storage configuration but no window-template GLB registry or serving pipeline. Add a dedicated template asset namespace and asset-ID-based serving, separate from retired upload cleanup. Store original GLBs and thumbnails as files. Validate registered paths and serve only registered assets.

Missing or corrupt assets produce a structured error and an explicit unavailable/error state. Do not silently substitute another template or a production-looking procedural model.

## Server delta

Add template discovery and asset delivery, plus registration validation that checks both manifests and actual GLB semantics. Extend [window validation](../server/src/modules/scenes/windows.ts) to enforce template availability, allowed overrides, immutable topology, and dimension ranges alongside existing host, vertical-range, wall-boundary, and collision checks.

Use strict schemas and structured issues including `WINDOW_TEMPLATE_NOT_FOUND`, `WINDOW_TEMPLATE_INVALID`, `WINDOW_TEMPLATE_ASSET_FAILED`, `WINDOW_TEMPLATE_NODE_MISSING`, `WINDOW_TEMPLATE_CAPABILITY_VIOLATION`, `WINDOW_TEMPLATE_WIDTH_OUT_OF_RANGE`, `WINDOW_TEMPLATE_HEIGHT_OUT_OF_RANGE`, `WINDOW_OUTSIDE_HOST_WALL`, `WINDOW_INVALID_VERTICAL_RANGE`, and `WINDOW_GLB_RESIZE_UNSUPPORTED`. Apply validation on every scene mutation path before persistence.

## Frontend delta

1. Add Window opens a visual template picker with thumbnail, name, structural description, and availability.
2. Choosing a template starts a wall-aligned ghost using its verified default size. Preserve existing sill-reference behavior and explicit world-elevation entry when no reference is known.
3. Clicking a valid candidate creates and selects the instance in the local scene; Save persists it. This replaces the current separate placement confirmation for template windows.
4. Properties expose only supported controls. Keep sill placement available; show height/width as editable only when supported. Structural changes use template replacement.
5. Derive 2D symbols from semantic template topology. Render 3D instances from the GLB, with isolated materials and optional temporary opening preview.

Keep invalid placement visible and explain its reason. Asset failures must leave the editor usable and preserve canonical opening data.

## Backward compatibility

Windows without `templateId` retain their existing data, validation, and legacy rendering. Do not silently assign a template or reinterpret legacy assembly settings. Any conversion must be explicit and validate compatibility.

Extend the existing writer-capability protection with a template capability so older clients cannot strip template references or overrides on save. Keep the current world-elevation convention and independent wall cutout geometry.

## Verification and next required input

Implementation verification must cover strict capability rejection, asset mappings, pivot behavior, safe resizing, material isolation, 2D/3D alignment, host movement, cutouts, legacy loading, canonical save/reload, and the complete picker-to-save workflow. Then run the requested tests, typecheck, lint, build, migration checks, browser tests, and runtime console inspection.

This change adds only this report; application verification has not been rerun and does not establish any new template functionality. **Next input: the reference Double Casement `.glb`, or an accessible local path to it.** An existing semantic manifest may also be supplied. Asset-dependent implementation is paused because the required audit cannot yet establish the safety of sash mappings, pivots, material overrides, or resizing.

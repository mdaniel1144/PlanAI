# Architecture

`frontend` owns React and the 2D/3D viewers. `server` owns Express APIs, authoritative validation, current-state persistence, and migrations. `packages/domain` defines architectural schemas and authority/elevation rules; `packages/contracts` defines runtime API requests; `packages/geometry` implements deterministic geometry and Space topology. Shared packages do not import frontend/server code or browser/Node APIs.

A local HomeScene draft feeds both viewers. Save uses `revision` / `expectedRevision` exclusively as concurrency tokens. `schemaVersion` describes serialization compatibility. SQLite holds one current state per scene; successful writes replace it atomically. There are no architectural history or restore APIs, domain types, tables, or pages. Local undo/redo is editor memory, not persisted architectural history.

## Current database

| Table                | Purpose                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| projects             | Project metadata                                                                        |
| home_scenes          | Project ownership and current revision                                                  |
| scene_state          | One current canonical state per scene                                                   |
| floors               | Current floor ownership, base elevations and scale                                      |
| entities             | Current architectural entities and typed scalar properties                              |
| space_boundary_edges | Ordered current Space perimeter edges, with real wall references or explicit OPEN edges |
| evidence             | Current provenance data                                                                 |
| entity_evidence      | Current entity/evidence associations                                                    |
| clarifications       | Current clarification questions and answers                                             |
| migrations           | Schema migration journal                                                                |

The unique `one_state_per_scene` index prevents retaining earlier states. Composite state/floor/entity foreign keys prevent references across projects or floors. Boundary edges require a room parent and, for WALL edges, a real wall in the same floor/state. OPEN edges require a null wall ID. Elevation constraints permit negative levels and require ceiling above floor when both are known. No clear-height column exists.

Historical migration files remain unchanged. Migration 0005 intentionally removes history and retired upload data. Its startup cleanup queue is temporary and disappears when file cleanup succeeds. Migration 0006 renames concurrency columns without losing state. Migration 0007 adds Space scalar columns and ordered edge storage without inventing legacy values. Existing room subtype JSON, IDs, boundaries, evidence and claims remain readable. Missing elevations normalize to null; missing enclosure stays unknown. There is no legacy CLOSED backfill.

## Physical Space model

The persisted `room` kind denotes a physical Space. Name/type carry separate user semantics; functional Zones are not derived here. Rooms reference floor-owned Walls, never private duplicates. The original boundary convention is preserved: wall-derived polygons follow wall centreline segments, and manual polygons remain explicitly authored geometry. Area is polygon area, not net usable area.

Room extensions are `enclosureStatus`, ordered `boundaryEdges`, `floorElevation`, `ceilingElevation`, and structured `topology` provenance (`source: WALL_TOPOLOGY`, engine identifier and canonical wall signature). Each edge stores index, start, end, kind, and nullable wall ID. A complete perimeter determines boundary and area. An indeterminate OPEN representation may have an empty polygon and null area. Clear height is ceiling minus floor; inter-Space elevation difference is destination minus origin. Neither result is independently editable or stored. Space elevations are world elevations and are never inferred from Floor.elevation.

## Shared topology and classification

`deriveSpacesFromWalls` creates a read-only planar graph by noding intersections. Graph subdivisions retain references to the original Walls. Directed half-edge walks extract bounded faces; dangling excursions do not become room boundaries. The engine never inserts, deletes, snaps, or moves canonical Walls.

CLOSED is a simple positive-area bounded face with only WALL edges. For open discovery, a nonbranching connected chain with exactly two loose endpoints and at least three wall segments can define one mouth. The mouth is an explicit OPEN edge only if the resulting perimeter is simple and does not cross unrelated Walls. PARTIALLY_OPEN means that edge is a missing collinear wall run between its neighboring segments. OPEN means an open mouth with a different direction, such as a U-shaped enclosure. Both have calculable Area only because their complete explicit perimeter is deterministic. Small gaps remain explicit openings.

Ambiguous branched open networks, multiple possible mouths, and polygons requiring holes are not guessed. Overlapping nested regions produce structured validation errors rather than invented subtraction geometry. This phase does not infer functional Zones, semantics, doors, or transition types. Intentional openings are not architectural errors merely because they are open.

Topology tolerance is centralized in `SPACE_TOLERANCE`, independent of editor snapping. Results are independent of zoom, camera, input wall order and random IDs. Matching uses exact polygon intersection area via triangulation/convex clipping, then shared wall count, old ID and canonical candidate order. The strongest overlap survives a split; remaining candidates receive deterministic UUID-shaped IDs. A merge keeps the dominant predecessor, with lexical ID tie-breaking. Eligible metadata stays with the survivor; new split children start unknown. Draft-only identities are accepted on save only when independently reproduced candidate geometry matches. Removed Space references are cleared from current dependent entities.

## Authority and transactions

Committed edits call `recomputeSceneSpaces` before pushing one complete draft into local undo. Recalculation is scoped by floor. Within a changed floor the current implementation performs a full deterministic pass; it can be narrowed to components later. Pointer previews do not run discovery. Existing manual polygons remain an advanced workflow.

`SceneService.save` checks current revision and ownership inside a SQLite transaction. `SpaceTopologyService` validates wall inputs, independently invokes the shared derivation/matching pipeline, recalculates area, and validates topology, ownership, elevations and overlap. Client-derived geometry is provisional. Unchanged legacy rooms remain readable without speculative conversion. Floors containing managed Spaces are revalidated even when only metadata is submitted.

VERIFIED and USER_CORRECTED room geometry cannot be automatically replaced or removed. A conflict returns structured SPACE_GEOMETRY_CONFLICT with 409 before persistence. Semantic edits do not verify geometry. Geometry/elevation failures return 422. The repository deletes current boundary edges and dependent rows, writes the complete replacement, writes ordered edges after entities, and advances the revision in the same transaction. A failed constraint rolls back the entire operation. No split/merge history is stored.

## Rendering and remaining limits

Both renderers consume `projectFloor`, preserving canonical identity and vertical metadata. 2D shows subtle polygon fills, dashed open edges and interior labels. 3D draws floor surfaces at known Space elevations with wall solids owned by the floor; it creates no room boxes or duplicate walls. Unknown Space elevations have no invented 3D surface level. Ceiling geometry, multi-level surfaces, drainage, transitions and Zones remain deferred.

Current wall-side fields contain at most one room per side; boundary edges are the complete many-to-many Space/wall relationship. Existing editor junction splitting normally keeps side references unambiguous. Connectivity still requires an explicit hosted opening; touching Spaces alone do not imply passage.

## Architectural Window engine

The preimplementation audit found a simple hosted window (`wallId`, position, width, height, sill, four basic types) with overall entity verification/evidence. Legacy positions without `positionReference` are centres. Legacy sill reference is explicitly `Floor.elevation + Wall.base`, established by the original wall/3D projection. Walls are directed; normalization does not silently reverse endpoints. The original horizontal cutout loop could not handle stacked openings and has been replaced with an X/Z interval sweep. The transactional current-state repository already supports validated subtype JSON. No audit stop condition required a workaround.

A window retains one canonical entity ID and two internal concerns:

- Opening: `wallId`, `positionAlongWall`, `positionReference: OPENING_START`, `width`, `verticalReference: WORLD`, nullable `bottomElevation` and `topElevation`. World values are in metres. Legacy `height` and `sillHeight` must both be null for WORLD windows. Height is top minus bottom; sill from each adjacent Space is bottom minus that Space's floor elevation. Unknown operands yield unknown results.
- Assembly: nullable/optional `assembly` contains `profile`, nullable `panels`, nullable `tracks`, `glazing`, `shutter` and `screen`. Absence means unknown, never a guessed legacy layout. Entity `type` remains backward-compatible lowercase (`fixed`, `casement`, `sliding`, `tilt_turn`, `awning`, `unknown`).

Profiles have architectural material ALUMINUM/PVC/WOOD/STEEL/COMPOSITE/OTHER/UNKNOWN and nullable positive `frameFaceWidth`, `frameDepth`, `sashFaceWidth`, `sashDepth`. Glazing has SINGLE/DOUBLE/TRIPLE/LAMINATED/TEMPERED/INSULATED/UNKNOWN, CLEAR/FROSTED/TINTED/REFLECTIVE/UNKNOWN finish, nullable positive glass/overall glazing thickness. Each panel can override the assembly glazing. Known glass thickness cannot exceed known total thickness. No supplier rules are inferred.

Panels retain UUIDs and contiguous authored indexes. Their `region: {x,y,width,height}` tiles the normalized opening rectangle: x follows wall start→end and y rises from the opening bottom. Regions must be positive, in bounds, nonoverlapping and cover unit area within 1e-7. This permits both columns/mullions and rows/transoms, including custom rectangular layouts. Panel function is FIXED or OPERABLE; operation is FIXED/CASEMENT/SLIDING/TILT_TURN/AWNING/UNKNOWN. Function and operation must agree. Index is authored order, not a camera-dependent left/right sort. Layout edits reuse surviving panel IDs; dimensional/specification edits do not regenerate them.

Casement/tilt-turn orientation is `PANEL_START`/`PANEL_END`/`UNKNOWN` and `WALL_LEFT`/`WALL_RIGHT`/`UNKNOWN`. Wall Left is the normal (-dy, dx) in the architectural XY plane. Interior/exterior is never guessed. Awning is distinct, with a top-hung schematic; no hardware simulation is implied. Sliding panels carry `TOWARD_PANEL_START`, `TOWARD_PANEL_END`, `BIDIRECTIONAL` or `UNKNOWN`, never hinge metadata. Nullable positive integer tracks describe the assembly; sliding operations identify its movable panels. Explicit wall reversal transforms opening start, panel regions, known hinges, swing sides and sliding directions, preserving IDs and physical locations.

Shutter type is NONE/ROLLER/LOUVER/EXTERNAL_VENETIAN/UNKNOWN; operation MANUAL/ELECTRIC/UNKNOWN; box NONE/EXPOSED/CONCEALED/INTEGRATED/UNKNOWN. NONE requires UNKNOWN operation and NONE box; UNKNOWN type cannot claim known operation. Screen type is NONE/FIXED/SLIDING/ROLLING/PLEATED/UNKNOWN. These are architectural requirements. Box sizes, motors, screen tracks and product compatibility are not invented.

### Window authority, persistence and compatibility

`WindowService` validates proposed windows before topology and database replacement; shared `validateWindows` supplies the editor and server with structured WINDOW_* issues. Host existence, floor ownership, directed horizontal bounds, world vertical bounds, X/Z physical collisions, layouts, operations, profiles, glazing, shutters and screens are checked. Unknown dimensions are warnings, not inferred facts. Invalid shortening/dragging does not resize, clamp, or rehost a window. Deleting a host is blocked while windows remain; deleting a window restores the wall solid. Rehosting has no dedicated UI: delete/recreate is explicit. Existing wall junction splitting preserves physical placement and rejects junctions that cross an opening.

Migration 0008 adds `entities.bottom_elevation` and `entities.top_elevation`, with elevation order constraints. All assembly data remains validated structured subtype JSON; stable panel UUIDs round-trip exactly. Existing host, floor, position, width and type columns remain queryable. No assembly history, extra scene versions or supplier tables are introduced. Wall geometry and its window assembly save in the existing single current-state transaction. `window-assembly-v1` writer capability prevents older parsers from erasing these fields.

Legacy records are retained verbatim, including unknown height/sill values and absent layout/profile/accessories. The read-only `openingElevations` adapter interprets known legacy geometry using its documented host-base reference. It never fabricates an elevation if floor/base/sill is missing. Editing world elevations explicitly converts that window, clears independent legacy height/sill and preserves other fields. Migration adds columns without destructive or speculative backfill. Space floor changes never alter world windows or legacy host-relative geometry.

### Window editor and rendering

Creation selects an existing host and start position, width, nullable world bottom/top and basic type. The visible creation default is one UNKNOWN operable panel, unknown profile/glazing, no shutter or screen. Multi-panel layouts are generated only by an explicit count/layout action. General/Panels/Profile/Glass/Shutter/Screen groups edit one local canonical draft. The panel editor also exposes normalized regions, operation orientation, sliding directions and glass finish overrides. A window drag projects its pointer displacement on its current host axis; off-axis movement has no canonical XY effect. Undo/redo remains local editor memory.

2D places its glyph at the canonical opening start and rotates it with the wall. A thin schematic elevation strip shows both rows and columns; it is not a cut-plane claim for stacked windows. Fixed markers, sliding rails/arrows and known casement swing envelopes differ; tilt-turn/awning have distinct schematic marks. The 90-degree casement envelope illustrates direction, not an animated state. Selection uses the same entity ID as 3D.

Wall solids are the complement of opening rectangles in directed wall-distance/world-height space. For each interval between opening X endpoints, vertical cuts are unioned and remaining wall strips emitted. Thus vertically separated openings with identical X spans preserve the wall between them. Unknown cut geometry omits the host solid, avoiding a false solid wall behind a window. Invalid out-of-bounds drafts omit the invalid host solid and report issues.

3D frames, mullions/transoms, per-panel sashes and glass share the opening coordinates, centred within host thickness. Profile and glazing dimensions are honored when known. Renderer-only defaults are frame face 0.04 m, frame depth min(0.08 m, known wall thickness or 0.20 m), sash face 0.025 m, sash depth 0.04 m and glass 0.008 m; face defaults shrink for very small openings. These values never enter canonical data or calculated visible glass dimensions. Visible glass sizes are reported only with known frame faces and, for operable panels, known sash faces. Shared bar faces are apportioned equally to neighboring panels. Unknown legacy layout renders an unsplit illustrative frame/glass surface without inventing canonical panels. Profile assumptions are flagged in rendering metadata and properties.

All sashes render closed in 3D; operation angles, detailed tracks/hardware, shutter box volumes and screen mechanisms are deferred. Shutter/screen requirements are retained in properties and mesh metadata without invented physical volumes. No suppliers, SKUs, prices, procurement, catalogs or commercial matching are part of this model.

### Window verification results — 2026-10-02

- `pnpm test`: 103 tests passed across 10 files (31 Window tests added). Coverage includes hosting, movement/rotation/reversal, shortening, projected drag, world elevations and relative Space sills, legacy unknowns, one/two/three-panel rows and columns, invalid layouts/operations, profile and glazing dimensions, panel overrides, shutter/screen variants, X/Z collisions, exact cutout volume and frame/glass geometry, atomic API rejection, stale writer protection, database reopening and migration of a populated copy.
- `pnpm test:e2e`: all 9 browser regressions passed. The Window workflow additionally passed a focused rerun with explicit casement hinge/swing glyph assertions. It creates 2.40 m glazing at +0.90/+2.40, configures three fixed/sliding/sliding panels, Aluminum, Double/Clear glass, electric Roller/Concealed box and Sliding screen, saves/reloads, verifies 2D/3D and split-view consistency, moves/drags/rotates the host/window, rejects shortening and saves/reloads corrected geometry with stable IDs. Browser error capture is empty.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm db:migrate`: passed. Eight migrations applied. Existing nonblocking large-chunk and Three.js Clock deprecation warnings remain.
- Migration tested first on a copy of the actual workspace database, then applied to the workspace. Legacy window rows and all entity/evidence counts are unchanged; foreign-key check is empty and integrity check is `ok`. Ten current-state tables remain, with no Window history/version tables. Backup: `/tmp/window-engine-validation/before-window-migration.sqlite`.
- Visual inspection: `test-results/window-plan.png` and `test-results/window-assembly-3d.png`. The 3D capture shows the real cutout, three-panel frames and transparent glazing.

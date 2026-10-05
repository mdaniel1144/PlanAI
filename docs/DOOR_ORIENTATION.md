# Directed hosted openings

`hingedOrientation` is optional and nullable. It applies only to hinged doors.
Legacy `direction` remains unchanged and is never mapped to the new fields.
Absence means unknown, including for historical hinged doors. Double doors,
sliding panel stacking, and physical open-angle/state are deferred.

The directed wall is `start → end`, with unit tangent `(dx, dy) / length`.
`WALL_LEFT` uses `(-dy, dx) / length`; `WALL_RIGHT` uses its negative.
`OPENING_START` is the opening endpoint nearer wall.start; `OPENING_END` is
farther along that directed wall. These are world-space conventions independent
of camera, SVG screen coordinates, and floor elevation.

## Placement compatibility

Historical snapshots store `positionAlongWall` at the opening **centre**.
They must not be reinterpreted or migrated implicitly. New editor placements
write `positionReference: "OPENING_START"`, making the interval
`[positionAlongWall, positionAlongWall + width]` as specified for this phase.
Absent positionReference retains the old centre convention. `openingInterval`
is the shared translator for validation, cutouts, and both viewers. This marker
is orthogonal to hingedOrientation and also supports windows and passages.

`doorSwing` derives hinge, closed tip, and a 90-degree envelope tip. The latter
is a rendering convention, never canonical physical door state. Unknown
orientation must not be rendered as a known swing. Passages have no leaf.

No routine normalizes wall endpoint order. The explicit `reverseWall` operation
remaps all hosted intervals, swaps hinge/swing sides and wall room-side references.
Translation preserves all hosted parameters. Shortening never clamps openings;
invalid placements block save.

## Persistence and writers

Both optional properties are retained by entityRecord's kind-specific JSON
payload and parsed back by recordEntity. No SQL migration or schemaVersion bump
is required. Historical snapshot data is not rewritten. API save contracts use
the extended HomeScene schema; the current frontend parses the same schema.

Mixed frontend versions are realistic: an already-open browser tab can outlive
a deployment. Full-scene save therefore requires writerCapabilities containing
`door-orientation-v1` when either old or submitted scene uses new metadata.
A stale writer receives 409 before any snapshot is written, even if it stripped
all new fields. Server-side save is explicit and may save an old snapshot
without orientation. Server-side corrections preserve unrelated fields.

Tests cover all four orientations on horizontal, vertical, and angled walls,
unknown legacy/sliding doors, movement, shortening, explicit reversal, immutable
projection, repository/API/current-state/save/JSON round trips, and stale writers.

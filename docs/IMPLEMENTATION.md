# Implementation

Current capabilities are project creation, architectural wall drawing, automatic Space detection, property editing, validation, local undo/redo, current-scene saving, 2D/3D/split views, architectural review, and JSON export.

The upload and version-history features have been removed from routes, navigation, API clients, server handlers, shared request schemas, runtime dependencies, and database storage. The migration preserves current scene geometry while removing old snapshots, source metadata, processing jobs, and their stored original/preview files. No restore endpoint remains.

The concurrency revision still increments on successful writes. A stale request returns 409 without changing the database. Geometry errors return 422. Successful updates replace relational state in one transaction and do not create an audit snapshot. Manual geometry evidence remains part of the current scene.

Space coverage includes deterministic CLOSED/OPEN/PARTIALLY_OPEN fixtures, concave geometry, gaps, matching, split/merge, protected authority, null/negative elevations, canonical parity, transactional persistence and boundary constraints.

Verification covers populated legacy upgrades, file cleanup, relational integrity, rejected retired endpoints, current-state saves/reopens, drawing interactions, selection, floor isolation, and export. See the root README for commands and configuration.

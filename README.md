# Habitat

A local architectural drawing editor with owned projects, an admin-managed product catalog, and shared 2D and 3D geometry. Create a project and floor, draw walls to discover Spaces, add doors and windows, edit properties, and export the current scene as JSON.

## Run

Requires Node.js 22.13 or newer and pnpm 10.

```sh
pnpm install
pnpm db:migrate
# Bootstrap your first administrator as documented below, then:
pnpm dev
```

The frontend runs on http://localhost:5173 and proxies API requests to http://127.0.0.1:3001. The default SQLite database is `data/habitat.sqlite`, anchored to the workspace regardless of the command's working directory. Override it with `DATABASE_PATH`; `PORT` overrides the API port.

## Sign in and manage users

Unauthenticated visitors begin at `/login`. Create the first administrator explicitly with `pnpm auth:bootstrap`, supplying `ADMIN_EMAIL`, `ADMIN_NAME`, and a secret `ADMIN_PASSWORD` through the environment. No default credentials are created. See [Authentication](docs/AUTHENTICATION.md) for the hidden-password prompt, production HTTPS/cookie configuration, and complete API/security details.

After login, the header account menu provides settings and server-backed sign out. Administrators manage users at `/admin/users`; all existing project/editor APIs now require a valid session. API mutations also require `X-Habitat-Request: 1`, which the frontend sends centrally.

## Items catalog and ownership

Administrators manage products at `/admin/items`. Users open **Add Item** in their own project editor to browse ACTIVE products and place a product and choose its color. GLBs and textures remain in server-side storage, and placed instances reference the central catalog. Each Item has one GLB and fixed dimensions; colors change appearance only. Product images are generated automatically after dimension confirmation and update with the default color. Display & Units settings control length presentation; all stored geometry remains metres. Product dimensions require ADMIN verification and a recorded source. See [dimension and unit hardening](docs/ITEMS_DIMENSIONS_HARDENING.md), [automatic thumbnails](docs/ITEMS_AUTO_THUMBNAILS.md), [setup hardening and validation](docs/ITEMS_SETUP_HARDENING.md), [Items simplification and current API policy](docs/ITEMS_SIMPLIFICATION.md) and [asset/ownership infrastructure](docs/ITEMS_CATALOG.md).

New projects belong to their creator. Legacy ownerless projects are ADMIN-only until an administrator assigns an active user with `PATCH /api/admin/projects/:projectId/owner` and `{ "ownerUserId": "<user-id>" }`. Users cannot read or edit another user's project.

## Editor

Drawing controls are in the floating canvas toolbar. Tool settings contain creation defaults and confirmation controls. View contains grid visibility, snapping, grid spacing, floor selection, labels, dimensions, and editor status. The project title and Save changes / Export actions are in the global header.

Double-click finishes a wall chain. Spaces appear automatically; select one to edit its name, type, and elevations. Explicit manual polygons remain under Advanced geometry. Local undo/redo supports up to 100 actions. Save changes replaces the current persisted scene; a successful save clears local undo history. Concurrent stale saves return 409 and keep the local draft for recovery. The API's `revision` / `expectedRevision` values are concurrency revisions, not stored historical snapshots.

Catalog GLB, texture, and thumbnail uploads are available to ADMIN users. There are no source-document upload, document processing, source tracing, analysis, version history, comparison, or restore workflows. The corresponding pages and APIs have been removed. The current scene remains editable and exportable.

## Data upgrade

Migration `0005_current_scene_only.sql` keeps each project's current scene and removes earlier snapshots, correction/verification history, uploaded source records, preview metadata, and processing jobs. It removes source-file references from retained geometry evidence. Startup deletes the recorded original and derived files from the former storage root and removes empty directories; unrelated files are untouched. Failed deletions remain queued for retry. `STORAGE_PATH` now also configures the active catalog asset store; its `items/` namespace is separate from retired source-file cleanup.

The migration checkpoints and compacts SQLite after deleting obsolete data. Earlier SQL migrations remain unchanged for upgrading existing databases. Migration 0006 renames concurrency columns to revision; migration 0007 adds nullable Space properties and current-state boundary relationships. Run the same upgrade explicitly with `pnpm db:migrate`.

## API

| Method     | Route                                         | Purpose                                             |
| ---------- | --------------------------------------------- | --------------------------------------------------- |
| GET / POST | `/api/projects`                               | List/create projects                                |
| GET        | `/api/projects/:projectId`                    | Read a project                                      |
| GET / POST | `/api/projects/:projectId/scenes`             | List current scene identities/create an empty floor |
| GET / PUT  | `/api/scenes/:sceneId`                        | Read/replace the current scene                      |
| GET        | `/api/scenes/:sceneId/floors`                 | Read floors                                         |
| GET        | `/api/floors/:floorId/entities`               | Read current entities                               |
| POST       | `/api/scenes/:sceneId/corrections`            | Apply an entity correction                          |
| POST       | `/api/scenes/:sceneId/verifications`          | Verify an entity                                    |
| GET        | `/api/scenes/:sceneId/issues`                 | Validate geometry                                   |
| GET        | `/api/scenes/:sceneId/clarifications`         | Read clarification questions                        |
| POST       | `/api/clarifications/:clarificationId/answer` | Record an answer                                    |

PUT accepts `{ expectedRevision, scene, writerCapabilities: ["door-orientation-v1", "window-assembly-v1", "items-v1"] }`. Source-upload and history endpoints return 404; current-scene reads reject query parameters with 400.

## Validation

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

Browser tests use an isolated database. Set `CHROMIUM_PATH` to an installed Chromium executable when needed. Tests cover migration of populated databases, deletion of upload files, current-scene persistence, stale writes, relational constraints, drawing, double-click completion, saving/reloading, 3D consistency, and JSON export.

See [Architecture](docs/ARCHITECTURE.md), [Editor](docs/ARCHITECTURAL_EDITOR.md), [Window UI and usage guide](docs/WINDOWS.md), and [Door orientation](docs/DOOR_ORIENTATION.md).

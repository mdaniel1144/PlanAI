import { CatalogService } from "./modules/items/service";
import { catalogRoutes } from "./modules/items/routes";
import { inspectGLB } from "./modules/items/glb";
import { AssetService, assetRoutes } from "./modules/items/assets";
import { ItemError, catalogValidationError } from "./modules/items/errors";
import { authConfig, type AuthConfig } from "./modules/auth/config";
import { AuthRepository } from "./modules/auth/repository";
import { AuthService } from "./modules/auth/service";
import { AuthError } from "./modules/auth/errors";
import {
  identity,
  requireAdmin,
  protectMutations,
  requireAuthenticatedUser,
} from "./modules/auth/middleware";
import {
  publicAuthRoutes,
  authenticatedAuthRoutes,
} from "./modules/auth/routes";
import { windowAssemblyIssueCode } from "@habitat/geometry";
import { removeRetiredFiles } from "./infrastructure/database/remove-retired-files";
import {
  databasePath as defaultDatabasePath,
  storagePath as defaultStoragePath,
} from "./runtime-paths";
import express from "express";
import { z, ZodError } from "zod";
import { id, entitiesOf } from "@habitat/domain";
import {
  createProjectRequest,
  saveSceneRequest,
  createSceneRequest,
  correctionRequest,
  verificationRequest,
} from "@habitat/contracts";
import { openDatabase } from "./infrastructure/database/database";
import { Repository } from "./infrastructure/database/repository";
import { SceneService } from "./modules/scenes/service";
import { HttpError } from "./errors";
export function createApp(
  databasePath = defaultDatabasePath(),
  storageRoot = defaultStoragePath(),
  seed = true,
  config: AuthConfig = authConfig(),
) {
  const repo = new Repository(openDatabase(databasePath)),
    service = new SceneService(repo);
  removeRetiredFiles(repo.db.sqlite, storageRoot);
  if (seed) service.seed();
  const app = express();
  app.disable("x-powered-by");
  const auth = new AuthService(new AuthRepository(repo.db.sqlite), config);
  auth.repo.cleanupSessions();
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth/login", protectMutations(config));
  app.use("/api/auth", express.json({ limit: "8kb" }));
  app.use("/api", publicAuthRoutes(auth));
  app.use("/api", requireAuthenticatedUser(auth));
  app.use("/api", protectMutations(config));
  const assets = new AssetService(repo.db.sqlite, storageRoot);
  app.use("/api", assetRoutes(assets, inspectGLB));
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", authenticatedAuthRoutes(auth));
  const catalog = new CatalogService(repo.db.sqlite);
  app.use("/api", catalogRoutes(catalog));
  const accessProject = (res: express.Response, projectId: string) => {
    const project = service.requireProject(projectId);
    const user = identity(res).user;
    if (user.role !== "ADMIN" && project.ownerUserId !== user.id)
      throw new AuthError(
        403,
        "PROJECT_ACCESS_FORBIDDEN",
        "You do not own this project.",
      );
    return project;
  };
  const accessScene = (res: express.Response, sceneId: string) => {
    const scene = service.requireScene(id.parse(sceneId));
    accessProject(res, scene.projectId);
  };
  app.param("sceneId", (_req, res, next, value) => {
    try {
      accessScene(res, value);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.param("floorId", (_req, res, next, value) => {
    try {
      const sceneId = repo.sceneForFloor(id.parse(value));
      if (!sceneId) throw new HttpError(404, "Floor not found");
      accessScene(res, sceneId);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.param("clarificationId", (_req, res, next, value) => {
    try {
      const row = repo.db.sqlite
        .prepare("SELECT scene_id FROM clarifications WHERE id=?")
        .get(id.parse(value)) as { scene_id: string } | undefined;
      if (!row) throw new HttpError(404, "Clarification not found");
      accessScene(res, row.scene_id);
      next();
    } catch (error) {
      next(error);
    }
  });
  app.patch(
    "/api/admin/projects/:projectId/owner",
    requireAdmin,
    (req, res) => {
      const { ownerUserId } = z
        .object({ ownerUserId: id })
        .strict()
        .parse(req.body);
      const target = auth.repo.require(ownerUserId);
      if (target.status !== "ACTIVE")
        throw new AuthError(
          400,
          "PROJECT_OWNER_INVALID",
          "Owner must be an active user.",
        );
      repo.db.sqlite
        .prepare("UPDATE projects SET owner_user_id=? WHERE id=?")
        .run(ownerUserId, req.params.projectId);
      res.json(service.requireProject(id.parse(req.params.projectId)));
    },
  );
  app.param("projectId", (_req, _res, next, value) => {
    try {
      id.parse(value);
      accessProject(_res, value);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/projects", (_req, res) =>
    res.json(
      repo
        .listProjects()
        .filter(
          (p) =>
            identity(res).user.role === "ADMIN" ||
            p.ownerUserId === identity(res).user.id,
        ),
    ),
  );
  app.post("/api/projects", (req, res) =>
    res
      .status(201)
      .json(
        service.createProject(
          createProjectRequest.parse(req.body),
          identity(res).user.id,
        ),
      ),
  );
  app.get("/api/projects/:projectId", (req, res) =>
    res.json(service.requireProject(req.params.projectId)),
  );
  app.post("/api/projects/:projectId/scenes", (req, res) => {
    const b = createSceneRequest.parse(req.body);
    res
      .status(201)
      .json(
        service.createScene(req.params.projectId, b.floorName, b.elevation),
      );
  });
  app.get("/api/projects/:projectId/scenes", (req, res) =>
    res.json(
      repo
        .sceneIds(req.params.projectId)
        .map((s) => ({ id: s.id, revision: repo.currentRevision(s.id) })),
    ),
  );
  app.get("/api/scenes/:sceneId", (req, res) => {
    if (Object.keys(req.query).length)
      throw new HttpError(
        400,
        "Current scene reads do not accept query parameters",
      );
    res.json(service.requireScene(id.parse(req.params.sceneId)));
  });
  app.get("/api/scenes/:sceneId/items", (req, res) =>
    res.json(catalog.resolve(service.requireScene(req.params.sceneId))),
  );
  app.get("/api/scenes/:sceneId/floors", (req, res) =>
    res.json(service.requireScene(id.parse(req.params.sceneId)).floors),
  );
  app.put("/api/scenes/:sceneId", (req, res) => {
    const b = saveSceneRequest.parse(req.body);
    // Old browser tabs remain possible across deployments. Do not let a
    // pre-extension parser silently erase direction or placement metadata.
    const previous = service.requireScene(req.params.sceneId);
    if (
      !b.writerCapabilities?.includes("items-v1") &&
      [...previous.floors, ...b.scene.floors].some(
        (f) => f.itemInstances?.length,
      )
    )
      throw new ItemError(
        409,
        "ITEM_WRITER_OUTDATED",
        "Reload the current editor before saving furniture.",
      );
    if (
      !b.writerCapabilities?.includes("door-orientation-v1") &&
      [...previous.floors, ...b.scene.floors].some(
        (f) =>
          f.rooms.some((r) => r.boundarySource || r.boundaryWallIds) ||
          f.dimensions.some((d) => d.startAnchor || d.endAnchor) ||
          [...f.doors, ...f.windows, ...f.openings].some(
            (o) =>
              o.positionReference || (o.kind === "door" && o.hingedOrientation),
          ),
      )
    ) {
      throw new HttpError(
        409,
        "This scene requires the current architectural editor. Reload before saving.",
      );
    }
    if (
      !b.writerCapabilities?.includes("window-assembly-v1") &&
      [...previous.floors, ...b.scene.floors].some((f) =>
        f.windows.some((w) => w.verticalReference || w.assembly),
      )
    )
      throw new HttpError(
        409,
        "This scene requires the window editor. Reload before saving.",
      );
    res
      .status(200)
      .json(service.save(req.params.sceneId, b.scene, b.expectedRevision));
  });
  app.get("/api/floors/:floorId/entities", (req, res) => {
    id.parse(req.params.floorId);
    const sceneId = repo.sceneForFloor(req.params.floorId);
    if (!sceneId) throw new HttpError(404, "Floor not found");
    res.json(
      entitiesOf(
        service
          .requireScene(sceneId)
          .floors.find((f) => f.id === req.params.floorId)!,
      ),
    );
  });
  app.post("/api/scenes/:sceneId/corrections", (req, res) => {
    const b = correctionRequest.parse(req.body);
    res
      .status(201)
      .json(
        service.correct(
          req.params.sceneId,
          b.expectedRevision,
          b.entityId,
          b.patch,
        ),
      );
  });
  app.post("/api/scenes/:sceneId/verifications", (req, res) => {
    const b = verificationRequest.parse(req.body);
    res
      .status(201)
      .json(
        service.correct(
          req.params.sceneId,
          b.expectedRevision,
          b.entityId,
          {},
          true,
        ),
      );
  });
  app.get("/api/scenes/:sceneId/issues", (req, res) =>
    res.json(service.issues(req.params.sceneId)),
  );
  app.get("/api/scenes/:sceneId/clarifications", (req, res) => {
    service.requireScene(req.params.sceneId);
    res.json(repo.clarifications(req.params.sceneId));
  });
  app.post("/api/clarifications/:clarificationId/answer", (req, res) => {
    const b = z
      .object({ answer: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(req.body);
    if (
      !repo.answerClarification(id.parse(req.params.clarificationId), b.answer)
    )
      throw new HttpError(404, "Clarification not found");
    res.json({
      saved: true,
      message:
        "Answer recorded. Canonical geometry requires an explicit correction.",
    });
  });
  app.use((_req, res) =>
    res.status(404).json({ error: "API route not found" }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (err instanceof ItemError) {
        res
          .status(err.status)
          .json({
            error: err.message,
            code: err.code,
            ...(err.blockingIssues
              ? { blockingIssues: err.blockingIssues }
              : {}),
          });
        return;
      }
      if (err instanceof AuthError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      if (
        err instanceof ZodError &&
        /^\/api\/(admin\/)?items(\/|$)/.test(_req.path)
      ) {
        res.status(400).json(catalogValidationError(err));
        return;
      }
      if (
        err instanceof ZodError &&
        /^\/api\/(auth|account|admin)(\/|$)/.test(_req.path)
      ) {
        const password = err.issues.some((i) =>
          i.path.some((p) => String(p).toLowerCase().includes("password")),
        );
        const role = err.issues.some((i) => i.path.includes("role"));
        res.status(400).json({
          code: password
            ? "PASSWORD_INVALID"
            : role
              ? "USER_INVALID_ROLE"
              : "REQUEST_INVALID",
          error: password
            ? "Passwords must contain 12–128 characters; current passwords are required."
            : "Check the supplied fields.",
          fields: err.issues.map((i) => i.path.join(".")),
        });
        return;
      }
      if (err instanceof ZodError) {
        const issues = err.issues.flatMap((i) => {
          const at = i.path.indexOf("windows");
          if (at < 0) return [];
          const field = i.path[at + 2];
          const code =
            field === "wallId"
              ? "WINDOW_MISSING_HOST_WALL"
              : field === "positionAlongWall"
                ? "WINDOW_INVALID_POSITION"
                : field === "width"
                  ? "WINDOW_INVALID_WIDTH"
                  : field === "assembly"
                    ? windowAssemblyIssueCode(i.path.slice(at + 3))
                    : "WINDOW_INVALID_ELEVATION";
          const fi = i.path.indexOf("floors");
          const entityId =
            _req.body?.scene?.floors?.[Number(i.path[fi + 1])]?.windows?.[
              Number(i.path[at + 1])
            ]?.id ?? "";
          return [{ code, entityId, message: i.message, severity: "error" }];
        });
        res.status(400).json({
          error: "Invalid request",
          details: err.issues,
          ...(issues.length ? { issues } : {}),
        });
        return;
      }
      if (err instanceof HttpError) {
        res.status(err.status).json({
          error: err.message,
          ...(err.issues ? { issues: err.issues } : {}),
        });
        return;
      }
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        err.status === 413
      ) {
        res.status(413).json({
          error: "Request is too large.",
          code: _req.path.startsWith("/api/admin/items/")
            ? "ITEM_ASSET_TOO_LARGE"
            : "REQUEST_TOO_LARGE",
        });
        return;
      }
      if (err instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }
      console.error(
        "Unhandled API error",
        err instanceof Error ? err.name : "UnknownError",
      );
      res.status(500).json({ error: "Internal server error" });
    },
  );
  return {
    app,
    repo,
    service,
    auth,
    assets,
    catalog,
    close: () => repo.db.sqlite.close(),
  };
}

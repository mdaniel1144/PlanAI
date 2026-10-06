import { AuthError } from "./errors";
import { Router } from "express";
import { z } from "zod";
import {
  loginRequest,
  updateDisplayRequest,
  createUserRequest,
  updateUserRequest,
  updateAccountRequest,
  changePasswordRequest,
  adminResetPasswordRequest,
} from "@habitat/contracts";
import { type AuthService, safeUser, safeManagedUser } from "./service";
import {
  identity,
  sessionCookie,
  requireAdmin,
  credentialLimiter,
} from "./middleware";
export function publicAuthRoutes(auth: AuthService) {
  const router = Router();
  router.post("/auth/login", credentialLimiter(), async (req, res) => {
    const body = loginRequest.parse(req.body);
    const result = await auth.login(
      body.email,
      body.password,
      sessionCookie(req, auth.config),
    );
    res
      .cookie(auth.config.cookieName, result.token, {
        ...auth.config.cookie,
        maxAge: auth.config.ttlMs,
      })
      .json(result.user);
  });
  return router;
}
export function authenticatedAuthRoutes(auth: AuthService) {
  const router = Router();
  router.get("/auth/me", (_req, res) => res.json(safeUser(identity(res).user)));
  router.post("/auth/logout", (req, res) => {
    auth.revokeToken(sessionCookie(req, auth.config)!);
    res
      .clearCookie(auth.config.cookieName, auth.config.cookie)
      .json({ ok: true });
  });
  router.patch("/account/display", (req, res) => {
    const parsed = updateDisplayRequest.safeParse(req.body);
    if (!parsed.success)
      throw new AuthError(
        400,
        "ITEM_DISPLAY_UNIT_INVALID",
        "Choose a supported theme and measurement unit.",
      );
    const userId = identity(res).user.id;
    // A queued write from a tab whose session changed must never affect the new account.
    const expectedUser = req.get("X-Habitat-User");
    if (expectedUser && expectedUser !== userId)
      throw new AuthError(
        409,
        "DISPLAY_USER_CHANGED",
        "Your signed-in account changed. Reload to continue.",
      );
    res.json(safeUser(auth.repo.updateDisplay(userId, parsed.data)));
  });
  router.patch("/account", (req, res) => {
    const user = auth.updateUser(
      identity(res).user.id,
      updateAccountRequest.parse(req.body),
    );
    res.json(safeUser(auth.repo.require(user.id)));
  });
  router.post(
    "/account/change-password",
    credentialLimiter(),
    async (req, res) => {
      const b = changePasswordRequest.parse(req.body);
      await auth.changePassword(
        identity(res),
        b.currentPassword,
        b.newPassword,
      );
      res.json({ ok: true });
    },
  );
  // This boundary applies to all present and future /api/admin routes.
  router.use("/admin", requireAdmin);
  router.get("/admin/users", (_req, res) => res.json(auth.repo.list()));
  router.post("/admin/users", async (req, res) =>
    res
      .status(201)
      .json(
        await auth.createUser(createUserRequest.parse(req.body), identity(res)),
      ),
  );
  router.param("userId", (_req, _res, next, value) => {
    z.string().uuid().parse(value);
    next();
  });
  router.get("/admin/users/:userId", (req, res) =>
    res.json(safeManagedUser(auth.repo.require(req.params.userId))),
  );
  router.patch("/admin/users/:userId", (req, res) =>
    res.json(
      auth.updateUser(req.params.userId, updateUserRequest.parse(req.body)),
    ),
  );
  router.post("/admin/users/:userId/reset-password", async (req, res) => {
    const body = adminResetPasswordRequest.parse(req.body);
    await auth.resetPassword(
      req.params.userId,
      body.newPassword,
      identity(res),
    );
    res.json({ ok: true });
  });
  for (const action of ["disable", "enable"] as const)
    router.post(`/admin/users/:userId/${action}`, (req, res) =>
      res.json(
        auth.updateUser(req.params.userId, {
          status: action === "disable" ? "DISABLED" : "ACTIVE",
        }),
      ),
    );
  return router;
}

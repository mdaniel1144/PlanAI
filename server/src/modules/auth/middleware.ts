import type { Request, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import type { AuthConfig } from "./config";
import { AuthError } from "./errors";
import type { AuthService, SessionIdentity } from "./service";
export function sessionCookie(req: Request, config: AuthConfig) {
  return req.headers.cookie
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${config.cookieName}=`))
    ?.slice(config.cookieName.length + 1);
}
export const identity = (res: Response) => res.locals.auth as SessionIdentity;
export const requireAuthenticatedUser =
  (auth: AuthService): RequestHandler =>
  (req, res, next) => {
    try {
      res.locals.auth = auth.authenticate(sessionCookie(req, auth.config));
      next();
    } catch (error) {
      res.clearCookie(auth.config.cookieName, auth.config.cookie);
      next(error);
    }
  };
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (identity(res).user.role !== "ADMIN")
    throw new AuthError(
      403,
      "AUTH_FORBIDDEN",
      "Administrator access is required.",
    );
  next();
};
export const protectMutations =
  (config: AuthConfig): RequestHandler =>
  (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    // HTML forms cannot set this header; foreign JS requires CORS preflight, which we do not allow.
    if (
      req.get("X-Habitat-Request") !== "1" ||
      req.get("Sec-Fetch-Site") === "cross-site"
    )
      throw new AuthError(
        403,
        "AUTH_CSRF_REJECTED",
        "Request origin could not be verified.",
      );
    const origin = req.get("Origin");
    const expected = config.origin ?? `${req.protocol}://${req.get("host")}`;
    if (origin && origin !== expected)
      throw new AuthError(
        403,
        "AUTH_CSRF_REJECTED",
        "Request origin could not be verified.",
      );
    next();
  };
export function credentialLimiter(): RequestHandler {
  const entries = new Map<string, { count: number; until: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of entries)
      if (value.until <= now) entries.delete(key);
    const account =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : identity(res)?.user.id;
    const keys: [string, number][] = [[`ip:${req.ip}`, 30]];
    if (account)
      keys.push([
        `account:${createHash("sha256").update(account).digest("hex")}`,
        10,
      ]);
    if (
      entries.size >= 10000 ||
      keys.some(([key, limit]) => (entries.get(key)?.count ?? 0) >= limit)
    ) {
      res.set("Retry-After", "900");
      throw new AuthError(
        429,
        "AUTH_RATE_LIMITED",
        "Too many attempts. Please try again later.",
      );
    }
    for (const [key] of keys) {
      const value = entries.get(key) ?? {
        count: 0,
        until: now + 15 * 60 * 1000,
      };
      value.count++;
      entries.set(key, value);
    }
    next();
  };
}

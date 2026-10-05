export function authConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const ttlDays = Number(env.SESSION_TTL_DAYS ?? 7);
  if (!Number.isFinite(ttlDays) || ttlDays <= 0 || ttlDays > 90)
    throw new Error("SESSION_TTL_DAYS must be greater than 0 and at most 90.");
  const origin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : undefined;
  if (production && (!origin || !origin.startsWith("https://")))
    throw new Error("Production requires an HTTPS APP_ORIGIN.");
  return {
    production,
    origin,
    ttlMs: ttlDays * 86400000,
    cookieName: production ? "__Host-habitat_session" : "habitat_session",
    cookie: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: production,
      path: "/",
    },
  };
}
export type AuthConfig = ReturnType<typeof authConfig>;

import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createHash } from "node:crypto";
import { createApp } from "../server/src/app";
import { authConfig } from "../server/src/modules/auth/config";
import {
  hashPassword,
  verifyPassword,
} from "../server/src/modules/auth/password";
import { testPassword } from "./auth-helper";
const instances: ReturnType<typeof createApp>[] = [];
async function setup() {
  const a = createApp(
    ":memory:",
    "/tmp/auth-test-unused",
    true,
    authConfig({ APP_ORIGIN: "http://localhost:5173" }),
  );
  instances.push(a);
  const admin = await a.auth.bootstrap({
    name: "Administrator",
    email: " ADMIN@example.test ",
    password: testPassword,
  });
  const agent = request.agent(a.app).set("X-Habitat-Request", "1");
  await agent
    .post("/api/auth/login")
    .send({ email: admin.email, password: testPassword })
    .expect(200);
  return { ...a, admin, agent };
}
afterEach(() => {
  instances.splice(0).forEach((a) => a.close());
});
const input = {
  name: "Regular User",
  email: "user@example.test",
  role: "USER",
  password: testPassword,
};
async function addUser(a: Awaited<ReturnType<typeof setup>>) {
  const response = await a.agent
    .post("/api/admin/users")
    .send(input)
    .expect(201);
  const agent = request.agent(a.app).set("X-Habitat-Request", "1");
  const login = await agent
    .post("/api/auth/login")
    .send({ email: input.email, password: testPassword })
    .expect(200);
  return { user: response.body as { id: string }, agent, login };
}
const cookieOf = (response: request.Response) =>
  String(response.headers["set-cookie"][0]).split(";")[0];
function expectSafe(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /password|token|scrypt|revoked_at/i,
  );
}
describe("authentication and session security", () => {
  it("uses salted strong password hashes and verifies only the correct password", async () => {
    const a = await hashPassword(testPassword),
      b = await hashPassword(testPassword);
    expect(a).not.toBe(b);
    expect(a).not.toContain(testPassword);
    expect(a).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(await verifyPassword(testPassword, a)).toBe(true);
    expect(await verifyPassword("wrong password", a)).toBe(false);
    await expect(hashPassword("short")).rejects.toThrow();
  });
  it("logs in with normalized email; returns safe users and stores only token hashes", async () => {
    const a = await setup();
    const r = await request(a.app)
      .post("/api/auth/login")
      .set("X-Habitat-Request", "1")
      .send({ email: " ADMIN@EXAMPLE.TEST ", password: testPassword })
      .expect(200);
    expectSafe(r.body);
    expect(r.body.role).toBe("ADMIN");
    const cookie = cookieOf(r),
      raw = cookie.split("=")[1];
    expect(r.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    expect(r.headers["set-cookie"][0]).toMatch(/SameSite=Lax/);
    expect(r.headers["set-cookie"][0]).not.toMatch(/; Secure/);
    const row = a.repo.db.sqlite
      .prepare("SELECT * FROM user_sessions WHERE token_hash=?")
      .get(createHash("sha256").update(raw).digest("hex"));
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain(raw);
    const me = await request(a.app)
      .get("/api/auth/me")
      .set("Cookie", cookie)
      .expect(200);
    expectSafe(me.body);
    expect(me.headers["cache-control"]).toBe("no-store");
    expect(a.auth.repo.require(a.admin.id).lastLoginAt).not.toBeNull();
    expect(a.auth.repo.require(a.admin.id).passwordHash).not.toBe(testPassword);
  });
  it("gives identical failures for unknown emails, wrong passwords and disabled accounts", async () => {
    const a = await setup(),
      { user } = await addUser(a);
    await a.agent.post(`/api/admin/users/${user.id}/disable`).expect(200);
    const responses = [];
    for (const [email, password] of [
      ["missing@example.test", testPassword],
      [a.admin.email, "wrong password"],
      [input.email, testPassword],
    ]) {
      const r = await request(a.app)
        .post("/api/auth/login")
        .set("X-Habitat-Request", "1")
        .send({ email, password })
        .expect(401);
      responses.push(r.body);
    }
    expect(responses[0]).toEqual({
      code: "AUTH_INVALID_CREDENTIALS",
      error: "Invalid email or password.",
    });
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
  });
  it("rejects expired, revoked, malformed and disabled-user sessions and cleans them up", async () => {
    const a = await setup();
    await request(a.app).get("/api/auth/me").expect(401);
    await request(a.app)
      .get("/api/auth/me")
      .set("Cookie", "habitat_session=bad")
      .expect(401);
    a.repo.db.sqlite
      .prepare("UPDATE user_sessions SET expires_at=?")
      .run("2000-01-01T00:00:00.000Z");
    expect((await a.agent.get("/api/auth/me").expect(401)).body.code).toBe(
      "AUTH_SESSION_EXPIRED",
    );
    expect(a.auth.repo.cleanupSessions()).toBe(1);
    await a.agent
      .post("/api/auth/login")
      .send({ email: a.admin.email, password: testPassword })
      .expect(200);
    const { agent, user, login } = await addUser(a);
    await a.agent.post(`/api/admin/users/${user.id}/disable`).expect(200);
    expect(
      a.repo.db.sqlite
        .prepare(
          "SELECT id FROM user_sessions WHERE user_id=? AND revoked_at IS NULL",
        )
        .get(user.id),
    ).toBeUndefined();
    await agent.get("/api/auth/me").expect(401);
    await a.agent.post(`/api/admin/users/${user.id}/enable`).expect(200);
    await request(a.app)
      .get("/api/auth/me")
      .set("Cookie", cookieOf(login))
      .expect(401);
    await agent
      .post("/api/auth/login")
      .send({ email: input.email, password: testPassword })
      .expect(200);
    // Defense in depth even if status is changed outside the normal service.
    a.repo.db.sqlite
      .prepare("UPDATE users SET status='DISABLED' WHERE id=?")
      .run(user.id);
    await agent.get("/api/auth/me").expect(401);
  });
  it("revokes logout tokens permanently and rotates tokens on a second login", async () => {
    const a = await setup();
    const first = await a.agent
      .post("/api/auth/login")
      .send({ email: a.admin.email, password: testPassword })
      .expect(200);
    const second = await a.agent
      .post("/api/auth/login")
      .send({ email: a.admin.email, password: testPassword })
      .expect(200);
    expect(cookieOf(second)).not.toBe(cookieOf(first));
    await request(a.app)
      .get("/api/auth/me")
      .set("Cookie", cookieOf(first))
      .expect(401);
    const logout = await a.agent.post("/api/auth/logout").expect(200);
    expect(logout.headers["set-cookie"][0]).toMatch(/Expires=Thu, 01 Jan 1970/);
    await request(a.app)
      .get("/api/auth/me")
      .set("Cookie", cookieOf(second))
      .expect(401);
  });
  it("rejects CSRF, disallowed origins and oversized login payloads; emits no permissive CORS", async () => {
    const a = await setup();
    await request(a.app)
      .post("/api/auth/login")
      .send({ email: a.admin.email, password: testPassword })
      .expect(403);
    await a.agent
      .post("/api/projects")
      .set("Origin", "https://evil.example")
      .send({ name: "CSRF" })
      .expect(403);
    await a.agent
      .post("/api/projects")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ name: "CSRF" })
      .expect(403);
    await a.agent
      .post("/api/projects")
      .set("Origin", "http://localhost:5173")
      .send({ name: "Allowed" })
      .expect(201);
    const preflight = await request(a.app)
      .options("/api/projects")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Headers", "X-Habitat-Request");
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();
    await request(a.app)
      .post("/api/auth/login")
      .set("X-Habitat-Request", "1")
      .send({ email: a.admin.email, password: "x".repeat(10000) })
      .expect(413);
  });
  it("rate-limits account attempts and IP attempts without trusting forwarded IPs", async () => {
    const a = await setup();
    // Invalid schemas still consume the limiter, without spending seconds hashing each request.
    for (let i = 0; i < 10; i++)
      await request(a.app)
        .post("/api/auth/login")
        .set("X-Habitat-Request", "1")
        .send({ email: "limited@example.test" })
        .expect(400);
    const limited = await request(a.app)
      .post("/api/auth/login")
      .set("X-Habitat-Request", "1")
      .set("X-Forwarded-For", "1.2.3.4")
      .send({ email: "limited@example.test" })
      .expect(429);
    expect(limited.body.code).toBe("AUTH_RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBe("900");
    for (let i = 0; i < 19; i++)
      await request(a.app)
        .post("/api/auth/login")
        .set("X-Habitat-Request", "1")
        .send({ email: `different${i}@example.test` })
        .expect(400);
    await request(a.app)
      .post("/api/auth/login")
      .set("X-Habitat-Request", "1")
      .set("X-Forwarded-For", "5.6.7.8")
      .send({ email: "another@example.test" })
      .expect(429);
  });
  it("configures production cookies and refuses unsafe production configuration", async () => {
    expect(() => authConfig({ NODE_ENV: "production" })).toThrow(/HTTPS/);
    expect(() => authConfig({ SESSION_TTL_DAYS: "0" })).toThrow();
    const config = authConfig({
      NODE_ENV: "production",
      APP_ORIGIN: "https://habitat.example",
      SESSION_TTL_DAYS: "2",
    });
    const a = createApp(":memory:", "/tmp/auth-test-unused", false, config);
    instances.push(a);
    await a.auth.bootstrap({
      name: "Admin",
      email: "admin@example.test",
      password: testPassword,
    });
    const r = await request(a.app)
      .post("/api/auth/login")
      .set("X-Habitat-Request", "1")
      .set("Origin", "https://habitat.example")
      .send({ email: "admin@example.test", password: testPassword })
      .expect(200);
    expect(r.headers["set-cookie"][0]).toMatch(/^__Host-habitat_session=/);
    expect(r.headers["set-cookie"][0]).toMatch(/; Secure/);
    expect(r.headers["set-cookie"][0]).toMatch(/Max-Age=172800/);
    expect(r.headers["set-cookie"][0]).not.toMatch(/Domain=/);
  });
});
describe("authorization, user management and credentials", () => {
  it("protects every existing API and all admin actions with server-side roles", async () => {
    const a = await setup(),
      { agent, user } = await addUser(a);
    const scene = a.repo.listProjects()[0];
    for (const path of [
      "/api/auth/me",
      "/api/projects",
      `/api/projects/${scene.id}`,
      `/api/projects/${scene.id}/scenes`,
      "/api/scenes/unknown",
      "/api/floors/unknown/entities",
      "/api/admin/users",
      "/api/admin/future-tool",
    ])
      await request(a.app).get(path).expect(401);
    for (const path of [
      "/api/projects",
      "/api/scenes/unknown/corrections",
      "/api/scenes/unknown/verifications",
      "/api/clarifications/unknown/answer",
    ])
      await request(a.app).post(path).send({}).expect(401);
    await request(a.app).put("/api/scenes/unknown").send({}).expect(401);
    await agent.get("/api/projects").expect(200);
    await agent.get("/api/admin/users").expect(403);
    await agent.get(`/api/admin/users/${user.id}`).expect(403);
    await agent
      .post("/api/admin/users")
      .send({ ...input, role: "ADMIN" })
      .expect(403);
    await agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ role: "ADMIN" })
      .expect(403);
    for (const action of ["disable", "enable", "reset-password"])
      await agent
        .post(`/api/admin/users/${user.id}/${action}`)
        .send({ newPassword: testPassword })
        .expect(403);
    await agent.get("/api/admin/future-tool").expect(403);
    await agent
      .patch("/api/account")
      .send({ name: "Hacker", role: "ADMIN" })
      .expect(400);
    expectSafe((await a.agent.get("/api/admin/users").expect(200)).body);
    await request(a.app).get("/api/health").expect(200);
  });
  it("creates, edits, promotes and demotes users; validates fields and duplicate email", async () => {
    const a = await setup(),
      { user, agent } = await addUser(a);
    const createdAdmin = await a.agent
      .post("/api/admin/users")
      .send({ ...input, email: "second-admin@example.test", role: "ADMIN" })
      .expect(201);
    expectSafe(createdAdmin.body);
    await a.agent
      .post("/api/admin/users")
      .send({ ...input, email: " USER@EXAMPLE.TEST " })
      .expect(409);
    const edited = await a.agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ name: " New name ", role: "ADMIN" })
      .expect(200);
    expect(edited.body.name).toBe("New name");
    expectSafe(edited.body);
    await agent.get("/api/admin/users").expect(200);
    await a.agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ role: "USER" })
      .expect(200);
    await agent.get("/api/admin/users").expect(403);
    await a.agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ role: "SUPERADMIN" })
      .expect(400);
    await a.agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ passwordHash: "injected" })
      .expect(400);
    await a.agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ email: a.admin.email })
      .expect(409);
    await a.agent
      .get("/api/admin/users/11111111-1111-4111-8111-111111111111")
      .expect(404);
    await a.agent
      .patch(`/api/admin/users/${user.id}`)
      .send({ email: "new@example.test" })
      .expect(200);
    await agent.get("/api/auth/me").expect(401);
  });
  it("protects the final active administrator and refuses duplicate bootstrap", async () => {
    const a = await setup();
    for (const patch of [{ role: "USER" }, { status: "DISABLED" }]) {
      const r = await a.agent
        .patch(`/api/admin/users/${a.admin.id}`)
        .send(patch)
        .expect(400);
      expect(r.body.code).toBe("USER_LAST_ADMIN_PROTECTED");
    }
    await a.agent.post(`/api/admin/users/${a.admin.id}/disable`).expect(400);
    await expect(
      a.auth.bootstrap({
        name: "Another admin",
        email: "other@example.test",
        password: testPassword,
      }),
    ).rejects.toThrow(/already exists/);
    expect(a.auth.repo.list()).toHaveLength(1);
  });
  it("resets passwords transactionally, invalidates sessions and rejects the old password", async () => {
    const a = await setup(),
      { user, agent } = await addUser(a);
    await a.agent
      .post(`/api/admin/users/${user.id}/reset-password`)
      .send({ newPassword: "short" })
      .expect(400);
    await agent.get("/api/auth/me").expect(200);
    const newPassword = "A replacement test passphrase!";
    await a.agent
      .post(`/api/admin/users/${user.id}/reset-password`)
      .send({ newPassword })
      .expect(200);
    await agent.get("/api/auth/me").expect(401);
    await agent
      .post("/api/auth/login")
      .send({ email: input.email, password: testPassword })
      .expect(401);
    await agent
      .post("/api/auth/login")
      .send({ email: input.email, password: newPassword })
      .expect(200);
  });
  it("changes own name/password only after current-password verification and preserves only current session", async () => {
    const a = await setup(),
      { agent } = await addUser(a);
    const other = request.agent(a.app).set("X-Habitat-Request", "1");
    await other
      .post("/api/auth/login")
      .send({ email: input.email, password: testPassword })
      .expect(200);
    const newPassword = "A changed own passphrase!";
    await agent
      .post("/api/account/change-password")
      .send({ currentPassword: "incorrect", newPassword })
      .expect(400);
    await other.get("/api/auth/me").expect(200);
    const profile = await agent
      .patch("/api/account")
      .send({ name: " Updated name " })
      .expect(200);
    expect(profile.body.name).toBe("Updated name");
    expectSafe(profile.body);
    await agent
      .post("/api/account/change-password")
      .send({ currentPassword: testPassword, newPassword })
      .expect(200);
    await agent.get("/api/auth/me").expect(200);
    await other.get("/api/auth/me").expect(401);
    await agent.post("/api/auth/logout").expect(200);
    await agent
      .post("/api/auth/login")
      .send({ email: input.email, password: newPassword })
      .expect(200);
  });
});

it("rechecks email and admin session after asynchronous password work", async () => {
  const a = await setup(),
    { user, agent } = await addUser(a);
  const pendingLogin = a.auth.login(input.email, testPassword);
  a.auth.updateUser(user.id, { email: "changed-during-login@example.test" });
  await expect(pendingLogin).rejects.toMatchObject({
    code: "AUTH_INVALID_CREDENTIALS",
  });
  await agent
    .post("/api/auth/login")
    .send({
      email: "changed-during-login@example.test",
      password: testPassword,
    })
    .expect(200);
  const adminLogin = await a.agent
    .post("/api/auth/login")
    .send({ email: a.admin.email, password: testPassword })
    .expect(200);
  const actor = a.auth.authenticate(cookieOf(adminLogin).split("=")[1]);
  const previousHash = a.auth.repo.require(user.id).passwordHash;
  const pendingReset = a.auth.resetPassword(
    user.id,
    "Reset during revocation!",
    actor,
  );
  a.auth.repo.revokeUserSessions(a.admin.id);
  await expect(pendingReset).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(a.auth.repo.require(user.id).passwordHash).toBe(previousHash);
  await agent.get("/api/auth/me").expect(200);
});

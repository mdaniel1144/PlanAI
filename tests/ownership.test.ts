import { afterEach, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../server/src/app";
import { testPassword } from "./auth-helper";
import { createFixture } from "@habitat/domain/fixture";
const apps: ReturnType<typeof createApp>[] = [];
afterEach(() => apps.splice(0).forEach((a) => a.close()));
it("enforces ownership through every project, scene, floor and clarification route", async () => {
  const a = createApp(":memory:", "/tmp/ownership-unused");
  apps.push(a);
  const admin = await a.auth.bootstrap({
    email: "admin@own.test",
    name: "Admin",
    password: testPassword,
  });
  const u = await a.auth.createUser({
    email: "a@own.test",
    name: "A",
    role: "USER",
    password: testPassword,
  });
  const v = await a.auth.createUser({
    email: "b@own.test",
    name: "B",
    role: "USER",
    password: testPassword,
  });
  async function login(email: string) {
    const agent = request.agent(a.app).set("X-Habitat-Request", "1");
    await agent
      .post("/api/auth/login")
      .send({ email, password: testPassword })
      .expect(200);
    return agent;
  }
  const root = await login(admin.email),
    one = await login(u.email),
    two = await login(v.email);
  const s = createFixture(),
    base = `/api/scenes/${s.id}`;
  expect((await one.get("/api/projects")).body).toEqual([]);
  await one.get(`/api/projects/${s.projectId}`).expect(403);
  await root.get(`/api/projects/${s.projectId}`).expect(200);
  const created = await one
    .post("/api/projects")
    .send({ name: "Owned" })
    .expect(201);
  expect(created.body.ownerUserId).toBe(u.id);
  expect(
    (await one.get("/api/projects")).body.map((p: { id: string }) => p.id),
  ).toEqual([created.body.id]);
  await two.get(`/api/projects/${created.body.id}`).expect(403);
  await one
    .patch(`/api/admin/projects/${s.projectId}/owner`)
    .send({ ownerUserId: u.id })
    .expect(403);
  await root
    .patch(`/api/admin/projects/${s.projectId}/owner`)
    .send({ ownerUserId: u.id })
    .expect(200);
  for (const path of [
    `/api/projects/${s.projectId}`,
    `/api/projects/${s.projectId}/scenes`,
    base,
    `${base}/floors`,
    `${base}/issues`,
    `${base}/clarifications`,
    `/api/floors/${s.floors[0].id}/entities`,
  ]) {
    await one.get(path).expect(200);
    await two.get(path).expect(403);
    await root.get(path).expect(200);
  }
  for (const path of [
    `${base}/corrections`,
    `${base}/verifications`,
    `/api/projects/${s.projectId}/scenes`,
  ])
    await two.post(path).send({}).expect(403);
  await two.put(base).send({}).expect(403);
  const cid = "10000000-0000-4000-8000-000000000001";
  a.repo.db.sqlite
    .prepare("INSERT INTO clarifications VALUES (?,?,?,?,?,?)")
    .run(cid, s.id, null, 1, "Question", null);
  await two
    .post(`/api/clarifications/${cid}/answer`)
    .send({ answer: "No" })
    .expect(403);
  await one
    .post(`/api/clarifications/${cid}/answer`)
    .send({ answer: "Yes" })
    .expect(200);
  a.auth.updateUser(v.id, { status: "DISABLED" });
  await root
    .patch(`/api/admin/projects/${s.projectId}/owner`)
    .send({ ownerUserId: v.id })
    .expect(400);
  expect(a.repo.db.sqlite.pragma("foreign_key_check")).toEqual([]);
});

import { it, expect } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/src/app";
import { testPassword } from "./auth-helper";
it("persists themes and units in the existing user row, validates ownership and partial updates, restores on another session", async () => {
  const root = mkdtempSync(join(tmpdir(), "display-api-"));
  const instance = createApp(join(root, "db.sqlite"), join(root, "storage"));
  try {
    const a = await instance.auth.createUser({
      email: "a@example.test",
      name: "A",
      role: "USER",
      password: testPassword,
    });
    const b = await instance.auth.createUser({
      email: "b@example.test",
      name: "B",
      role: "USER",
      password: testPassword,
    });
    const client = request.agent(instance.app).set("X-Habitat-Request", "1");
    await client
      .post("/api/auth/login")
      .send({ email: a.email, password: testPassword })
      .expect(200);
    const before = instance.repo.db.sqlite
      .prepare("SELECT * FROM entities")
      .all();
    const first = await client
      .patch("/api/account/display")
      .send({ theme: "blue" })
      .expect(200);
    expect(first.body).toMatchObject({
      theme: "blue",
      lengthDisplayUnit: "CM",
      displayRevision: 1,
    });
    const second = await client
      .patch("/api/account/display")
      .send({ lengthDisplayUnit: "M" })
      .expect(200);
    expect(second.body).toMatchObject({
      theme: "blue",
      lengthDisplayUnit: "M",
      displayRevision: 2,
    });
    expect(
      instance.repo.db.sqlite
        .prepare(
          "SELECT theme,length_display_unit,display_revision FROM users WHERE id=?",
        )
        .get(a.id),
    ).toEqual({
      theme: "blue",
      length_display_unit: "M",
      display_revision: 2,
    });
    for (const body of [
      { theme: "neon" },
      { theme: "studio-light" },
      { theme: "midnight-cobalt" },
      { lengthDisplayUnit: "FT" },
      {},
      { theme: "night", userId: b.id },
    ])
      await client.patch("/api/account/display").send(body).expect(400);
    await client
      .patch("/api/account/display")
      .set("X-Habitat-User", b.id)
      .send({ theme: "night" })
      .expect(409);
    await request(instance.app)
      .patch("/api/account/display")
      .set("X-Habitat-Request", "1")
      .send({ theme: "night" })
      .expect(401);
    expect(instance.auth.repo.require(b.id)).toMatchObject({
      theme: "blue",
      lengthDisplayUnit: "CM",
      displayRevision: 0,
    });
    const deviceB = request.agent(instance.app).set("X-Habitat-Request", "1");
    expect(
      (
        await deviceB
          .post("/api/auth/login")
          .send({ email: a.email, password: testPassword })
          .expect(200)
      ).body,
    ).toMatchObject({ theme: "blue", lengthDisplayUnit: "M" });
    expect(
      instance.repo.db.sqlite.prepare("SELECT * FROM entities").all(),
    ).toEqual(before);
    // Database constraints also protect writes outside the route.
    expect(() =>
      instance.repo.db.sqlite
        .prepare("UPDATE users SET theme='invalid' WHERE id=?")
        .run(a.id),
    ).toThrow();
  } finally {
    instance.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("migrates retired themes to Blue while preserving users, units and referencing sessions", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, length_display_unit TEXT NOT NULL DEFAULT 'CM', updated_at TEXT NOT NULL);
      CREATE TABLE sessions(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id));`);
    db.exec(
      readFileSync(
        new URL(
          "../server/migrations/0014_display_preferences.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const theme of [
      "studio-light",
      "midnight-cobalt",
      "night",
      "terra",
      "sage-stone",
    ]) {
      db.prepare(
        "INSERT INTO users(id,theme,length_display_unit,updated_at) VALUES (?,?,'M','2026-10-06T10:00:00.000Z')",
      ).run(theme, theme);
      db.prepare("INSERT INTO sessions VALUES (?,?)").run(theme, theme);
    }
    db.exec(
      readFileSync(
        new URL("../server/migrations/0015_blue_theme.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(
      db
        .prepare(
          "SELECT id,theme,length_display_unit,display_revision FROM users ORDER BY id",
        )
        .all(),
    ).toEqual([
      {
        id: "midnight-cobalt",
        theme: "blue",
        length_display_unit: "M",
        display_revision: 1,
      },
      {
        id: "night",
        theme: "night",
        length_display_unit: "M",
        display_revision: 0,
      },
      {
        id: "sage-stone",
        theme: "sage-stone",
        length_display_unit: "M",
        display_revision: 0,
      },
      {
        id: "studio-light",
        theme: "blue",
        length_display_unit: "M",
        display_revision: 1,
      },
      {
        id: "terra",
        theme: "terra",
        length_display_unit: "M",
        display_revision: 0,
      },
    ]);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM sessions JOIN users ON users.id=sessions.user_id",
        )
        .get(),
    ).toEqual({ n: 5 });
    expect(db.pragma("foreign_key_check")).toEqual([]);
    for (const theme of ["studio-light", "midnight-cobalt"])
      expect(() =>
        db.prepare("UPDATE users SET theme=? WHERE id='night'").run(theme),
      ).toThrow();
    db.prepare(
      "INSERT INTO users(id,updated_at) VALUES ('new','2026-10-06T10:00:00.000Z')",
    ).run();
    expect(db.prepare("SELECT theme FROM users WHERE id='new'").get()).toEqual({
      theme: "blue",
    });
  } finally {
    db.close();
  }
});

import request from "supertest";
import type { createApp } from "../server/src/app";
export const testPassword = "A long test passphrase 42!";
export async function authenticatedAgent(
  instance: ReturnType<typeof createApp>,
) {
  const email = "editor@example.test";
  if (!instance.auth.repo.byEmail(email))
    await instance.auth.createUser({
      name: "Test editor",
      email,
      role: "USER",
      password: testPassword,
    });
  instance.repo.db.sqlite
    .prepare("UPDATE projects SET owner_user_id=? WHERE owner_user_id IS NULL")
    .run(instance.auth.repo.byEmail(email)!.id);
  const agent = request.agent(instance.app).set("X-Habitat-Request", "1");
  await agent
    .post("/api/auth/login")
    .send({ email, password: testPassword })
    .expect(200);
  return agent;
}

import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { createApp } from "../../server/src/app";
const root = await mkdtemp(join(tmpdir(), "habitat-e2e-"));
const { app, close, auth, repo } = createApp(
  join(root, "test.sqlite"),
  join(root, "storage"),
);
await auth.bootstrap({
  email: "admin@example.test",
  name: "Test Administrator",
  password: "Admin test passphrase 42!",
});
await auth.createUser({
  email: "user@example.test",
  name: "Test Architect",
  role: "USER",
  password: "User test passphrase 42!",
});
await auth.createUser({
  email: "editor@example.test",
  name: "Test Editor",
  role: "USER",
  password: "Editor test passphrase 42!",
});
repo.db.sqlite
  .prepare(
    "UPDATE users SET length_display_unit='M' WHERE email='editor@example.test'",
  )
  .run();
repo.db.sqlite
  .prepare("UPDATE projects SET owner_user_id=? WHERE owner_user_id IS NULL")
  .run(auth.repo.byEmail("editor@example.test")!.id);
const api = app.listen(3187, "127.0.0.1");
const web = await createServer({
  configFile: fileURLToPath(
    new URL("../../frontend/vite.config.ts", import.meta.url),
  ),
  server: {
    host: "127.0.0.1",
    port: 4187,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:3187", changeOrigin: false } },
  },
});
// Do not start timed browser assertions while Vite is compiling the lazy 3D graph.
let ready = false;
web.middlewares.use((req, res, next) => {
  if (req.url === "/__e2e/ready") {
    res.statusCode = ready ? 200 : 503;
    res.end(ready ? "ready" : "warming");
    return;
  }
  next();
});
await web.listen();
await web.warmupRequest("/src/main.tsx");
await web.warmupRequest("/src/features/viewer3d/SceneView.tsx");
await web.warmupRequest("/src/features/items/model-cache.ts");
await web.waitForRequestsIdle();
ready = true;
const cleanup = async () => {
  await web.close();
  api.close();
  close();
  await rm(root, { recursive: true, force: true });
  process.exit(0);
};
process.on("SIGTERM", () => void cleanup());
process.on("SIGINT", () => void cleanup());

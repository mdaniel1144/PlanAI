import { databasePath, storagePath } from "./runtime-paths";
import { createApp } from "./app";
const { app, close } = createApp(
  databasePath(process.env.DATABASE_PATH),
  storagePath(process.env.STORAGE_PATH),
);
const server = app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log(`Habitat API http://127.0.0.1:${process.env.PORT ?? 3001}`),
);
process.on("SIGTERM", () => server.close(close));
process.on("SIGINT", () => server.close(close));

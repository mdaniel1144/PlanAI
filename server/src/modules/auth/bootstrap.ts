import { openDatabase } from "../../infrastructure/database/database";
import { databasePath } from "../../runtime-paths";
import { AuthRepository } from "./repository";
import { AuthService } from "./service";
import { authConfig } from "./config";
import { AuthError } from "./errors";
const db = openDatabase(databasePath(process.env.DATABASE_PATH));
try {
  const {
    ADMIN_EMAIL: email,
    ADMIN_NAME: name,
    ADMIN_PASSWORD: password,
  } = process.env;
  delete process.env.ADMIN_PASSWORD;
  if (!email || !name || !password)
    throw new Error(
      "Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD for this explicit operation.",
    );
  await new AuthService(new AuthRepository(db.sqlite), authConfig()).bootstrap({
    email,
    name,
    password,
  });
  console.log("Administrator created.");
} catch (error) {
  console.error(
    error instanceof AuthError
      ? error.message
      : "Bootstrap failed. Supply a valid email, name and a 12–128 character password using ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.",
  );
  process.exitCode = 1;
} finally {
  db.sqlite.close();
}

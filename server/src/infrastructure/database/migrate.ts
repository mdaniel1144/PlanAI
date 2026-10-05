import { removeRetiredFiles } from "./remove-retired-files";
import { databasePath, storagePath } from "../../runtime-paths";
import { openDatabase } from "./database";
const db = openDatabase(databasePath(process.env.DATABASE_PATH));
removeRetiredFiles(db.sqlite, storagePath(process.env.STORAGE_PATH));
const row = db.sqlite.prepare("SELECT COUNT(*) AS n FROM migrations").get() as {
  n: number;
};
console.log(`All ${row.n} migrations applied; foreign keys enabled.`);
db.sqlite.close();

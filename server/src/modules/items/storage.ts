import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  rmSync,
  existsSync,
  lstatSync,
  readdirSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fail } from "./errors";
// All keys are generated here. No original filenames form any part of a path.
export class CatalogAssetStorage {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private path(key: string) {
    if (
      !/^items\/[0-9a-f-]{36}\/(models|textures|thumbnails)\/[0-9a-f-]{36}$/.test(
        key,
      )
    )
      fail("ITEM_STORAGE_KEY_INVALID", "Invalid asset key");
    const segments = key.split("/");
    let current = this.root;
    for (const segment of segments) {
      current = join(current, segment);
      if (existsSync(current) && lstatSync(current).isSymbolicLink())
        fail("ITEM_STORAGE_KEY_INVALID", "Asset symlinks are not supported");
    }
    return current;
  }
  put(
    itemId: string,
    kind: "models" | "textures" | "thumbnails",
    bytes: Buffer,
  ) {
    const key = `items/${itemId}/${kind}/${randomUUID()}`,
      path = this.path(key),
      parent = resolve(path, "..");
    mkdirSync(parent, { recursive: true });
    const staging = `${path}.pending`;
    try {
      writeFileSync(staging, bytes, { flag: "wx", mode: 0o600 });
      renameSync(staging, path);
      return key;
    } catch (error) {
      rmSync(staging, { force: true });
      rmSync(path, { force: true });
      throw error;
    }
  }
  read(key: string) {
    return readFileSync(this.path(key));
  }
  exists(key: string) {
    return existsSync(this.path(key));
  }
  remove(key: string) {
    rmSync(this.path(key), { force: true });
  }
  // Startup recovery also handles interruption between file promotion and DB commit.
  recover(registered: Set<string>) {
    const base = join(this.root, "items");
    if (!existsSync(base)) return;
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) visit(path);
        else {
          const key = path.slice(this.root.length + 1);
          if (!registered.has(key)) rmSync(path, { force: true });
        }
      }
    };
    visit(base);
  }
}

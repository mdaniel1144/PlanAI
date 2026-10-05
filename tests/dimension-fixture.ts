import type { Database } from "better-sqlite3";
export function verifiedDimensions<
  T extends { width: number; depth: number; height: number },
>(d: T) {
  return {
    ...d,
    dimensionSource: "MANUAL_MEASUREMENT" as const,
    dimensionsVerified: true as const,
    unusualDimensionsAcknowledged: true,
    renderedBoundsMeters: {
      min: [-d.width / 2, 0, -d.depth / 2] as [number, number, number],
      max: [d.width / 2, d.height, d.depth / 2] as [number, number, number],
    },
  };
}
export function dimensionAdmin(db: Database) {
  const id = "26a62b66-f95b-449b-9ab8-17d124cdf5e6";
  db.prepare(
    "INSERT OR IGNORE INTO users(id,email,name,password_hash,role,status,created_at,updated_at) VALUES(?,'dimension-fixture@example.test','Dimension fixture','test-only','ADMIN','ACTIVE','now','now')",
  ).run(id);
  return id;
}

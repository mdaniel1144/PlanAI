import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { passwordSchema } from "@habitat/contracts";
import { AuthError } from "./errors";
// Bound expensive work globally so simultaneous requests cannot exhaust memory.
let active = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (active >= 2)
    throw new AuthError(429, "AUTH_BUSY", "Please try again shortly.");
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        salt,
        64,
        { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
  } finally {
    active--;
  }
}
export async function hashPassword(password: string) {
  passwordSchema.parse(password);
  const salt = randomBytes(16).toString("hex");
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
// Missing accounts take the same expensive verification path as existing accounts.
const dummyHash = `scrypt$131072$8$1$${"00".repeat(16)}$${"00".repeat(64)}`;
export async function verifyPassword(password: string, hash = dummyHash) {
  const parts = hash.split("$");
  if (
    parts.length !== 6 ||
    parts.slice(0, 4).join("$") !== "scrypt$131072$8$1" ||
    !/^[a-f0-9]{32}$/.test(parts[4]) ||
    !/^[a-f0-9]{128}$/.test(parts[5])
  )
    return false;
  const key = await derive(password, parts[4]);
  return timingSafeEqual(key, Buffer.from(parts[5], "hex"));
}

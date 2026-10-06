import { z } from "zod";
import { displayPreferencesSchema } from "@habitat/contracts";
import type { DisplayPreferences } from "@habitat/contracts";
export const cacheKey = (userId: string) =>
  `habitat:display-preferences:${userId}`;
const cacheSchema = z.object({
  version: z.literal(1),
  userId: z.string(),
  cachedAt: z.string().datetime(),
  preferences: displayPreferencesSchema,
});
export type PreferenceStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
export function readCache(
  storage: PreferenceStorage | undefined,
  userId: string,
): DisplayPreferences | null {
  try {
    const raw = storage?.getItem(cacheKey(userId));
    if (!raw) return null;
    const parsed = cacheSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.userId === userId)
      return parsed.data.preferences;
    storage?.removeItem(cacheKey(userId));
  } catch {
    /* Storage denial or damaged cache must not block authentication. */
  }
  return null;
}
export function writeCache(
  storage: PreferenceStorage | undefined,
  userId: string,
  preferences: DisplayPreferences,
) {
  try {
    storage?.setItem(
      cacheKey(userId),
      JSON.stringify({
        version: 1,
        userId,
        cachedAt: new Date().toISOString(),
        preferences,
      }),
    );
  } catch {
    /* Server persistence remains available when storage is full/disabled. */
  }
}
export function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

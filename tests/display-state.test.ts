import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  type DisplayPreferences,
  type UpdateDisplayRequest,
} from "@habitat/contracts";
import { DisplayStore } from "../frontend/src/display/store";
import { cacheKey, readCache, writeCache } from "../frontend/src/display/cache";
const server = (
  overrides: Partial<DisplayPreferences> = {},
): DisplayPreferences => ({
  ...DEFAULT_DISPLAY_PREFERENCES,
  displayRevision: 1,
  displayUpdatedAt: "2026-10-06T10:00:00.000Z",
  ...overrides,
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
afterEach(() => vi.useRealTimers());
describe("display cache and runtime", () => {
  it("hydrates versioned user-scoped cache without fetching and resets on account changes", () => {
    const cache = storage(),
      save = vi.fn(),
      apply = vi.fn();
    writeCache(cache, "a", server({ theme: "night", lengthDisplayUnit: "M" }));
    const store = new DisplayStore({ storage: cache, save, apply });
    store.activate("a");
    expect(store.getSnapshot()).toMatchObject({
      theme: "night",
      lengthDisplayUnit: "M",
    });
    expect(apply).toHaveBeenLastCalledWith("night");
    store.activate("b");
    expect(store.getSnapshot()).toMatchObject({
      ...DEFAULT_DISPLAY_PREFERENCES,
      userId: "b",
    });
    expect(save).not.toHaveBeenCalled();
    store.reset();
    expect(store.getSnapshot().userId).toBeNull();
    expect(readCache(cache, "a")?.theme).toBe("night");
  });
  it.each([
    "{bad",
    JSON.stringify({ version: 0 }),
    JSON.stringify({
      version: 1,
      userId: "b",
      cachedAt: "2026-10-06T10:00:00.000Z",
      preferences: server(),
    }),
  ])("discards malformed, incompatible, or mismatched cache: %s", (value) => {
    const cache = storage();
    cache.setItem(cacheKey("a"), value);
    expect(readCache(cache, "a")).toBeNull();
  });
  it("recovers from unavailable storage and never trusts a cached revision over initial server authority", () => {
    const cache = storage();
    writeCache(cache, "a", server({ theme: "night", displayRevision: 999 }));
    const store = new DisplayStore({
      storage: cache,
      save: vi.fn(),
      apply: vi.fn(),
    });
    store.activate("a");
    store.reconcile("a", server({ theme: "terra" }));
    expect(store.getSnapshot().theme).toBe("terra");
    expect(
      readCache(
        {
          ...cache,
          getItem: () => {
            throw new Error();
          },
        },
        "a",
      ),
    ).toBeNull();
  });
  it("applies theme and measurement optimistically; serializes/coalesces writes without stale response rollback", async () => {
    const cache = storage(),
      first = deferred<DisplayPreferences>(),
      second = deferred<DisplayPreferences>();
    const save = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const store = new DisplayStore({ storage: cache, save, apply: vi.fn() });
    store.activate("a");
    store.reconcile("a", server());
    store.update({ theme: "night" });
    store.update({ theme: "terra" });
    store.update({ lengthDisplayUnit: "M" });
    expect(store.getSnapshot()).toMatchObject({
      theme: "terra",
      lengthDisplayUnit: "M",
      sync: "saving",
    });
    expect(readCache(cache, "a")).toMatchObject({
      theme: "terra",
      lengthDisplayUnit: "M",
    });
    expect(save).toHaveBeenCalledTimes(1);
    store.reconcile("a", server());
    expect(store.getSnapshot().theme).toBe("terra");
    first.resolve(server({ theme: "night", displayRevision: 2 }));
    await tick();
    expect(store.getSnapshot()).toMatchObject({
      theme: "terra",
      lengthDisplayUnit: "M",
    });
    expect(save.mock.calls[1]?.[0]).toEqual({
      theme: "terra",
      lengthDisplayUnit: "M",
    });
    second.resolve(
      server({ theme: "terra", lengthDisplayUnit: "M", displayRevision: 3 }),
    );
    await tick();
    expect(store.getSnapshot().sync).toBe("saved");
    store.reconcile("a", server({ theme: "night", displayRevision: 2 }));
    expect(store.getSnapshot().theme).toBe("terra");
  });
  it("keeps failed selections visible and retries with the latest intent", async () => {
    vi.useFakeTimers();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (patch: UpdateDisplayRequest) =>
        server({ ...patch, displayRevision: 2 }),
      );
    const store = new DisplayStore({ save, apply: vi.fn() });
    store.activate("a");
    store.update({ theme: "night" });
    await tick();
    expect(store.getSnapshot()).toMatchObject({
      theme: "night",
      sync: "offline",
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getSnapshot()).toMatchObject({
      theme: "night",
      sync: "saved",
    });
    store.reset();
  });
  it("aborts prior-account writes and ignores their late completions", async () => {
    const request = deferred<DisplayPreferences>(),
      save = vi.fn(() => request.promise);
    const store = new DisplayStore({ save, apply: vi.fn() });
    store.activate("a");
    store.update({ theme: "terra" });
    store.activate("b");
    request.resolve(server({ theme: "terra" }));
    await tick();
    expect(store.getSnapshot()).toMatchObject({
      userId: "b",
      theme: "blue",
    });
  });
  it("reconciles newer server values, avoids unchanged notifications, and restores after cache clearing", () => {
    const cache = storage(),
      store = new DisplayStore({
        storage: cache,
        save: vi.fn(),
        apply: vi.fn(),
      });
    store.activate("a");
    const listener = vi.fn();
    store.subscribe(listener);
    store.reconcile("a", server({ theme: "night" }));
    store.reconcile("a", server({ theme: "night" }));
    expect(listener).toHaveBeenCalledTimes(1);
    cache.removeItem(cacheKey("a"));
    store.reset();
    store.activate("a");
    store.reconcile("a", server({ theme: "night" }));
    expect(readCache(cache, "a")?.theme).toBe("night");
  });
});

it("theme text and accent pairs maintain WCAG AA contrast on primary and secondary surfaces", async () => {
  const { themes } = await import("../frontend/src/display/themes");
  const luminance = (hex: string) => {
    const [r, g, b] = hex
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
  };
  const contrast = (a: string, b: string) => {
    const x = luminance(a),
      y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  for (const theme of Object.values(themes)) {
    const p = theme.tokens;
    for (const text of ["--text-primary", "--text-secondary"] as const)
      for (const bg of [
        "--app-bg",
        "--surface-primary",
        "--surface-secondary",
      ] as const)
        expect(
          contrast(p[text], p[bg]),
          `${theme.name} ${text} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(p["--accent-primary"], p["--accent-foreground"]),
      theme.name,
    ).toBeGreaterThanOrEqual(4.5);
  }
});

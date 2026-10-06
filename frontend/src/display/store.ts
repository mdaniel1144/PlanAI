import {
  DEFAULT_DISPLAY_PREFERENCES,
  displayPreferencesSchema,
  updateDisplayRequest,
} from "@habitat/contracts";
import type {
  DisplayPreferences,
  UpdateDisplayRequest,
} from "@habitat/contracts";
import { readCache, writeCache, type PreferenceStorage } from "./cache";

const defaults: DisplayPreferences = {
  ...DEFAULT_DISPLAY_PREFERENCES,
  displayUpdatedAt: "1970-01-01T00:00:00.000Z",
  displayRevision: 0,
};
export type DisplayState = DisplayPreferences & {
  userId: string | null;
  sync: "saved" | "saving" | "offline";
};
type Dependencies = {
  storage?: PreferenceStorage;
  save: (
    patch: UpdateDisplayRequest,
    userId: string,
    signal: AbortSignal,
  ) => Promise<DisplayPreferences>;
  apply: (theme: DisplayPreferences["theme"]) => void;
  saved?: (userId: string) => void;
};
/** One runtime store per auth provider. No component/route initiates preference reads. */
export class DisplayStore {
  private state: DisplayState = { ...defaults, userId: null, sync: "saved" };
  private listeners = new Set<() => void>();
  private pending: UpdateDisplayRequest = {};
  private epoch = 0;
  private serverRevision = -1;
  private controller?: AbortController;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private attempt = 0;
  private deps: Dependencies;
  constructor(deps: Dependencies) {
    this.deps = deps;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: DisplayState) {
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    this.deps.apply(next.theme);
    if (next.userId)
      writeCache(
        this.deps.storage,
        next.userId,
        displayPreferencesSchema.parse(next),
      );
    this.listeners.forEach((listener) => listener());
  }
  /** Only call with an identity verified by the server, never a cached account hint. */
  activate(userId: string) {
    if (this.state.userId === userId) return;
    this.reset();
    const cached = readCache(this.deps.storage, userId);
    this.publish({ ...(cached ?? defaults), userId, sync: "saved" });
  }
  reconcile(userId: string, server: DisplayPreferences) {
    if (
      userId !== this.state.userId ||
      this.controller ||
      Object.keys(this.pending).length
    )
      return;
    if (server.displayRevision < this.serverRevision) return;
    this.serverRevision = server.displayRevision;
    this.publish({
      ...displayPreferencesSchema.parse(server),
      userId,
      sync: "saved",
    });
  }
  update = (input: UpdateDisplayRequest) => {
    if (!this.state.userId) return;
    const patch = updateDisplayRequest.parse(input);
    this.pending = { ...this.pending, ...patch };
    this.publish({ ...this.state, ...patch, sync: "saving" });
    void this.flush();
  };
  retry = () => {
    clearTimeout(this.retryTimer);
    void this.flush();
  };
  private async flush() {
    const userId = this.state.userId;
    if (!userId || this.controller || !Object.keys(this.pending).length) return;
    clearTimeout(this.retryTimer);
    const epoch = this.epoch,
      patch = this.pending,
      controller = new AbortController();
    this.pending = {};
    this.controller = controller;
    try {
      const server = await this.deps.save(patch, userId, controller.signal);
      if (epoch !== this.epoch) return;
      this.attempt = 0;
      this.serverRevision = server.displayRevision;
      this.publish({
        ...displayPreferencesSchema.parse(server),
        ...this.pending,
        userId,
        sync: Object.keys(this.pending).length ? "saving" : "saved",
      });
      this.deps.saved?.(userId);
    } catch {
      if (epoch !== this.epoch) return;
      this.pending = { ...patch, ...this.pending };
      this.publish({ ...this.state, sync: "offline" });
      this.retryTimer = setTimeout(
        this.retry,
        Math.min(30000, 2000 * 2 ** this.attempt++),
      );
    } finally {
      if (epoch === this.epoch) {
        this.controller = undefined;
        if (this.state.sync !== "offline") void this.flush();
      }
    }
  }
  reset = () => {
    this.epoch++;
    this.serverRevision = -1;
    this.controller?.abort();
    this.controller = undefined;
    clearTimeout(this.retryTimer);
    this.pending = {};
    this.attempt = 0;
    this.publish({ ...defaults, userId: null, sync: "saved" });
    this.deps.apply(defaults.theme);
  };
}

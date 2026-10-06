import { createContext, useContext, useSyncExternalStore } from "react";
import type { DisplayStore } from "./store";
export const DisplayContext = createContext<DisplayStore | null>(null);
export function useDisplayPreferences() {
  const store = useContext(DisplayContext);
  if (!store) throw new Error("Display preferences require AuthProvider");
  const preferences = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return { ...preferences, update: store.update, retry: store.retry };
}

import type { HomeScene } from "@habitat/domain";
export type DraftHistory = {
  past: HomeScene[];
  present: HomeScene;
  future: HomeScene[];
};
export function draftHistory(scene: HomeScene): DraftHistory {
  return { past: [], present: scene, future: [] };
}
export function pushDraft(h: DraftHistory, scene: HomeScene): DraftHistory {
  return JSON.stringify(h.present) === JSON.stringify(scene)
    ? h
    : { past: [...h.past, h.present].slice(-100), present: scene, future: [] };
}
export function undoDraft(h: DraftHistory): DraftHistory {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redoDraft(h: DraftHistory): DraftHistory {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}

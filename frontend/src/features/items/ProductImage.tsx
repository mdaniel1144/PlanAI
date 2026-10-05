import { useEffect, useRef, useState } from "react";
import type { Item } from "@habitat/domain";
import { ApiError } from "../../api/client";
import { catalogClient } from "./api";

export function ProductImage({
  item,
  disabled,
  onSaved,
}: {
  item: Item;
  disabled: boolean;
  onSaved: (item: Item, refreshSource?: boolean) => boolean;
}) {
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{
      key: string;
      status: "generating" | "saved" | "failed";
      detail?: string;
    } | null>(null);
  const latest = useRef({ item, onSaved });
  const attempted = useRef("");
  const signature = item.thumbnailGeneration?.signature;
  const current = item.thumbnailGeneration?.current;
  useEffect(() => {
    latest.current = { item, onSaved };
  }, [item, onSaved]);
  useEffect(() => {
    if (disabled || !signature || (current && !attempt)) return;
    const key = `${item.id}:${signature}:${attempt}`;
    if (attempted.current === key) return;
    attempted.current = key;
    const controller = new AbortController();
    let finished = false;
    const run = async () => {
      setState({ key, status: "generating" });
      try {
        const snapshot = latest.current.item;
        const { generateItemThumbnail } =
          await import("./generateItemThumbnail");
        const blob = await generateItemThumbnail(snapshot, controller.signal);
        const updated = await catalogClient.generatedThumbnail(
          snapshot,
          blob,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        if (!latest.current.onSaved(updated)) {
          attempted.current = "";
          return;
        }
        finished = true;
        setState({ key, status: "saved" });
        window.dispatchEvent(new Event("habitat:catalog-updated"));
        try {
          localStorage.setItem("habitat:catalog-updated", String(Date.now()));
        } catch {
          /* Same-tab refresh still works when storage is unavailable. */
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        finished = true;
        if (
          error instanceof ApiError &&
          error.code === "ITEM_THUMBNAIL_STALE"
        ) {
          try {
            const fresh = await catalogClient.item(item.id, true);
            if (
              !controller.signal.aborted &&
              latest.current.onSaved(fresh, true) &&
              fresh.thumbnailGeneration?.current
            ) {
              setState({ key, status: "saved" });
              return;
            }
          } catch {
            /* Keep the image and provide explicit retry. */
          }
        }
        if (!controller.signal.aborted)
          setState({
            key,
            status: "failed",
            detail: error instanceof Error ? error.message : "Rendering failed",
          });
      }
    };
    void run();
    return () => {
      controller.abort();
      if (!finished && attempted.current === key) attempted.current = "";
    };
  }, [item.id, signature, current, disabled, attempt]);
  const generating =
    state?.status === "generating" &&
    state.key === `${item.id}:${signature}:${attempt}`;
  return (
    <section
      className="product-image"
      aria-label="Product image"
      aria-busy={generating}
    >
      <h2>Product image</h2>
      {item.thumbnailAssetId && (
        <img
          className="cover-preview"
          src={`/api/item-assets/${item.thumbnailAssetId}`}
          alt="Product image"
        />
      )}
      {!signature ? (
        <p>Thumbnail will be generated after real dimensions are confirmed.</p>
      ) : (
        <>
          {generating ? (
            <p role="status">Generating thumbnail…</p>
          ) : current ? (
            <p role="status">✓ Automatically generated from 3D model</p>
          ) : null}
          {state?.status === "saved" && current && (
            <p role="status">✓ Thumbnail updated</p>
          )}
          {state?.status === "failed" && (
            <>
              <p role="alert">
                Thumbnail could not be generated from the 3D model.
              </p>
              <details>
                <summary>Advanced thumbnail details</summary>
                <p>{state.detail}</p>
              </details>
            </>
          )}
          <button
            className="button secondary"
            disabled={disabled || generating}
            onClick={() => setAttempt((n) => n + 1)}
          >
            {state?.status === "failed" ? "Try again" : "Regenerate thumbnail"}
          </button>
        </>
      )}
    </section>
  );
}

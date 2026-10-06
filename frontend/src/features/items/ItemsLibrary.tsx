import { useEffect, useRef, useState } from "react";
import { Box, Search, X } from "lucide-react";
import type { Item } from "@habitat/domain";
import { useUnits } from "../../units/useUnits";
import { catalogClient } from "./api";

type Page = Awaited<ReturnType<typeof catalogClient.list>>;
// A bounded, editor-lifetime read cache of the existing runtime API. No assets.
export function ItemsLibrary({
  open,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (id: string, variantId: string) => void;
}) {
  const units = useUnits();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const cache = useRef(
    new Map<string, { at: number; result: Promise<Page> }>(),
  );
  const taxonomy = useRef<ReturnType<typeof catalogClient.taxonomy> | null>(
    null,
  );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const invalidate = () => {
      cache.current.clear();
      taxonomy.current = null;
      setRevision((r) => r + 1);
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "habitat:catalog-updated") invalidate();
    };
    window.addEventListener("habitat:catalog-updated", invalidate);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", invalidate);
    return () => {
      window.removeEventListener("habitat:catalog-updated", invalidate);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", invalidate);
    };
  }, []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const query = new URLSearchParams({
        search: search.trim(),
        category,
        page: String(page),
        pageSize: "24",
      });
      const key = query.toString();
      let entry = cache.current.get(key);
      if (!entry || Date.now() - entry.at > 60000) {
        entry = { at: Date.now(), result: catalogClient.list(query) };
        cache.current.set(key, entry);
        if (cache.current.size > 32)
          cache.current.delete(cache.current.keys().next().value!);
      }
      taxonomy.current ??= catalogClient.taxonomy("categories");
      void Promise.all([entry.result, taxonomy.current])
        .then(([result, cats]) => {
          if (active) {
            setData(result);
            setCategories(cats);
          }
        })
        .catch((e: Error) => {
          cache.current.delete(key);
          taxonomy.current = null;
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, search, category, page, revision]);
  const choose = (item: Item) =>
    variants[item.id] ?? item.defaultVariantId ?? item.colors[0]?.id;
  return (
    <aside className="items-library" aria-label="Items library" hidden={!open}>
      <header>
        <div>
          <p className="eyebrow">Place in your space</p>
          <h2>Items</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close Items"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <label className="items-search">
        <Search size={16} />
        <input
          ref={input}
          aria-label="Search items"
          placeholder="Search items..."
          value={search}
          maxLength={120}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <label className="items-category">
        Category
        <select
          aria-label="Item category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <div className="items-library-message" role="alert">
          <p>Items are unavailable. {error}</p>
          <button
            className="button secondary"
            onClick={() => setRevision((r) => r + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <p className="items-library-status" role="status">
            {busy
              ? "Preparing item…"
              : loading
                ? "Loading items…"
                : `${data?.total ?? 0} items · Select to place`}
          </p>
          {!loading && data?.total === 0 && (
            <p className="items-library-message">No items found</p>
          )}
          <div className="items-library-grid" aria-busy={loading || busy}>
            {data?.items.map((item) => (
              <article className="items-library-card" key={item.id}>
                <button
                  disabled={busy || loading}
                  onClick={() => {
                    const id = choose(item);
                    if (id) onPick(item.id, id);
                  }}
                  aria-label={`Place ${item.name}`}
                >
                  <span className="items-library-image">
                    {item.thumbnailAssetId ? (
                      <img
                        loading="lazy"
                        src={`/api/item-assets/${item.thumbnailAssetId}`}
                        alt=""
                      />
                    ) : (
                      <Box size={30} />
                    )}
                  </span>
                  <strong>{item.name}</strong>
                  <span>{item.categoryName}</span>
                  <small>
                    {item.dimensions
                      ? `${units.value(item.dimensions.width)} × ${units.value(item.dimensions.depth)} × ${units.value(item.dimensions.height)} ${units.label}`
                      : "Dimensions unavailable"}
                  </small>
                </button>
                {item.colors.length > 1 && (
                  <select
                    aria-label={`Color for ${item.name}`}
                    value={choose(item)}
                    onChange={(e) =>
                      setVariants((v) => ({ ...v, [item.id]: e.target.value }))
                    }
                  >
                    {item.colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </article>
            ))}
          </div>
          {data && data.total > data.pageSize && (
            <nav aria-label="Items pages">
              <button
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {page} / {Math.ceil(data.total / data.pageSize)}
              </span>
              <button
                disabled={page * data.pageSize >= data.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </aside>
  );
}

import { useUnits } from "../../units/useUnits";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatPrice, type Item, type ItemVariant } from "@habitat/domain";
import { catalogClient } from "./api";
const ModelPreview = lazy(() => import("./ModelPreview"));
export function ProductDetail({
  item,
  onAdd,
}: {
  item: Item;
  onAdd?: (item: Item, variant: ItemVariant) => void;
}) {
  const units = useUnits();
  const [variantId, setVariantId] = useState(item.defaultVariantId);
  const variant = item.colors.find((v) => v.id === variantId) ?? item.colors[0];
  return (
    <div className="product-detail">
      <Suspense fallback={<p>Loading preview…</p>}>
        <ModelPreview item={item} variant={variant} />
      </Suspense>
      <div>
        <p className="eyebrow">
          {item.categoryName} · {item.brandName}
        </p>
        <h2>{item.name}</h2>
        <p>{item.description}</p>
        {variant && (
          <>
            <h3>{formatPrice(variant.priceMinor, variant.currency)}</h3>
            <p>SKU {variant.effectiveSku ?? "—"}</p>
            <label>
              Color
              <select
                value={variant.id}
                onChange={(e) => setVariantId(e.target.value)}
              >
                {item.colors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {units.value(item.width!)} × {units.value(item.depth!)} ×{" "}
              {units.value(item.height!)} {units.label}
              <br />
              <small>Width × depth × height</small>
            </p>
            {onAdd && (
              <button className="button" onClick={() => onAdd(item, variant)}>
                Add to Project
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
export function Catalog({
  admin = false,
  onAdd,
}: {
  admin?: boolean;
  onAdd?: (item: Item, variant: ItemVariant) => void;
}) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    const storage = (event: StorageEvent) => {
      if (event.key === "habitat:catalog-updated") refresh();
    };
    window.addEventListener("habitat:catalog-updated", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("habitat:catalog-updated", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [brand, setBrand] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("name"),
    [currency, setCurrency] = useState("ILS"),
    [page, setPage] = useState(1);
  const [data, setData] = useState<{
      items: Item[];
      total: number;
      pageSize: number;
    }>({ items: [], total: 0, pageSize: 24 }),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]),
    [brands, setBrands] = useState<{ id: string; name: string }[]>([]),
    [detail, setDetail] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([
      catalogClient.taxonomy("categories", admin),
      catalogClient.taxonomy("brands", admin),
    ])
      .then(([c, b]) => {
        if (active) {
          setCategories(c);
          setBrands(b);
        }
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
    };
  }, [admin]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      const query = new URLSearchParams({
        search,
        category,
        brand,
        status,
        sort,
        page: String(page),
        ...(sort.startsWith("price") ? { currency } : {}),
      });
      void catalogClient
        .list(query, admin)
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(String(e.message));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, category, brand, status, sort, currency, page, admin, revision]);
  const detailId = detail?.id;
  useEffect(() => {
    if (!detailId) return;
    let active = true;
    void catalogClient
      .item(detailId, admin)
      .then((item) => {
        if (active) setDetail(item);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [detailId, admin, revision]);
  const select = (item: Item) => {
    void catalogClient
      .item(item.id, admin)
      .then(setDetail)
      .catch((e) => setError(String(e.message)));
  };
  if (detail)
    return (
      <>
        <button className="button secondary" onClick={() => setDetail(null)}>
          ← Back to catalog
        </button>
        <ProductDetail item={detail} onAdd={onAdd} />
      </>
    );
  return (
    <div className="items-catalog">
      <div className="catalog-filters">
        <label>
          Search
          <input
            placeholder="Product name or SKU"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Category
          <select
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
        <label>
          Brand
          <select
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["DRAFT", "ACTIVE", "INACTIVE"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="name">Name</option>
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            {admin && (
              <>
                <option value="brand">Brand</option>
                <option value="category">Category</option>
                <option value="status">Status</option>
              </>
            )}
          </select>
        </label>
        {sort.startsWith("price") && (
          <label>
            Currency
            <input
              value={currency}
              maxLength={3}
              onChange={(e) => {
                setCurrency(e.target.value.toUpperCase());
                setPage(1);
              }}
            />
          </label>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      <p aria-live="polite">{busy ? "Loading…" : `${data.total} items`}</p>
      <div className="catalog-grid">
        {data.items.map((item) => {
          const variant =
              item.colors.find((v) => v.id === item.defaultVariantId) ??
              item.colors[0],
            thumb = item.thumbnailAssetId ?? variant?.thumbnailAssetId;
          const card = (
            <>
              {thumb ? (
                <img
                  loading="lazy"
                  src={`/api/item-assets/${thumb}`}
                  alt={item.name}
                />
              ) : (
                <div className="item-placeholder">No cover yet</div>
              )}
              <div className="item-card-info">
                <p className="eyebrow">
                  {item.brandName} · {item.categoryName}
                </p>
                <h3>{item.name}</h3>
                <p>
                  {variant
                    ? formatPrice(variant.priceMinor, variant.currency)
                    : "Add a color"}
                </p>
                <small>{variant?.effectiveSku}</small>
                {admin && (
                  <span className={`item-status ${item.status.toLowerCase()}`}>
                    {item.status}
                  </span>
                )}
              </div>
            </>
          );
          return admin ? (
            <Link
              className="item-card"
              key={item.id}
              to={`/admin/items/${item.id}`}
            >
              {card}
            </Link>
          ) : (
            <button
              className="item-card"
              key={item.id}
              onClick={() => select(item)}
            >
              {card}
            </button>
          );
        })}
      </div>
      {!busy && !data.items.length && <p>No items match these filters.</p>}
      <div className="catalog-pagination">
        <button
          className="button secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}
        </span>
        <button
          className="button secondary"
          disabled={page * data.pageSize >= data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

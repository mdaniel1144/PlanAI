import { useUnits } from "../../units/useUnits";
import { Dimensions } from "./Dimensions";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../../components/Layout";
import { formatPrice, type Item, type SetupStep } from "@habitat/domain";
import { moneyInput, optionalString, FormInputError } from "./forms";
import { ApiError } from "../../api/client";
import { catalogClient } from "./api";
import { Catalog } from "./Catalog";
import { ProductImage } from "./ProductImage";
import { AdvancedAppearance } from "./AdvancedAppearance";
import type { ColorTarget } from "./ModelPreview";
const ModelPreview = lazy(() => import("./ModelPreview"));
const stages = [
  "Product information",
  "3D model",
  "Dimensions & orientation",
  "Select color parts",
  "Available colors",
  "Price & SKU",
  "Review & publish",
];
const stepIds: SetupStep[] = [
  "INFORMATION",
  "MODEL",
  "DIMENSIONS",
  "COLOR_TARGETS",
  "COLORS",
  "PRICING",
  "REVIEW",
];
const values = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
const text = (d: FormData, k: string) => String(d.get(k) ?? "");
export function AdminItems() {
  return (
    <Shell>
      <main className="catalog-page">
        <div className="catalog-heading">
          <h1>Items</h1>
          <Link className="button" to="/admin/items/new">
            + Add Item
          </Link>
        </div>
        <Catalog admin />
      </main>
    </Shell>
  );
}
export function AdminItemEditor() {
  const units = useUnits();
  const { itemId } = useParams(),
    navigate = useNavigate();
  const [item, setItem] = useState<Item | null>(null),
    [stage, setStage] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [issues, setIssues] = useState<{ field: string; message: string }[]>(
    [],
  );
  const [unsaved, setUnsaved] = useState(false),
    [formVersion, setFormVersion] = useState(0);
  const [details, setDetails] = useState<string[]>([]);
  const go = (next: number) => {
    if (busyRef.current) return;
    if (unsaved) {
      setError(
        "Save your changes before changing steps, or discard them below.",
      );
      return;
    }
    setStage(next);
    setIssues([]);
    setDetails([]);
    setMessage("");
    setError("");
  };
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]),
    [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let active = true;
    const version = generation.current;
    void Promise.all([
      catalogClient.taxonomy("brands", true),
      catalogClient.taxonomy("categories", true),
      itemId && itemId !== "new"
        ? catalogClient.item(itemId, true)
        : Promise.resolve(null),
    ])
      .then(([b, c, i]) => {
        if (active) {
          setBrands(b);
          setCategories(c);
          if (version === generation.current) {
            setItem(i);
            setStage(
              i?.setup
                ? Math.max(0, stepIds.indexOf(i.setup.nextRequiredStep))
                : 0,
            );
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [itemId]);
  const perform = async (
    action: () => Promise<Item>,
    success = "Saved",
    keepUnsaved = false,
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    generation.current++;
    setIssues([]);
    setBusy(true);
    setDetails([]);
    setError("");
    setMessage("");
    try {
      const result = await action();
      setItem(result);
      if (!keepUnsaved) setUnsaved(false);
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      if (e instanceof ApiError) {
        setIssues(e.issues);
        setDetails(e.blockingIssues.map((issue) => issue.message));
      }
      if (e instanceof FormInputError)
        setIssues([{ field: e.field, message: e.message }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const taxonomy = async (kind: "brands" | "categories", name: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const list = await catalogClient.saveTaxonomy(kind, name);
      if (kind === "brands") setBrands(list);
      else setCategories(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const upload = (type: string, file: File) => {
    if (!item) return;
    void perform(async () => {
      await catalogClient.upload(
        item.id,
        type,
        file,
        type === "model" && !!item.baseModelAssetId,
      );
      return catalogClient.item(item.id, true);
    });
  };
  const asset = item?.assets.find((a) => a.id === item.baseModelAssetId);
  return (
    <Shell>
      <main className="catalog-page">
        <Link to="/admin/items">← Items</Link>
        <h1>{item?.name ?? "Add Item"}</h1>
        <p>
          {item
            ? `${item.status} · Used in ${item.usageCount} project instances`
            : "One product, fixed dimensions, available colors."}
        </p>
        {item && (
          <div id="product-image">
            <ProductImage
              item={item}
              disabled={busy}
              onSaved={(updated, refreshSource = false) => {
                if (busyRef.current) return false;
                setItem((previous) =>
                  previous?.id === updated.id &&
                  (refreshSource ||
                    previous.thumbnailGeneration?.signature ===
                      updated.thumbnailGeneration?.signature)
                    ? updated
                    : previous,
                );
                return true;
              }}
            />
          </div>
        )}
        <nav className="item-stages" aria-label="Item setup">
          {stages.map((s, i) => (
            <button
              key={s}
              aria-label={`${i + 1}. ${s}`}
              disabled={
                busy ||
                (!item && i !== 0) ||
                (!!item?.setup && !item.setup.steps[i].accessible)
              }
              className={stage === i ? "selected" : ""}
              onClick={() => {
                go(i);
              }}
            >
              {i + 1}. {s} {item?.setup?.steps[i].complete ? "✓" : ""}
            </button>
          ))}
        </nav>
        {error && (
          <p role="alert" className="item-error">
            {error}
          </p>
        )}
        {details.length > 0 && (
          <ul>
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
        {message && <p role="status">{message}</p>}
        {busy && <p role="status">Saving {stages[stage].toLowerCase()}…</p>}
        {unsaved && (
          <p>
            Unsaved changes.{" "}
            <button
              disabled={busy}
              onClick={() => {
                setUnsaved(false);
                setFormVersion((v) => v + 1);
                setError("");
              }}
            >
              Discard unsaved changes
            </button>
          </p>
        )}
        <section className="item-editor-panel" aria-busy={busy}>
          <h2>{stages[stage]}</h2>
          <fieldset
            key={`${stage}:${formVersion}`}
            disabled={busy}
            className="item-step-fields"
            onChange={(e) => {
              const target = e.target as unknown as HTMLInputElement;
              if (target.type !== "file" && !target.closest(".taxonomy-forms"))
                setUnsaved(true);
            }}
          >
            {stage === 0 && (
              <>
                <form
                  key={item?.updatedAt ?? "new"}
                  className="item-form"
                  onSubmit={(e) => {
                    const d = values(e);
                    void perform(async () => {
                      const input = {
                        name: text(d, "name"),
                        description: text(d, "description"),
                        brandId: text(d, "brandId"),
                        categoryId: text(d, "categoryId"),
                        itemCode: optionalString(text(d, "itemCode")),
                      };
                      if (item) return catalogClient.save(item.id, input);
                      const created = await catalogClient.create(input);
                      navigate(`/admin/items/${created.id}`, { replace: true });
                      return created;
                    });
                  }}
                >
                  <label>
                    Product name
                    <input
                      aria-label="Product name"
                      name="name"
                      required
                      defaultValue={item?.name}
                    />
                    <FieldError field="name" issues={issues} />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={item?.description}
                    />
                  </label>
                  <label>
                    Brand
                    <select
                      aria-label="Brand"
                      name="brandId"
                      required
                      defaultValue={item?.brandId ?? ""}
                    >
                      <option value="" disabled>
                        Choose a brand
                      </option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <FieldError field="brandId" issues={issues} />
                  </label>
                  <label>
                    Category
                    <select
                      key={categories.length}
                      aria-label="Category"
                      name="categoryId"
                      required
                      defaultValue={item?.categoryId ?? "sofa"}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <FieldError field="categoryId" issues={issues} />
                  </label>
                  <label>
                    Product code (optional)
                    <input
                      name="itemCode"
                      defaultValue={item?.itemCode ?? ""}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    {item ? "Save information" : "Create draft"}
                  </button>
                </form>
                <div className="taxonomy-forms">
                  {(["brands", "categories"] as const).map((kind) => (
                    <form
                      key={kind}
                      onSubmit={(e) => {
                        const d = values(e);
                        void taxonomy(kind, text(d, "name"));
                        e.currentTarget.reset();
                      }}
                    >
                      <label>
                        New {kind === "brands" ? "brand" : "category"}
                        <input name="name" required />
                      </label>
                      <button className="button secondary">
                        Add {kind === "brands" ? "brand" : "category"}
                      </button>
                    </form>
                  ))}
                </div>
              </>
            )}
            {item && stage === 1 && (
              <>
                <p>
                  Upload this product's GLB. A different physical size is a
                  separate Item.
                </p>
                {(!asset || !item.usageCount) && (
                  <label>
                    {asset ? "Replace model" : "Upload GLB"}
                    <input
                      type="file"
                      accept=".glb"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload("model", f);
                      }}
                    />
                  </label>
                )}
                {asset && (
                  <>
                    <p>
                      {asset.fileName} ·{" "}
                      {item.setup?.modelValid
                        ? "Validated"
                        : "Needs replacement"}{" "}
                      · {asset.inspection?.meshes.length} meshes ·{" "}
                      {asset.inspection?.materials.length} materials
                    </p>
                    <p>
                      {item.usageCount
                        ? "This model is used in a project and cannot be replaced."
                        : "Replacing the model resets dimensions and color parts. Saved colors are retained; confirm their parts again."}
                    </p>
                    <Suspense fallback={<p>Loading model…</p>}>
                      <ModelPreview item={item} />
                    </Suspense>
                    <details>
                      <summary>Advanced Model Inspection</summary>
                      <pre>{JSON.stringify(asset.inspection, null, 2)}</pre>
                    </details>
                  </>
                )}
              </>
            )}
            {item && stage === 2 && (
              <Dimensions
                key={item.updatedAt}
                item={item}
                perform={perform}
                issues={issues}
                busy={busy}
              />
            )}
            {item && (stage === 3 || stage === 4) && (
              <>
                <Colors
                  key={`${item.id}:${stage}`}
                  item={item}
                  perform={perform}
                  issues={issues}
                  busy={busy}
                  targetsOnly={stage === 3}
                  onDirty={() => setUnsaved(true)}
                />
                <AdvancedAppearance
                  item={item}
                  perform={perform}
                  upload={upload}
                  busy={busy}
                />
              </>
            )}
            {item && stage === 5 && (
              <Pricing
                key={item.updatedAt}
                item={item}
                perform={perform}
                issues={issues}
                busy={busy}
              />
            )}
            {item && stage === 6 && (
              <>
                <p>
                  {item.brandName} · {item.categoryName}
                </p>
                <p>
                  {item.width != null
                    ? `${units.value(item.width)} × ${units.value(item.depth!)} × ${units.value(item.height!)} ${units.label}`
                    : "Confirm dimensions"}
                </p>
                <p>
                  GLB:{" "}
                  {asset?.calibration && item.dimensions
                    ? "Ready"
                    : "Confirm real dimensions"}
                </p>
                <p>
                  {item.basePriceMinor === null
                    ? "Set base price"
                    : `Base ${formatPrice(item.basePriceMinor, item.currency)}`}{" "}
                  · {item.itemCode}
                </p>
                <p>
                  Available colors:{" "}
                  {item.colors
                    .filter((c) => c.status === "ACTIVE")
                    .map((c) => c.name)
                    .join(", ")}
                </p>
                <Suspense fallback={<p>Loading preview…</p>}>
                  <ModelPreview
                    item={item}
                    variant={item.defaultColor ?? undefined}
                  />
                </Suspense>
                <p>
                  Default color:{" "}
                  {item.defaultColor?.name ??
                    "Add an active color in Available colors."}
                </p>
                <ul aria-label="Publication checklist">
                  {item.setup?.steps.slice(0, 6).map((step, i) => (
                    <li key={step.id}>
                      {step.complete ? "Ready" : "Incomplete"}: {stages[i]}
                    </li>
                  ))}
                </ul>
                {item.setup?.blockingIssues.map((issue) => (
                  <p key={issue.code + issue.message} className="item-error">
                    {issue.message}{" "}
                    <button
                      onClick={() =>
                        issue.step === "THUMBNAIL"
                          ? document
                              .getElementById("product-image")
                              ?.scrollIntoView({ behavior: "smooth" })
                          : go(stepIds.indexOf(issue.step))
                      }
                    >
                      Open{" "}
                      {issue.step === "THUMBNAIL"
                        ? "Product image"
                        : stages[stepIds.indexOf(issue.step)]}
                    </button>
                  </p>
                ))}
                <button
                  className="button"
                  disabled={
                    busy || !item.setup?.publishable || item.status === "ACTIVE"
                  }
                  onClick={() =>
                    void perform(
                      () => catalogClient.save(item.id, { status: "ACTIVE" }),
                      "Product published",
                    )
                  }
                >
                  {item.status === "ACTIVE" ? "Published" : "Publish product"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void perform(
                      () => catalogClient.save(item.id, { status: "DRAFT" }),
                      "Draft saved",
                    )
                  }
                >
                  Save draft
                </button>
                {item.status === "ACTIVE" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(
                        () =>
                          catalogClient.save(item.id, { status: "INACTIVE" }),
                        "Product hidden",
                      )
                    }
                  >
                    Hide product
                  </button>
                )}
              </>
            )}
          </fieldset>
        </section>
        <div className="catalog-pagination">
          <button
            className="button secondary"
            disabled={busy || stage === 0}
            onClick={() => go(stage - 1)}
          >
            Previous step
          </button>
          <button
            className="button"
            disabled={
              busy ||
              !item ||
              stage === 6 ||
              !item.setup?.steps[stage].complete ||
              !item.setup?.steps[stage + 1]?.accessible
            }
            onClick={() => go(stage + 1)}
          >
            Next step
          </button>
        </div>
      </main>
    </Shell>
  );
}
type StepProps = {
  item: Item;
  perform: (
    a: () => Promise<Item>,
    success?: string,
    keepUnsaved?: boolean,
  ) => Promise<void>;
  issues?: { field: string; message: string }[];
  busy: boolean;
};

function Colors({
  item,
  perform,
  busy,
  targetsOnly,
  onDirty,
  issues,
}: StepProps & { targetsOnly: boolean; onDirty: () => void }) {
  const slot = item.slots.find((s) => s.name === "PRODUCT_COLOR"),
    saved = item.bindings.filter((b) => b.slotId === slot?.id);
  const [targets, setTargets] = useState<ColorTarget[]>(
      saved.map((b) => ({
        materialIndex: b.materialIndex,
        nodeIndex: b.nodeIndex,
      })),
    ),
    [selecting, setSelecting] = useState(targetsOnly && !saved.length),
    [editId, setEditId] = useState(""),
    [previewId, setPreviewId] = useState(item.defaultVariantId ?? ""),
    [name, setName] = useState(""),
    [baseColor, setBaseColor] = useState("#31577a"),
    [textureId, setTextureId] = useState(""),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false);
  const edit = item.colors.find((c) => c.id === editId),
    preview =
      item.colors.find((c) => c.id === previewId) ??
      item.defaultColor ??
      undefined;
  const previewOverrides = slot
    ? [
        ...(edit?.overrides ?? []).filter((o) => o.slotId !== slot.id),
        {
          slotId: slot.id,
          materialId: textureId ? "live-texture" : null,
          baseColor: textureId ? null : baseColor,
        },
      ]
    : [];
  const live =
    editing && (!edit || dirty)
      ? {
          ...(edit ??
            item.colors[0] ?? {
              id: "live",
              itemId: item.id,
              name,
              sku: null,
              priceMinor: 0,
              currency: item.currency,
              width: item.width!,
              depth: item.depth!,
              height: item.height!,
              modelAssetId: null,
              thumbnailAssetId: null,
              status: "ACTIVE" as const,
              finish: null,
              createdAt: "",
              updatedAt: "",
              priceOverrideMinor: null,
              currencyOverride: null,
              effectiveSku: null,
            }),
          color: baseColor,
          overrides: previewOverrides,
        }
      : preview;
  const previewItem =
    editing && textureId
      ? {
          ...item,
          materials: [
            ...item.materials,
            {
              id: "live-texture",
              itemId: item.id,
              name: "Preview",
              baseColor,
              roughness: 0.8,
              metalness: 0,
              opacity: 1,
              textures: [
                { channel: "BASE_COLOR" as const, assetId: textureId },
              ],
              createdAt: "",
              updatedAt: "",
            },
          ],
        }
      : item;
  const inspection = item.assets.find(
    (a) => a.id === item.baseModelAssetId,
  )?.inspection;
  const lacksUV = (targetsOnly ? targets : saved).some((t) =>
    inspection?.meshes
      .filter(
        (m) =>
          t.nodeIndex === null ||
          m.index ===
            inspection.nodes.find((n) => n.index === t.nodeIndex)?.mesh,
      )
      .some((m) =>
        m.primitives.some(
          (p) => p.materialIndex === t.materialIndex && !p.hasUV,
        ),
      ),
  );
  if (!item.dimensions)
    return <p>Confirm the real product dimensions first.</p>;
  return (
    <>
      {targetsOnly && (
        <>
          <h3>Product color parts</h3>
          {lacksUV && (
            <p>
              One selected part has no usable UV mapping. You can still use
              solid colors; texture images need UV mapping.
            </p>
          )}
          <p>
            Click all model parts whose color changes between product colors.
            Click a selected part again to remove it.
          </p>
          <p>
            Choose at least one part and add an active color before publishing.
            Unselected parts keep their original appearance.
          </p>
        </>
      )}
      <Suspense fallback={<p>Loading preview…</p>}>
        <ModelPreview
          item={previewItem}
          variant={selecting ? undefined : live}
          targets={selecting ? targets : undefined}
          onTarget={
            selecting && !busy
              ? (target) => {
                  onDirty();
                  setTargets((old) =>
                    old.some(
                      (t) =>
                        t.materialIndex === target.materialIndex &&
                        t.nodeIndex === target.nodeIndex,
                    )
                      ? old.filter(
                          (t) =>
                            t.materialIndex !== target.materialIndex ||
                            t.nodeIndex !== target.nodeIndex,
                        )
                      : [...old, target],
                  );
                }
              : undefined
          }
        />
      </Suspense>
      {targetsOnly &&
        (selecting ? (
          <>
            <p>Selected: {targets.length} regions</p>
            <ul>
              {targets.map((t) => (
                <li key={`${t.nodeIndex}:${t.materialIndex}`}>
                  {item.assets
                    .find((a) => a.id === item.baseModelAssetId)
                    ?.inspection?.nodes.find((n) => n.index === t.nodeIndex)
                    ?.name ?? "Material region"}{" "}
                  <button
                    onClick={() => {
                      setTargets(targets.filter((v) => v !== t));
                      onDirty();
                    }}
                  >
                    Remove selection
                  </button>
                </li>
              ))}
            </ul>
            <button
              disabled={busy}
              onClick={() => {
                setTargets([]);
                onDirty();
              }}
            >
              Reset selection
            </button>
            <button
              className="button"
              disabled={busy || !targets.length || !!item.usageCount}
              onClick={() =>
                void perform(async () => {
                  const result = await catalogClient.action(
                    item.id,
                    "color-targets",
                    { targets },
                  );
                  setSelecting(false);
                  return result;
                })
              }
            >
              Confirm color parts
            </button>
          </>
        ) : (
          <button
            className="button secondary"
            disabled={!!item.usageCount}
            onClick={() => setSelecting(true)}
          >
            Edit color parts
          </button>
        ))}
      {targetsOnly && (
        <p>
          {saved.length
            ? `${saved.length} color regions saved.`
            : "No color regions saved yet."}
        </p>
      )}
      {!targetsOnly && (
        <>
          {lacksUV && (
            <p>
              Texture images cannot be applied to these parts because UV mapping
              is missing. Choose a solid color.
            </p>
          )}
          <div className="catalog-grid">
            {item.colors.map((c) => (
              <article key={c.id} className="color-card">
                <span
                  className="color-swatch"
                  style={{ background: c.color ?? "#ddd" }}
                />
                <h4>{c.name}</h4>
                {item.status === "ACTIVE" &&
                  c.status === "ACTIVE" &&
                  item.colors.filter((v) => v.status === "ACTIVE").length ===
                    1 && (
                    <p>A published product needs at least one active color.</p>
                  )}
                {c.id === item.defaultVariantId ? (
                  <strong>Default color</strong>
                ) : (
                  c.status === "ACTIVE" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          catalogClient.save(item.id, {
                            defaultVariantId: c.id,
                          }),
                        )
                      }
                    >
                      Set as Default
                    </button>
                  )
                )}
                <p>
                  {c.status === "ACTIVE" ? "Active" : "Inactive"} ·{" "}
                  {formatPrice(c.priceMinor, c.currency)}
                </p>
                <p>
                  {c.status === "INACTIVE"
                    ? "Inactive"
                    : (c.effectiveSku ?? "Uses product code")}
                </p>
                <p>
                  {item.samePriceForAllColors || c.priceOverrideMinor === null
                    ? "Uses base price"
                    : formatPrice(c.priceMinor, c.currency)}
                </p>
                <button
                  onClick={() => {
                    setPreviewId(c.id);
                    setEditing(false);
                    setSelecting(false);
                  }}
                >
                  Preview
                </button>
                <button
                  onClick={() => {
                    setEditId(c.id);
                    setPreviewId(c.id);
                    setName(c.name);
                    setBaseColor(
                      c.color?.startsWith("#") ? c.color : "#31577a",
                    );
                    setTextureId(
                      item.materials
                        .find(
                          (m) =>
                            m.id ===
                            c.overrides.find((o) => o.slotId === slot?.id)
                              ?.materialId,
                        )
                        ?.textures.find((t) => t.channel === "BASE_COLOR")
                        ?.assetId ?? "",
                    );
                    setEditing(true);
                    setDirty(false);
                    setSelecting(false);
                  }}
                >
                  Edit
                </button>
                <button
                  disabled={
                    busy ||
                    (item.status === "ACTIVE" &&
                      c.status === "ACTIVE" &&
                      item.colors.filter((v) => v.status === "ACTIVE")
                        .length === 1)
                  }
                  onClick={() =>
                    void perform(() =>
                      catalogClient.action(
                        item.id,
                        `colors/${c.id}`,
                        {
                          status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                        },
                        "PATCH",
                      ),
                    )
                  }
                >
                  {c.status === "ACTIVE" ? "Deactivate" : "Restore"}
                </button>
              </article>
            ))}
          </div>
          <button
            className="button secondary"
            disabled={busy || !saved.length}
            onClick={() => {
              setEditId("");
              setName("");
              setBaseColor("#31577a");
              setTextureId("");
              setEditing(true);
              setDirty(true);
              setSelecting(false);
            }}
          >
            + Add Color
          </button>
          {editing && (
            <form
              key={editId || "new-color"}
              className="item-form"
              onSubmit={(e) => {
                const data = values(e);
                void perform(async () => {
                  const result = await catalogClient.action(
                    item.id,
                    editId ? `colors/${editId}` : "colors",
                    {
                      name,
                      sku: optionalString(data.get("sku")),
                      ...(!item.samePriceForAllColors
                        ? {
                            priceMinor: moneyInput(
                              data.get("price"),
                              data.get("priceCurrency"),
                            ),
                            currency: optionalString(data.get("price"))
                              ? String(data.get("priceCurrency"))
                                  .trim()
                                  .toUpperCase()
                              : null,
                          }
                        : {}),
                      status: edit?.status ?? "ACTIVE",
                      ...(dirty
                        ? { baseColor, textureAssetId: textureId || null }
                        : {}),
                    },
                    editId ? "PATCH" : "POST",
                  );
                  setEditing(false);
                  setPreviewId(
                    editId || result.colors[result.colors.length - 1].id,
                  );
                  return result;
                });
              }}
            >
              <label>
                Color name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={baseColor}
                  onChange={(e) => {
                    setBaseColor(e.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <p>
                Appearance: {textureId ? "Texture image" : "Solid color"}.
                Texture images require UV mapping on every selected part.
              </p>
              <label>
                Texture (optional)
                <select
                  disabled={lacksUV}
                  value={textureId}
                  onChange={(e) => {
                    setTextureId(e.target.value);
                    setDirty(true);
                  }}
                >
                  <option value="">Solid color</option>
                  {item.assets
                    .filter((a) => a.type === "TEXTURE")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fileName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Upload color texture
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy || lacksUV}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void perform(
                        async () => {
                          const a = await catalogClient.upload(
                            item.id,
                            "textures",
                            file,
                          );
                          setTextureId(a.id);
                          setDirty(true);
                          return catalogClient.item(item.id, true);
                        },
                        "Texture uploaded; save the color to apply it.",
                        true,
                      );
                  }}
                />
              </label>
              <label>
                Color SKU (optional)
                <input
                  name="sku"
                  defaultValue={edit?.sku ?? ""}
                  placeholder="Uses product code"
                />
                <FieldError field="sku" issues={issues} />
              </label>
              {!item.samePriceForAllColors && (
                <>
                  <label>
                    Color price override (optional)
                    <input
                      name="price"
                      inputMode="decimal"
                      defaultValue={
                        edit?.priceOverrideMinor != null
                          ? decimal(
                              edit.priceOverrideMinor,
                              edit.currencyOverride ?? item.currency,
                            )
                          : ""
                      }
                      placeholder="Uses base price"
                    />
                  </label>
                  <label>
                    Color price currency
                    <input
                      name="priceCurrency"
                      defaultValue={edit?.currencyOverride ?? item.currency}
                      required
                    />
                  </label>
                </>
              )}
              <button className="button" disabled={busy}>
                {editId ? "Save color" : "Create color"}
              </button>
            </form>
          )}
        </>
      )}
    </>
  );
}
function Pricing({ item, perform, busy, issues }: StepProps) {
  const [same, setSame] = useState(item.samePriceForAllColors);
  return (
    <>
      <form
        className="item-form"
        onSubmit={(e) => {
          const d = values(e);
          void perform(() =>
            catalogClient.save(item.id, {
              basePriceMinor: moneyInput(text(d, "price"), text(d, "currency")),
              currency: text(d, "currency").trim().toUpperCase(),
              itemCode: optionalString(text(d, "code")),
              samePriceForAllColors: same,
            }),
          );
        }}
      >
        <label>
          Base price
          <input
            name="price"
            aria-label="Base price"
            required
            inputMode="decimal"
            defaultValue={
              item.basePriceMinor === null
                ? ""
                : decimal(item.basePriceMinor, item.currency)
            }
          />
          <FieldError field="basePriceMinor" issues={issues} />
        </label>
        <label>
          Currency
          <input
            aria-label="Currency"
            name="currency"
            required
            defaultValue={item.currency}
          />
          <FieldError field="currency" issues={issues} />
        </label>
        <label>
          Base product code / SKU
          <input name="code" defaultValue={item.itemCode ?? ""} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={same}
            onChange={(e) => setSame(e.target.checked)}
          />{" "}
          Same price for all colors
        </label>
        <button className="button" disabled={busy}>
          Save base price
        </button>
      </form>
      {item.colors.map((c) => (
        <form
          key={`${c.id}:${c.updatedAt}`}
          className="item-form"
          onSubmit={(e) => {
            const d = values(e);
            void perform(() =>
              catalogClient.action(
                item.id,
                `colors/${c.id}`,
                {
                  sku: optionalString(text(d, "sku")),
                  ...(!item.samePriceForAllColors
                    ? {
                        priceMinor: text(d, "price")
                          ? moneyInput(text(d, "price"), text(d, "currency"))
                          : null,
                        currency: text(d, "price") ? text(d, "currency") : null,
                      }
                    : {}),
                },
                "PATCH",
              ),
            );
          }}
        >
          <h3>{c.name}</h3>
          <label>
            SKU override — {c.name}
            <input
              name="sku"
              defaultValue={c.sku ?? ""}
              placeholder={item.itemCode ?? "Optional"}
            />
          </label>
          {!item.samePriceForAllColors && (
            <>
              <label>
                Price override — {c.name}
                <input
                  name="price"
                  inputMode="decimal"
                  defaultValue={
                    c.priceOverrideMinor === null
                      ? ""
                      : decimal(
                          c.priceOverrideMinor,
                          c.currencyOverride ?? item.currency,
                        )
                  }
                  placeholder="Uses base price"
                />
              </label>
              <label>
                Currency — {c.name}
                <input
                  name="currency"
                  defaultValue={c.currencyOverride ?? item.currency}
                />
              </label>
            </>
          )}
          <button className="button secondary" disabled={busy}>
            Save {c.name} pricing
          </button>
        </form>
      ))}
    </>
  );
}
function FieldError({
  field,
  issues,
}: {
  field: string;
  issues?: { field: string; message: string }[];
}) {
  const issue = issues?.find(
    (i) =>
      i.field === field || (field === "basePriceMinor" && i.field === "price"),
  );
  return issue ? <small className="item-error">{issue.message}</small> : null;
}
function decimal(minor: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 0;
  return (minor / 10 ** digits).toFixed(digits);
}

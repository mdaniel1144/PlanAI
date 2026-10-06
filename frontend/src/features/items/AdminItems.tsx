import { stages, stepIds } from "./studio-steps";
import { FieldError } from "./StudioFields";
import { Review } from "./Review";
import { Dimensions } from "./Dimensions";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Shell } from "../../components/Layout";
import { type Item } from "@habitat/domain";
import { optionalString, FormInputError } from "./forms";
import { ApiError } from "../../api/client";
import { catalogClient } from "./api";
import { Catalog } from "./Catalog";
import { ProductImage } from "./ProductImage";
import { AdvancedAppearance } from "./AdvancedAppearance";
import { Colors } from "./Colors";
import { Pricing } from "./Pricing";
import { ProductStudioShell, StudioSplit, StudioEmpty } from "./Studio";
import { values, text } from "./studio-forms";
import ModelPreview from "./LazyModelPreview";
export function AdminItems() {
  return (
    <Shell>
      <main className="catalog-page">
        <div className="catalog-heading">
          <div>
            <p className="eyebrow">Habitat / Collection</p>
            <h1>Item library</h1>
            <p>Considered products. Ready for your next space.</p>
          </div>
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
      <ProductStudioShell
        item={item}
        stage={stage}
        busy={busy}
        unsaved={unsaved}
        message={message}
        error={error}
        go={go}
        image={
          item ? (
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
          ) : null
        }
      >
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
        <section
          className={`item-editor-panel studio-stage-${stage}`}
          aria-busy={busy}
        >
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
              <StudioSplit
                viewer={
                  item?.baseModelAssetId ? (
                    <ModelPreview
                      item={item}
                      variant={item.defaultColor ?? undefined}
                    />
                  ) : (
                    <StudioEmpty />
                  )
                }
              >
                <form
                  key={item?.updatedAt ?? "new"}
                  className="item-form product-information-form"
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
                  <label className="product-description">
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
                <details className="taxonomy-disclosure">
                  <summary>Manage brands & categories</summary>
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
                </details>
              </StudioSplit>
            )}
            {item && stage === 1 && (
              <StudioSplit
                viewer={
                  asset ? (
                    <ModelPreview item={item} />
                  ) : (
                    <div
                      className="model-dropzone"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!busy && e.dataTransfer.files[0])
                          upload("model", e.dataTransfer.files[0]);
                      }}
                    >
                      <StudioEmpty
                        title="Drop your GLB here"
                        detail="One model. Every detail of your product."
                      />
                      <label className="button">
                        Choose file
                        <input
                          aria-label="Upload GLB"
                          type="file"
                          accept=".glb"
                          disabled={busy}
                          onChange={(e) => {
                            if (e.target.files?.[0])
                              upload("model", e.target.files[0]);
                          }}
                        />
                      </label>
                      <p>GLB only · Maximum 50 MB by default</p>
                    </div>
                  )
                }
              >
                <p>
                  Upload this product's GLB. A different physical size is a
                  separate Item.
                </p>
                {asset && !item.usageCount && (
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
                    <dl className="model-facts">
                      <div>
                        <dt>Meshes</dt>
                        <dd>{asset.inspection?.meshes.length}</dd>
                      </div>
                      <div>
                        <dt>Materials</dt>
                        <dd>{asset.inspection?.materials.length}</dd>
                      </div>
                      <div>
                        <dt>UV mapping</dt>
                        <dd>
                          {asset.inspection?.meshes.every((m) =>
                            m.primitives.every((p) => p.hasUV),
                          )
                            ? "Available"
                            : "Partial / unavailable"}
                        </dd>
                      </div>
                      <div>
                        <dt>Animation</dt>
                        <dd>
                          {asset.inspection?.animations.length
                            ? "Present"
                            : "None"}
                        </dd>
                      </div>
                    </dl>
                    <details>
                      <summary>Advanced Model Inspection</summary>
                      <pre>{JSON.stringify(asset.inspection, null, 2)}</pre>
                    </details>
                  </>
                )}
              </StudioSplit>
            )}
            {item && stage === 2 && (
              <Dimensions
                key={item.updatedAt}
                item={item}
                perform={perform}
                issues={issues}
                busy={busy}
                onDirty={() => setUnsaved(true)}
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
                  onDiscard={() => setUnsaved(false)}
                  error={error}
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
              <StudioSplit
                viewer={
                  <ModelPreview
                    item={item}
                    variant={item.defaultColor ?? undefined}
                  />
                }
              >
                <Pricing
                  key={item.updatedAt}
                  item={item}
                  perform={perform}
                  issues={issues}
                  busy={busy}
                />
              </StudioSplit>
            )}
            {item && stage === 6 && (
              <Review item={item} perform={perform} busy={busy} go={go} />
            )}
          </fieldset>
        </section>
        <div className="catalog-pagination studio-footer">
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
      </ProductStudioShell>
    </Shell>
  );
}

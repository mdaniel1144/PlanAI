import { FieldError } from "./StudioFields";
import { useState } from "react";
import { formatPrice } from "@habitat/domain";
import { catalogClient } from "./api";
import { moneyInput, optionalString } from "./forms";
import { type StepProps, values, decimal } from "./studio-forms";
import { StudioSplit, ColorSwatch } from "./Studio";
import { ColorSheet } from "./ColorSheet";
import type { ColorTarget } from "./ModelPreview";
import ModelPreview from "./LazyModelPreview";
export function Colors({
  item,
  perform,
  busy,
  targetsOnly,
  onDirty,
  issues,
  onDiscard,
  error,
}: StepProps & {
  targetsOnly: boolean;
  onDirty: () => void;
  onDiscard: () => void;
  error: string;
}) {
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
    <StudioSplit
      viewer={
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
      }
    >
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
      {targetsOnly &&
        (selecting ? (
          <>
            <p>Selected: {targets.length} regions</p>
            <ul className="selected-parts">
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
          {!item.colors.length && (
            <div className="color-empty">
              <h3>No colors configured</h3>
              <p>
                Your model is ready. Add the finishes available for this
                product.
              </p>
            </div>
          )}
          {lacksUV && (
            <p>
              Texture images cannot be applied to these parts because UV mapping
              is missing. Choose a solid color.
            </p>
          )}
          <div className="color-list">
            {item.colors.map((c) => (
              <article key={c.id} className="color-card">
                <div className="color-row-heading">
                  <ColorSwatch
                    color={c.color}
                    name={c.name}
                    selected={preview?.id === c.id}
                    onClick={() => {
                      setPreviewId(c.id);
                      setSelecting(false);
                    }}
                  />
                  <div>
                    <h4>{c.name}</h4>
                    {c.id === item.defaultVariantId && (
                      <strong>Default color</strong>
                    )}
                  </div>
                  <span>{formatPrice(c.priceMinor, c.currency)}</span>
                </div>
                <div className="color-row-meta">
                  <span>
                    {c.status === "INACTIVE"
                      ? "Inactive"
                      : (c.effectiveSku ?? "Uses product code")}
                  </span>
                  <span>
                    {item.samePriceForAllColors || c.priceOverrideMinor === null
                      ? "Uses base price"
                      : "Custom price"}
                  </span>
                </div>
                <div className="color-row-actions">
                  {c.id !== item.defaultVariantId && c.status === "ACTIVE" && (
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
                  )}
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
                            status:
                              c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                          },
                          "PATCH",
                        ),
                      )
                    }
                  >
                    {c.status === "ACTIVE" ? "Deactivate" : "Restore"}
                  </button>
                </div>
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
            <ColorSheet
              title={editId ? "Edit color" : "Add color"}
              busy={busy}
              onClose={() => {
                setEditing(false);
                setDirty(false);
                onDiscard();
              }}
            >
              {error && (
                <p role="alert" className="item-error">
                  {error}
                </p>
              )}
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
            </ColorSheet>
          )}
        </>
      )}
    </StudioSplit>
  );
}

import { useState, type FormEvent } from "react";
import type { Item } from "@habitat/domain";
import { optionalNumber, optionalId } from "./forms";
import { catalogClient } from "./api";
const values = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return new FormData(e.currentTarget);
};
const text = (d: FormData, k: string) => String(d.get(k) ?? "");
const number = (d: FormData, k: string) => Number(text(d, k));
export function AdvancedAppearance({
  item,
  perform,
  upload,
  busy,
}: {
  item: Item;
  perform: (action: () => Promise<Item>) => Promise<void>;
  upload: (type: string, file: File) => void;
  busy: boolean;
}) {
  const [stage, setStage] = useState(0),
    [bindingId, setBindingId] = useState(""),
    [materialId, setMaterialId] = useState("");
  const binding = item.bindings.find((b) => b.id === bindingId),
    material = item.materials.find((m) => m.id === materialId);
  const [modelId, setModelId] = useState("");
  const asset = item.assets.find(
    (a) => a.id === (modelId || item.baseModelAssetId),
  );
  return (
    <details>
      <summary>Advanced appearance</summary>
      <button className="button secondary" onClick={() => setStage(0)}>
        Material mappings
      </button>
      <button className="button secondary" onClick={() => setStage(1)}>
        Materials &amp; textures
      </button>
      {stage === 0 && (
        <>
          <form
            className="item-form"
            onSubmit={(e) => {
              const d = values(e);
              void perform(() =>
                catalogClient.action(item.id, "slots", {
                  name: text(d, "name"),
                }),
              );
            }}
          >
            <label>
              Semantic slot name
              <input name="name" placeholder="FABRIC" required />
            </label>
            <button className="button" disabled={busy}>
              Create slot
            </button>
          </form>
          <label>
            Edit mapping
            <select
              value={bindingId}
              onChange={(e) => {
                setBindingId(e.target.value);
                const b = item.bindings.find((b) => b.id === e.target.value);
                if (b) setModelId(b.modelAssetId);
              }}
            >
              <option value="">New mapping</option>
              {item.bindings.map((b) => (
                <option key={b.id} value={b.id}>
                  {item.slots.find((s) => s.id === b.slotId)?.name} · material #
                  {b.materialIndex}
                </option>
              ))}
            </select>
          </label>
          <form
            key={bindingId}
            className="item-form"
            onSubmit={(e) => {
              const d = values(e);
              void perform(() =>
                catalogClient.action(
                  item.id,
                  `bindings${binding ? "/" + binding.id : ""}`,
                  {
                    slotId: text(d, "slotId"),
                    modelAssetId: text(d, "modelAssetId"),
                    materialIndex: number(d, "materialIndex"),
                    nodeIndex: optionalNumber(text(d, "nodeIndex")),
                  },
                  binding ? "PATCH" : "POST",
                ),
              );
            }}
          >
            <label>
              Slot
              <select name="slotId" required defaultValue={binding?.slotId}>
                {item.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              <select
                name="modelAssetId"
                value={asset?.id ?? ""}
                onChange={(e) => setModelId(e.target.value)}
                required
              >
                <option value="">Choose model</option>
                {item.assets
                  .filter((a) => a.type === "GLB_MODEL")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fileName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Detected material
              <select
                name="materialIndex"
                required
                defaultValue={binding?.materialIndex}
              >
                {asset?.inspection?.materials.map((m) => (
                  <option key={m.index} value={m.index}>
                    #{m.index} {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Node (optional)
              <select name="nodeIndex" defaultValue={binding?.nodeIndex ?? ""}>
                <option value="">All nodes using this material</option>
                {asset?.inspection?.nodes
                  .filter((n) => n.mesh !== null)
                  .map((n) => (
                    <option key={n.index} value={n.index}>
                      #{n.index} {n.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="button" disabled={busy}>
              {binding ? "Save mapping" : "Map material"}
            </button>
          </form>
          <ul>
            {item.bindings.map((b) => (
              <li key={b.id}>
                {item.slots.find((s) => s.id === b.slotId)?.name} → material #
                {b.materialIndex} /{" "}
                {item.assets.find((a) => a.id === b.modelAssetId)?.fileName}
              </li>
            ))}
          </ul>
        </>
      )}
      {stage === 1 && (
        <>
          <label className="file-field">
            Upload texture
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload("textures", f);
                e.target.value = "";
              }}
            />
          </label>
          <label>
            Edit material
            <select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
            >
              <option value="">New material</option>
              {item.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <form
            key={materialId}
            className="item-form"
            onSubmit={(e) => {
              const d = values(e);
              void perform(() =>
                catalogClient.action(
                  item.id,
                  `materials${material ? "/" + material.id : ""}`,
                  {
                    name: text(d, "name"),
                    baseColor: text(d, "baseColor"),
                    roughness: number(d, "roughness"),
                    metalness: number(d, "metalness"),
                    opacity: number(d, "opacity"),
                    textures: ["BASE_COLOR", "NORMAL", "ROUGHNESS"].flatMap(
                      (channel) =>
                        optionalId(text(d, channel))
                          ? [{ channel, assetId: optionalId(text(d, channel)) }]
                          : [],
                    ),
                  },
                  material ? "PATCH" : "POST",
                ),
              );
            }}
          >
            <label>
              Material name
              <input name="name" required defaultValue={material?.name} />
            </label>
            <label>
              Base color
              <input
                type="color"
                name="baseColor"
                defaultValue={material?.baseColor ?? "#ffffff"}
              />
            </label>
            {(["roughness", "metalness", "opacity"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  name={k}
                  type="number"
                  min="0"
                  max="1"
                  step=".01"
                  defaultValue={
                    material?.[k] ??
                    (k === "roughness" ? 0.8 : k === "metalness" ? 0 : 1)
                  }
                />
              </label>
            ))}
            {["BASE_COLOR", "NORMAL", "ROUGHNESS"].map((channel) => (
              <label key={channel}>
                {channel} texture
                <select
                  name={channel}
                  defaultValue={
                    material?.textures.find((t) => t.channel === channel)
                      ?.assetId ?? ""
                  }
                >
                  <option value="">None</option>
                  {item.assets
                    .filter((a) => a.type === "TEXTURE")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.fileName}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <button className="button" disabled={busy}>
              {material ? "Save material" : "Create material"}
            </button>
          </form>
        </>
      )}
    </details>
  );
}

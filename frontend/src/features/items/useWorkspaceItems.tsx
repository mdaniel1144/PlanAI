import { useUnits } from "../../units/useUnits";
import { useEffect, useRef, useState } from "react";
import { pointInPolygon, snapDrawing } from "@habitat/geometry";
import type {
  Floor,
  HomeScene,
  Item,
  ItemVariant,
  Point,
  ProjectItemInstance,
} from "@habitat/domain";
import { ItemsLibrary } from "./ItemsLibrary";
import { catalogClient } from "./api";

export type ItemPlacement = {
  item: Item;
  variant: ItemVariant;
  floorId: string;
  rotation: number;
  instanceId?: string;
};
export function useWorkspaceItems({
  scene,
  floor,
  selected,
  select,
  commit,
  activate,
  tool,
  snapGrid,
  spacing,
  busy,
  onNotice,
}: {
  scene: HomeScene;
  floor?: Floor;
  selected: string | null;
  select: (id: string | null) => void;
  commit: (s: HomeScene) => void;
  activate: (tool: string) => void;
  tool: string;
  snapGrid: boolean;
  spacing: number;
  busy: boolean;
  onNotice: (s: string) => void;
}) {
  const units = useUnits();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [pending, setPending] = useState<ItemPlacement | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [error, setError] = useState("");
  const [outlines, setOutlines] = useState<Record<string, Point[]>>({});
  const generation = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let active = true;
    void catalogClient
      .resolve(scene.id)
      .then((value) => {
        if (active)
          setItems((previous) => [
            ...previous.filter((i) => !value.some((v) => v.id === i.id)),
            ...value,
          ]);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [scene.id, scene.revision]);
  const visible = JSON.stringify(
    floor?.itemInstances?.map((i) => [i.itemId, i.variantId]) ?? [],
  );
  useEffect(() => {
    let active = true;
    const pairs = JSON.parse(visible) as [string, string][];
    if (pairs.length)
      void import("./placement-model")
        .then(async ({ preparePlacement }) => {
          for (const [id, variantId] of pairs) {
            const item = items.find((i) => i.id === id),
              variant = item?.variants.find((v) => v.id === variantId);
            if (!item || !variant) continue;
            const outline = await preparePlacement(item, variant);
            if (active)
              setOutlines((all) => ({
                ...all,
                [item.baseModelAssetId!]: outline,
              }));
          }
        })
        .catch((e: Error) => {
          if (active)
            setError(`An item's runtime model is unavailable: ${e.message}`);
        });
    return () => {
      active = false;
    };
  }, [items, visible]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const cancel = () => {
    generation.current++;
    setPending(null);
    setPointer(null);
    setOpen(false);
    setPreparing(false);
    setError("");
  };
  const close = () => {
    cancel();
    activate("select");
    opener.current?.focus();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (open || pending || preparing)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });
  const surface = (p: Point) => {
    const room = floor?.rooms.find(
      (r) => r.boundary.length >= 3 && pointInPolygon(p, r.boundary),
    );
    return {
      spaceId: room?.id ?? null,
      elevation: room ? room.floorElevation : floor?.elevation,
    };
  };
  const snapped = (p: Point) =>
    snapDrawing(
      p,
      floor?.walls ?? [],
      undefined,
      snapGrid ? spacing : undefined,
    ).point;
  const selectedInstance = floor?.itemInstances?.find((i) => i.id === selected),
    selectedItem = items.find((i) => i.id === selectedInstance?.itemId);
  const edit = (changes: Partial<ProjectItemInstance>) => {
    if (!floor || !selectedInstance || busy) return;
    const next = { ...selectedInstance, ...changes };
    if (changes.positionX !== undefined || changes.positionY !== undefined) {
      const host = surface({ x: next.positionX, y: next.positionY });
      if (host.elevation == null) {
        setError(
          "Confirm the Space or Floor elevation before moving this item.",
        );
        return;
      }
      next.spaceId = host.spaceId;
    }
    commit({
      ...scene,
      floors: scene.floors.map((f) =>
        f.id === floor.id
          ? {
              ...f,
              itemInstances: (f.itemInstances ?? []).map((i) =>
                i.id === next.id ? next : i,
              ),
            }
          : f,
      ),
    });
  };
  const pick = async (id: string, variantId: string) => {
    if (!floor || busy) return;
    const request = ++generation.current;
    setPreparing(true);
    setPending(null);
    setError("");
    try {
      // Reconcile publication and configuration at selection, even for cached cards.
      const item = await catalogClient.item(id);
      const variant = item.colors.find(
        (v) => v.id === variantId && v.status === "ACTIVE",
      );
      if (!variant || !item.setup?.publishable || !item.dimensions)
        throw new Error(
          "This item is no longer available. Choose another item.",
        );
      const { preparePlacement } = await import("./placement-model");
      const outline = await preparePlacement(item, variant);
      if (generation.current !== request) return;
      setItems((all) => [...all.filter((i) => i.id !== item.id), item]);
      setOutlines((all) => ({ ...all, [item.baseModelAssetId!]: outline }));
      setPending({ item, variant, floorId: floor.id, rotation: 0 });
      setPointer(null);
      setOpen(false);
      // Return keyboard shortcuts to the canvas after removing the search field.
      opener.current?.focus();
    } catch (e) {
      if (generation.current === request)
        setError(e instanceof Error ? e.message : "Item could not be loaded");
    } finally {
      if (generation.current === request) setPreparing(false);
    }
  };
  const place = (point: Point) => {
    if (!floor || !pending || pending.floorId !== floor.id || busy) return;
    const p = snapped(point),
      host = surface(p);
    if (host.elevation == null) {
      setError(
        "Confirm the selected Space or Floor elevation before placing this Item.",
      );
      return;
    }
    const instance: ProjectItemInstance = {
      id: pending.instanceId ?? crypto.randomUUID(),
      floorId: floor.id,
      spaceId: host.spaceId,
      itemId: pending.item.id,
      variantId: pending.variant.id,
      modelAssetId: pending.item.baseModelAssetId!,
      positionX: p.x,
      positionY: p.y,
      rotation: pending.rotation,
    };
    commit({
      ...scene,
      floors: scene.floors.map((f) =>
        f.id === floor.id
          ? {
              ...f,
              itemInstances: [
                ...(f.itemInstances ?? []).filter((i) => i.id !== instance.id),
                instance,
              ],
            }
          : f,
      ),
    });
    select(instance.id);
    close();
    onNotice("Item placed. Save changes to keep it.");
  };
  const shape = (
    instance: ProjectItemInstance,
    item: Item,
    variant: ItemVariant,
    ghost = false,
  ) => {
    const valid =
      surface({ x: instance.positionX, y: instance.positionY }).elevation !=
      null;
    const outline = outlines[item.baseModelAssetId!];
    const stroke =
      ghost && !valid
        ? "var(--error)"
        : selected === instance.id || ghost
          ? "var(--accent-primary)"
          : "var(--text-secondary)";
    const common = {
      fill:
        selected === instance.id || ghost
          ? "var(--selected-bg)"
          : "var(--surface-secondary)",
      fillOpacity: ghost ? 0.55 : 0.9,
      stroke,
      strokeWidth: 0.025,
      strokeDasharray: ghost ? ".1 .08" : undefined,
    };
    return (
      <g
        key={instance.id}
        data-item-instance={ghost ? undefined : instance.id}
        data-item-variant={variant.id}
        data-model-asset={instance.modelAssetId ?? item.baseModelAssetId}
        data-valid={valid}
        className={ghost ? "item-ghost" : "item-footprint"}
        pointerEvents={ghost ? "none" : undefined}
        transform={`translate(${instance.positionX} ${instance.positionY}) rotate(${(instance.rotation * 180) / Math.PI})`}
        onClick={
          ghost
            ? undefined
            : (e) => {
                if (pending || !["select", "delete"].includes(tool)) return;
                e.stopPropagation();
                if (tool === "delete") {
                  commit({
                    ...scene,
                    floors: scene.floors.map((f) => ({
                      ...f,
                      itemInstances: f.itemInstances?.filter(
                        (i) => i.id !== instance.id,
                      ),
                    })),
                  });
                  select(null);
                } else select(instance.id);
              }
        }
      >
        {outline ? (
          <polygon
            data-representation="geometry-outline"
            points={outline.map((p) => `${p.x},${p.y}`).join(" ")}
            {...common}
          />
        ) : (
          <rect
            data-representation="bounds-fallback"
            x={-item.width! / 2}
            y={-item.depth! / 2}
            width={item.width!}
            height={item.depth!}
            {...common}
          />
        )}
        <path
          d={`M -.12 0 L 0 ${-item.depth! / 2 + 0.08} L .12 0`}
          fill="none"
          stroke={stroke}
          strokeWidth={0.025}
        />
        <text
          y={0.15}
          textAnchor="middle"
          fontSize={0.13}
          fill="var(--text-primary)"
        >
          {item.name}
        </text>
      </g>
    );
  };
  const layer = (
    <g>
      {floor?.itemInstances?.map((instance) => {
        const item = items.find((i) => i.id === instance.itemId),
          variant = item?.variants.find((v) => v.id === instance.variantId);
        return item && variant ? shape(instance, item, variant) : null;
      })}
      {pending &&
        pointer &&
        shape(
          {
            id: "ghost",
            floorId: floor!.id,
            spaceId: null,
            itemId: pending.item.id,
            variantId: pending.variant.id,
            modelAssetId: pending.item.baseModelAssetId!,
            positionX: pointer.x,
            positionY: pointer.y,
            rotation: pending.rotation,
          },
          pending.item,
          pending.variant,
          true,
        )}
    </g>
  );
  const panel = (
    <ItemsLibrary
      open={open}
      busy={preparing || busy}
      onClose={close}
      onPick={(id, variant) => void pick(id, variant)}
    />
  );
  const properties =
    selectedInstance && selectedItem ? (
      <aside className="item-properties">
        <fieldset disabled={busy}>
          <p className="eyebrow">Product instance</p>
          <h3>{selectedItem.name}</h3>
          <p>
            {floor?.name} ·{" "}
            {floor?.rooms.find((r) => r.id === selectedInstance.spaceId)
              ?.name ?? "Floor surface"}
          </p>
          <button
            className="button secondary"
            onClick={() => {
              const variant = selectedItem.variants.find(
                (v) => v.id === selectedInstance.variantId,
              );
              if (!variant || !floor) return;
              activate("items");
              setOpen(false);
              setPointer(null);
              setPending({
                item: selectedItem,
                variant,
                floorId: floor.id,
                rotation: selectedInstance.rotation,
                instanceId: selectedInstance.id,
              });
            }}
          >
            Move Item
          </button>
          <label>
            Placed color
            <select
              value={selectedInstance.variantId}
              onChange={(e) => {
                const next = selectedItem.colors.find(
                  (v) => v.id === e.target.value,
                );
                if (next) edit({ variantId: next.id });
              }}
            >
              {selectedItem.colors
                .filter(
                  (v) =>
                    (v.status === "ACTIVE" &&
                      selectedItem.status === "ACTIVE") ||
                    v.id === selectedInstance.variantId,
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </label>
          {(["positionX", "positionY"] as const).map((k) => (
            <label key={k}>
              {k === "positionX"
                ? `Position X (${units.label})`
                : `Position Y (${units.label})`}
              <input
                type="number"
                step=".05"
                value={units.input(selectedInstance[k])}
                onChange={(e) => {
                  const n = units.toMeters(Number(e.target.value));
                  if (Number.isFinite(n)) edit({ [k]: n });
                }}
              />
            </label>
          ))}
          <label>
            Rotation (degrees)
            <input
              type="number"
              min="-360"
              max="360"
              value={Math.round((selectedInstance.rotation * 180) / Math.PI)}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && Math.abs(n) <= 360)
                  edit({ rotation: (n * Math.PI) / 180 });
              }}
            />
          </label>
          <label>
            Placement surface
            <select
              value={selectedInstance.spaceId ?? ""}
              onChange={(e) => edit({ spaceId: e.target.value || null })}
            >
              <option value="" disabled={floor?.elevation == null}>
                Floor (
                {floor?.elevation == null
                  ? "unknown"
                  : units.format(floor.elevation)}
                )
              </option>
              {floor?.rooms.map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                  disabled={r.floorElevation == null}
                >
                  {r.name} (
                  {r.floorElevation == null
                    ? "unknown"
                    : units.format(r.floorElevation)}
                  )
                </option>
              ))}
            </select>
          </label>
          <div className="fixed-dimensions">
            <p className="eyebrow">Dimensions · Fixed</p>
            <strong>
              {units.value(selectedItem.width!)} ×{" "}
              {units.value(selectedItem.depth!)} ×{" "}
              {units.value(selectedItem.height!)} {units.label}
            </strong>
            <p>Move, rotate, or change color.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              commit({
                ...scene,
                floors: scene.floors.map((f) => ({
                  ...f,
                  itemInstances: (f.itemInstances ?? []).filter(
                    (i) => i.id !== selectedInstance.id,
                  ),
                })),
              });
              select(null);
            }}
          >
            Remove Item
          </button>
        </fieldset>
      </aside>
    ) : null;
  return {
    items,
    panel,
    properties,
    layer,
    error,
    pending,
    pointer,
    preparing,
    isOpen: open,
    valid: pointer ? surface(pointer).elevation != null : false,
    elevation: pointer
      ? (surface(pointer).elevation ?? floor?.elevation ?? 0)
      : (floor?.elevation ?? 0),
    open: () => {
      if (busy) return;
      cancel();
      opener.current = document.activeElement as HTMLElement;
      activate("items");
      setOpen(true);
    },
    place,
    hover: (p: Point | null) => setPointer(p ? snapped(p) : null),
    cancel,
    rotate: () =>
      setPending((p) =>
        p
          ? { ...p, rotation: (p.rotation + Math.PI / 2) % (Math.PI * 2) }
          : null,
      ),
  };
}

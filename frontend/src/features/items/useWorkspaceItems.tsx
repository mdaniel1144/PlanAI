import { useUnits } from "../../units/useUnits";
import { useEffect, useRef, useState } from "react";
import { pointInPolygon } from "@habitat/geometry";
import type {
  Floor,
  HomeScene,
  Item,
  ItemVariant,
  Point,
  ProjectItemInstance,
} from "@habitat/domain";
import { Catalog } from "./Catalog";
import { catalogClient } from "./api";
export function useWorkspaceItems({
  scene,
  floor,
  selected,
  select,
  commit,
  startPlan,
  onNotice,
}: {
  scene: HomeScene;
  floor?: Floor;
  selected: string | null;
  select: (id: string | null) => void;
  commit: (s: HomeScene) => void;
  startPlan: () => void;
  onNotice: (s: string) => void;
}) {
  const units = useUnits();
  const [items, setItems] = useState<Item[]>([]),
    [open, setOpen] = useState(false),
    [pending, setPending] = useState<{
      item: Item;
      variant: ItemVariant;
    } | null>(null),
    [pointer, setPointer] = useState<Point | null>(null),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
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
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [scene.id, scene.revision]);
  useEffect(() => {
    if (open) dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (pending || open)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setOpen(false);
        setPending(null);
        setPointer(null);
      }
      if (e.key === "Tab" && open && dialog.current) {
        const targets = Array.from(
          dialog.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input,select,[tabindex="0"]',
          ),
        );
        const first = targets[0],
          last = targets.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, pending]);
  const selectedInstance = floor?.itemInstances?.find((i) => i.id === selected),
    selectedItem = items.find((i) => i.id === selectedInstance?.itemId);
  const edit = (changes: Partial<ProjectItemInstance>) => {
    if (!floor || !selectedInstance) return;
    commit({
      ...scene,
      floors: scene.floors.map((f) =>
        f.id === floor.id
          ? {
              ...f,
              itemInstances: (f.itemInstances ?? []).map((i) =>
                i.id === selectedInstance.id ? { ...i, ...changes } : i,
              ),
            }
          : f,
      ),
    });
  };
  const pick = (item: Item, variant: ItemVariant) => {
    setItems((all) => [...all.filter((i) => i.id !== item.id), item]);
    setPending({ item, variant });
    setOpen(false);
    setPointer(null);
    setError("");
    startPlan();
  };
  const place = (p: Point) => {
    if (!floor || !pending) return;
    const space = floor.rooms.find(
      (r) => r.boundary.length >= 3 && pointInPolygon(p, r.boundary),
    );
    const elevation = space ? space.floorElevation : floor.elevation;
    if (elevation == null) {
      setError(
        "Confirm the selected Space or Floor elevation before placing this Item.",
      );
      return;
    }
    const instance: ProjectItemInstance = {
      id: crypto.randomUUID(),
      floorId: floor.id,
      spaceId: space?.id ?? null,
      itemId: pending.item.id,
      variantId: pending.variant.id,
      positionX: p.x,
      positionY: p.y,
      rotation: 0,
    };
    commit({
      ...scene,
      floors: scene.floors.map((f) =>
        f.id === floor.id
          ? { ...f, itemInstances: [...(f.itemInstances ?? []), instance] }
          : f,
      ),
    });
    select(instance.id);
    setPending(null);
    setPointer(null);
    setError("");
    onNotice("Item placed. Save changes to keep it.");
  };
  const shape = (
    instance: ProjectItemInstance,
    item: Item,
    variant: ItemVariant,
    ghost = false,
  ) => (
    <g
      key={instance.id}
      data-item-instance={ghost ? undefined : instance.id}
      data-item-variant={variant.id}
      className={ghost ? "item-ghost" : "item-footprint"}
      transform={`translate(${instance.positionX} ${instance.positionY}) rotate(${(instance.rotation * 180) / Math.PI})`}
      onClick={
        ghost
          ? undefined
          : (e) => {
              if (pending) return;
              e.stopPropagation();
              select(instance.id);
            }
      }
    >
      <rect
        x={-item.width! / 2}
        y={-item.depth! / 2}
        width={item.width!}
        height={item.depth!}
        rx={0.03}
        fill={selected === instance.id ? "#adc9a6" : "#d0d5bd"}
        fillOpacity={ghost ? 0.45 : 0.8}
        stroke={selected === instance.id ? "#2e693b" : "#65795e"}
        strokeWidth={0.035}
        strokeDasharray={ghost ? ".1 .08" : undefined}
      />
      <path
        d={`M -.12 0 L 0 ${-item.depth! / 2 + 0.08} L .12 0`}
        fill="none"
        stroke="#49603f"
        strokeWidth={0.03}
      />
      <text y={0.15} textAnchor="middle" fontSize={0.13} fill="#334a31">
        {item.name}
      </text>
    </g>
  );
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
            floorId: floor?.id ?? "",
            spaceId: null,
            itemId: pending.item.id,
            variantId: pending.variant.id,
            positionX: pointer.x,
            positionY: pointer.y,
            rotation: 0,
          },
          pending.item,
          pending.variant,
          true,
        )}
    </g>
  );
  const modal = open ? (
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Item catalog"
      className="catalog-modal"
    >
      <div className="catalog-modal-header">
        <h2>Add Item</h2>
        <button className="button secondary" onClick={() => setOpen(false)}>
          Close catalog
        </button>
      </div>
      <Catalog onAdd={pick} />
    </div>
  ) : null;
  const properties =
    selectedInstance && selectedItem ? (
      <aside className="item-properties">
        <p className="eyebrow">Product instance</p>
        <h3>{selectedItem.name}</h3>
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
                  (v.status === "ACTIVE" && selectedItem.status === "ACTIVE") ||
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
              const n = units.toMeters(Number(e.target.value));
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
              Floor ({floor?.elevation ?? "unknown"} m)
            </option>
            {floor?.rooms.map((r) => (
              <option
                key={r.id}
                value={r.id}
                disabled={r.floorElevation == null}
              >
                {r.name} ({r.floorElevation ?? "unknown"} m)
              </option>
            ))}
          </select>
        </label>
        <p>Fixed product dimensions. Move, rotate, or change color.</p>
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
      </aside>
    ) : null;
  return {
    items,
    modal,
    properties,
    layer,
    error,
    pending: !!pending,
    open: () => {
      setOpen(true);
      setPending(null);
    },
    place,
    hover: setPointer,
    cancel: () => {
      setPending(null);
      setPointer(null);
    },
  };
}

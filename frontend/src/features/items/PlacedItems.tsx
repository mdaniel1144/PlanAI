import type { Floor, Item } from "@habitat/domain";
import { ItemModel } from "./ModelPreview";
export function PlacedItems({
  floor,
  items,
  onSelect,
  onError,
  placing = false,
}: {
  placing?: boolean;
  floor: Floor;
  items: Item[];
  onSelect: (id: string | null) => void;
  onError: (message: string) => void;
}) {
  return (
    <>
      {floor.itemInstances?.map((instance) => {
        const item = items.find((i) => i.id === instance.itemId),
          variant = item?.variants.find((v) => v.id === instance.variantId),
          space = instance.spaceId
            ? floor.rooms.find((r) => r.id === instance.spaceId)
            : null;
        const elevation = space ? space.floorElevation : floor.elevation;
        if (!item || !variant || elevation == null) return null;
        return (
          <group
            key={`${instance.id}:${variant.id}`}
            name={`item:${instance.id}`}
            position={[instance.positionX, elevation, -instance.positionY]}
            rotation={[0, instance.rotation, 0]}
            onClick={(e) => {
              if (placing) return;
              e.stopPropagation();
              onSelect(instance.id);
            }}
          >
            <ItemModel
              item={
                instance.modelAssetId &&
                instance.modelAssetId !== item.baseModelAssetId
                  ? { ...item, baseModelAssetId: instance.modelAssetId }
                  : item
              }
              variant={variant}
              onError={onError}
            />
          </group>
        );
      })}
    </>
  );
}

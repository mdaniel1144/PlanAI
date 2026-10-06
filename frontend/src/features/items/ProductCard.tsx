import { Link } from "react-router-dom";
import { Box, ArrowUpRight } from "lucide-react";
import { formatPrice, type Item } from "@habitat/domain";
import { useUnits } from "../../units/useUnits";
import { ColorSwatch } from "./Studio";
export function ProductCard({
  item,
  admin,
  onSelect,
}: {
  item: Item;
  admin: boolean;
  onSelect: (item: Item) => void;
}) {
  const units = useUnits(),
    variant =
      item.colors.find((v) => v.id === item.defaultVariantId) ?? item.colors[0],
    thumb = item.thumbnailAssetId ?? variant?.thumbnailAssetId;
  const colors = item.colors.filter((c) => c.status === "ACTIVE");
  const content = (
    <>
      <div className="product-card-image">
        {thumb ? (
          <img
            loading="lazy"
            src={`/api/item-assets/${thumb}`}
            alt={item.name}
          />
        ) : (
          <div className="item-placeholder">
            <Box size={40} strokeWidth={0.8} />
            <span>Product image pending</span>
          </div>
        )}
        {admin && (
          <span className={`item-status ${item.status.toLowerCase()}`}>
            {item.status.toLowerCase()}
          </span>
        )}
        <ArrowUpRight className="card-open" size={17} />
      </div>
      <div className="item-card-info">
        <p className="eyebrow">{item.brandName}</p>
        <h3>{item.name}</h3>
        <p className="card-dimensions">
          {item.width
            ? `${units.value(item.width)} × ${units.value(item.depth!)} × ${units.value(item.height!)} ${units.label}`
            : "Dimensions to confirm"}
        </p>
        <div className="card-bottom">
          <strong>
            {variant
              ? formatPrice(variant.priceMinor, variant.currency)
              : item.basePriceMinor !== null
                ? formatPrice(item.basePriceMinor, item.currency)
                : "Price to confirm"}
          </strong>
          <span className="card-colors">
            {colors.slice(0, 3).map((c) => (
              <ColorSwatch key={c.id} name={c.name} color={c.color} />
            ))}
            <small>
              {colors.length} {colors.length === 1 ? "color" : "colors"}
            </small>
          </span>
        </div>
      </div>
    </>
  );
  return admin ? (
    <Link className="item-card" to={`/admin/items/${item.id}`}>
      {content}
    </Link>
  ) : (
    <button className="item-card" onClick={() => onSelect(item)}>
      {content}
    </button>
  );
}

import { FieldError } from "./StudioFields";
import { useState } from "react";
import { catalogClient } from "./api";
import { moneyInput, optionalString } from "./forms";
import { type StepProps, values, text, decimal } from "./studio-forms";
export function Pricing({ item, perform, busy, issues }: StepProps) {
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
        <label className="check-label">
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
      <h3 className="inspector-section-title">Color overrides</h3>
      <p className="inspector-help">
        Leave an override empty to use the product code and base price.
      </p>
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
          <p className="inspector-help">
            {item.samePriceForAllColors || c.priceOverrideMinor === null
              ? "Uses base price"
              : "Custom price"}
          </p>
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

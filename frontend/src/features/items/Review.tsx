import { Check, Circle } from "lucide-react";
import { formatPrice } from "@habitat/domain";
import { useUnits } from "../../units/useUnits";
import { ColorSwatch, StudioSplit } from "./Studio";
import { stages, stepIds } from "./studio-steps";
import { type StepProps } from "./studio-forms";
import { catalogClient } from "./api";
import ModelPreview from "./LazyModelPreview";
export function Review({
  item,
  perform,
  busy,
  go,
}: StepProps & { go: (step: number) => void }) {
  const u = useUnits();
  const readiness = [
    ["Product information", item.setup?.steps[0].complete],
    ["3D model", item.setup?.modelValid],
    ["Dimensions", item.setup?.dimensionsConfirmed],
    ["Color parts", item.setup?.colorTargetsConfigured],
    ["Available colors", item.colors.some((c) => c.status === "ACTIVE")],
    ["Pricing", item.setup?.steps[5].complete],
    ["Product image", item.setup?.thumbnailReady],
  ] as const;
  return (
    <StudioSplit
      viewer={
        <ModelPreview item={item} variant={item.defaultColor ?? undefined} />
      }
    >
      <p className="eyebrow">Product summary</p>
      <dl className="review-facts">
        <div>
          <dt>Collection</dt>
          <dd>
            {item.brandName} / {item.categoryName}
          </dd>
        </div>
        <div>
          <dt>Dimensions · width × depth × height</dt>
          <dd>
            {item.width != null
              ? `${u.value(item.width)} × ${u.value(item.depth!)} × ${u.value(item.height!)} ${u.label}`
              : "Confirm dimensions"}
          </dd>
        </div>
        <div>
          <dt>Available finishes</dt>
          <dd className="review-colors">
            {item.colors
              .filter((c) => c.status === "ACTIVE")
              .map((c) => (
                <span key={c.id}>
                  <ColorSwatch color={c.color} name={c.name} />
                  {c.name}
                </span>
              ))}
          </dd>
        </div>
      </dl>
      <p className="review-default">
        Default color:{" "}
        {item.defaultColor?.name ?? "Add an active color in Available colors."}
      </p>
      <div className="review-price">
        <span className="eyebrow">Product price</span>
        <strong>
          {item.basePriceMinor === null
            ? "Set base price"
            : formatPrice(item.basePriceMinor, item.currency)}
        </strong>
        <small>{item.itemCode || "No product code"}</small>
      </div>
      <ul className="review-readiness" aria-label="Publication checklist">
        {readiness.map(([label, ready]) => (
          <li key={label}>
            <span>
              {ready ? <Check size={13} /> : <Circle size={11} />} {label}
            </span>
            <small>
              {ready
                ? label === "Dimensions"
                  ? "Verified"
                  : "Ready"
                : "Action required"}
            </small>
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
        className="button primary"
        disabled={busy || !item.setup?.publishable || item.status === "ACTIVE"}
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
          className="review-hide"
          disabled={busy}
          onClick={() =>
            void perform(
              () => catalogClient.save(item.id, { status: "INACTIVE" }),
              "Product hidden",
            )
          }
        >
          Hide product
        </button>
      )}
    </StudioSplit>
  );
}

import {
  Check,
  ChevronRight,
  Circle,
  LockKeyhole,
  Box,
  ArrowLeft,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { stages } from "./studio-steps";
import type { Item } from "@habitat/domain";
const shortNames = [
  "Product",
  "3D model",
  "Dimensions",
  "Color parts",
  "Available colors",
  "Price & SKU",
  "Review & publish",
];
export function ProductStudioShell({
  item,
  stage,
  busy,
  unsaved,
  message,
  error,
  go,
  image,
  children,
}: {
  item: Item | null;
  stage: number;
  busy: boolean;
  unsaved: boolean;
  message: string;
  error: string;
  go: (n: number) => void;
  image: ReactNode;
  children: ReactNode;
}) {
  const complete = item?.setup?.steps.filter((s) => s.complete).length ?? 0;
  return (
    <main className="product-studio">
      <header className="studio-header">
        <div>
          <Link className="studio-back" to="/admin/items">
            <ArrowLeft size={14} /> Item library
          </Link>
          <div className="studio-title">
            <h1>{item?.name ?? "New product"}</h1>
            <span className="quiet-status">
              {item?.status.toLowerCase() ?? "Draft"}
            </span>
          </div>
          <p>
            {item
              ? `${item.brandName} / ${item.categoryName}`
              : "Build a product, from model to material."}
          </p>
        </div>
        <div className="studio-header-end">
          <span className="eyebrow">Product studio</span>
          <span
            className={`studio-save ${unsaved ? "is-dirty" : ""}`}
            role="status"
          >
            {busy
              ? "Saving…"
              : unsaved
                ? "Unsaved changes"
                : message || (item ? "Saved" : "New draft")}
            {!busy && !unsaved && item && <Check size={13} />}
          </span>
          <button
            className="button secondary"
            disabled={!item || busy}
            onClick={() => go(6)}
          >
            Preview & review <ChevronRight size={14} />
          </button>
        </div>
      </header>
      <div className="studio-body">
        <aside className="studio-rail">
          <p className="eyebrow">Product setup</p>
          <nav className="item-stages" aria-label="Item setup">
            {stages.map((name, i) => {
              const step = item?.setup?.steps[i],
                blocked = (!item && i !== 0) || (!!step && !step.accessible);
              return (
                <button
                  key={name}
                  aria-label={`${i + 1}. ${name}`}
                  aria-current={stage === i ? "step" : undefined}
                  disabled={busy || blocked}
                  className={`${stage === i ? "selected" : ""} ${stage === i && error ? "has-error" : ""}`}
                  onClick={() => go(i)}
                >
                  <span className="step-number">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    {shortNames[i]}
                    <small>
                      {stage === i
                        ? error
                          ? "Needs attention"
                          : "Current step"
                        : step?.complete
                          ? "Complete"
                          : blocked
                            ? "Finish earlier steps"
                            : "Action required"}
                    </small>
                  </span>
                  {step?.complete ? (
                    <Check size={14} />
                  ) : blocked ? (
                    <LockKeyhole size={12} />
                  ) : (
                    <Circle size={9} />
                  )}
                </button>
              );
            })}
          </nav>
          <details className="studio-readiness">
            <summary>
              Setup <strong>{complete} / 7</strong>
            </summary>
            <ul>
              {stages.map((name, i) => (
                <li key={name}>
                  {item?.setup?.steps[i].complete ? "✓" : "○"} {name}
                </li>
              ))}
            </ul>
          </details>
          <div id="product-image">{image}</div>
          {!!item?.usageCount && (
            <p className="studio-use">
              Used in {item.usageCount} project instances
            </p>
          )}
        </aside>
        <div className="studio-content">{children}</div>
      </div>
    </main>
  );
}
export function StudioSplit({
  viewer,
  children,
}: {
  viewer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="studio-split">
      <div className="studio-visual">{viewer}</div>
      <div className="studio-inspector">{children}</div>
    </div>
  );
}
export function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
export function StudioEmpty({
  title = "Your product, in focus",
  detail = "Add a GLB model to see your product take shape.",
}: {
  title?: string;
  detail?: string;
}) {
  return (
    <div className="studio-empty">
      <Box size={56} strokeWidth={0.7} />
      <h3>{title}</h3>
      <p>{detail}</p>
      <span className="eyebrow">Habitat / Product studio</span>
    </div>
  );
}
export function ColorSwatch({
  color,
  name,
  selected,
  onClick,
}: {
  color: string | null;
  name: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return onClick ? (
    <button
      type="button"
      className={`swatch-button ${selected ? "selected" : ""}`}
      aria-label={`Preview ${name}`}
      aria-pressed={!!selected}
      title={name}
      onClick={onClick}
    >
      <span style={{ background: color ?? "var(--studio-border)" }} />
    </button>
  ) : (
    <span
      className="color-swatch"
      title={name}
      style={{ background: color ?? "var(--studio-border)" }}
    />
  );
}

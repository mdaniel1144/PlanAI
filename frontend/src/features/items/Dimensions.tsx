import { useEffect, useMemo, useState } from "react";
import {
  dimensionSourceSchema,
  dimensionPlausibility,
  orientedModelDimensions,
  uniformCalibration,
  renderedDimensionsMatch,
  type Item,
  type WorldBoundsMeters,
} from "@habitat/domain";
import { useUnits } from "../../units/useUnits";
import { LengthInput } from "../../units/LengthInput";
import { StudioSplit, InspectorSection } from "./Studio";
import { catalogClient } from "./api";
import ModelPreview from "./LazyModelPreview";
export function Dimensions({
  item,
  perform,
  busy,
  onDirty,
}: {
  item: Item;
  busy: boolean;
  onDirty?: () => void;
  issues?: { field: string; message: string }[];
  perform: (action: () => Promise<Item>, success?: string) => Promise<void>;
}) {
  const units = useUnits(),
    asset = item.assets.find((a) => a.id === item.baseModelAssetId);
  const [real, setReal] = useState({
    width: item.width,
    depth: item.depth,
    height: item.height,
  });
  const [orientation, setOrientation] = useState<0 | 90 | 180 | 270>(
    asset?.calibration?.orientation ?? 0,
  );
  const [source, setSource] = useState(
    item.dimensionVerification?.dimensionSource ?? "",
  );
  const [verified, setVerified] = useState(false),
    [ack, setAck] = useState(false);
  const [proof, setProof] = useState<{
    key: string;
    bounds?: WorldBoundsMeters;
    error?: string;
  } | null>(null);
  const candidate = useMemo(() => {
    if (!asset?.inspection || !real.width || !real.depth || !real.height)
      return null;
    try {
      return {
        ...asset,
        calibration: uniformCalibration(asset.inspection.dimensions, {
          width: real.width,
          depth: real.depth,
          height: real.height,
          orientation,
          confirmed: true,
        }),
      };
    } catch {
      return null;
    }
  }, [asset, real, orientation]);
  const key = JSON.stringify([asset?.id, real, orientation]);
  useEffect(() => {
    if (!candidate) return;
    let active = true;
    void import("./measure-model")
      .then((m) => m.measureCalibratedModel(candidate))
      .then((bounds) => {
        if (active) setProof({ key, bounds });
      })
      .catch((e) => {
        if (active)
          setProof({
            key,
            error: e instanceof Error ? e.message : "Could not measure model",
          });
      });
    return () => {
      active = false;
    };
  }, [candidate, key]);
  if (!asset?.inspection) return <p>Upload a GLB first.</p>;
  const canonical =
    real.width && real.depth && real.height
      ? { width: real.width, depth: real.depth, height: real.height }
      : null;
  const warning = canonical
    ? dimensionPlausibility(item.categoryId, canonical)
    : null;
  const bounds = proof?.key === key ? proof.bounds : undefined;
  const renderedValid =
    !!bounds && !!canonical && renderedDimensionsMatch(bounds, canonical);
  const oriented = orientedModelDimensions(
    asset.inspection.dimensions,
    orientation,
  );
  const size = (d: { width: number; depth: number; height: number }) =>
    `${units.value(d.width)} × ${units.value(d.depth)} × ${units.value(d.height)} ${units.label}`;
  const change = () => {
    onDirty?.();
    setVerified(false);
    setAck(false);
  };
  return (
    <StudioSplit
      viewer={
        <>
          <ModelPreview
            item={
              candidate
                ? {
                    ...item,
                    assets: item.assets.map((a) =>
                      a.id === candidate.id ? candidate : a,
                    ),
                  }
                : item
            }
            variant={item.defaultColor ?? undefined}
            previewOrientation={orientation}
          />
          <div className="model-source">
            <h3>Raw GLB bounds</h3>
            <p>
              {(["width", "depth", "height"] as const)
                .map((k) => asset.inspection!.dimensions[k].toFixed(4))
                .join(" × ")}{" "}
              model units (width × depth × height)
            </p>
            <p>Model-space units, not verified real dimensions.</p>
            <p>
              Oriented model axes: width {oriented.width.toFixed(4)}, depth{" "}
              {oriented.depth.toFixed(4)}, height {oriented.height.toFixed(4)}{" "}
              model units.
            </p>
          </div>
        </>
      }
    >
      <form
        className="item-form item-dimensions-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (
            !canonical ||
            !bounds ||
            !renderedValid ||
            !verified ||
            !source ||
            (warning && !ack)
          )
            return;
          void perform(
            () =>
              catalogClient.action(
                item.id,
                `assets/${asset.id}/calibration`,
                {
                  ...canonical,
                  orientation,
                  confirmed: true,
                  dimensionSource: source,
                  dimensionsVerified: true,
                  unusualDimensionsAcknowledged: ack,
                  renderedBoundsMeters: bounds,
                },
                "PATCH",
              ),
            "Real product dimensions verified.",
          );
        }}
      >
        <InspectorSection title="Real product dimensions">
          <p className="inspector-help">
            Enter measurements from the real product. The model will keep its
            proportions.
          </p>
          <fieldset
            className="orientation-control"
            disabled={!!item.usageCount}
          >
            <legend>Product orientation</legend>
            <div className="segmented-control">
              {([0, 90, 180, 270] as const).map((n) => (
                <label key={n}>
                  <input
                    type="radio"
                    name="orientation"
                    aria-label={`${n}°`}
                    checked={orientation === n}
                    onChange={() => {
                      setOrientation(n);
                      change();
                    }}
                  />
                  <span>{n}°</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="inspector-help">
            Maps model axes to width and depth. Camera movement never changes
            dimensions.
          </p>
          <div className="dimension-inputs">
            {(["width", "depth", "height"] as const).map((k) => (
              <label className="dimension-row" key={k}>
                <span className="capitalize">{k}</span>
                <span className="unit-input">
                  <LengthInput
                    aria-label={`Real ${k} (${units.label})`}
                    required
                    compact
                    min="0.000001"
                    meters={real[k]}
                    disabled={!!item.usageCount}
                    onEmpty={() => {
                      setReal((prev) => ({ ...prev, [k]: null }));
                      change();
                    }}
                    onMetersChange={(n) => {
                      setReal((prev) => ({ ...prev, [k]: n }));
                      change();
                    }}
                  />
                  <span aria-hidden="true">{units.label}</span>
                </span>
              </label>
            ))}
          </div>
        </InspectorSection>
        <InspectorSection title="Validation">
          {canonical ? (
            <div
              className="dimension-validation"
              aria-label="Dimension validation"
            >
              <p
                role="status"
                className={candidate ? "validation-ok" : "validation-warning"}
              >
                {candidate
                  ? "✓ Model proportions match"
                  : "Dimensions would stretch the model. Check width, depth and height."}
              </p>
              <p className="inspector-help">
                A shape check, not proof of real-world size.
              </p>
              <p
                role="status"
                className={renderedValid ? "validation-ok" : "inspector-help"}
              >
                {renderedValid
                  ? "✓ Rendered calibrated size matches product dimensions"
                  : candidate && !bounds
                    ? "Checking rendered calibrated size…"
                    : "Rendered size has not been verified."}
              </p>
              {warning && (
                <div className="dimension-warning">
                  <p role="alert">{warning.message}</p>
                  {warning.suggestedFactor && (
                    <p>
                      Suggested interpretation:{" "}
                      {size({
                        width: canonical.width * warning.suggestedFactor,
                        depth: canonical.depth * warning.suggestedFactor,
                        height: canonical.height * warning.suggestedFactor,
                      })}
                      . Check the units against your source before correcting
                      the inputs.
                    </p>
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                    />
                    These unusual dimensions are correct.
                  </label>
                </div>
              )}
            </div>
          ) : (
            <p className="inspector-help">
              Enter all three measurements to check the model.
            </p>
          )}
        </InspectorSection>
        <InspectorSection title="Verification">
          <label>
            Dimension source
            <select
              required
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setVerified(false);
              }}
            >
              <option value="">Choose a verified source</option>
              {dimensionSourceSchema.options.map((v) => (
                <option key={v} value={v}>
                  {v.toLowerCase().replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              required
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I have verified these dimensions against the real product.
          </label>
          <button
            className="button primary"
            disabled={
              busy ||
              !candidate ||
              !renderedValid ||
              !source ||
              !verified ||
              (!!warning && !ack)
            }
          >
            Confirm dimensions
          </button>
          {item.calibrationStatus === "VERIFIED" && item.dimensions ? (
            <p className="confirmation-summary">
              Confirmed real product size: {size(item.dimensions)} · Product
              orientation: {asset.calibration?.orientation}°
            </p>
          ) : (
            <p className="inspector-help">
              Dimensions unverified. A verified source is required.
            </p>
          )}
        </InspectorSection>
      </form>
      <details className="advanced-details">
        <summary>Advanced calibration</summary>
        <p>Oriented raw bounds (model units): {JSON.stringify(oriented)}</p>
        <p>
          Implied scale X: {canonical ? canonical.width / oriented.width : "—"};
          Y: {canonical ? canonical.height / oriented.height : "—"}; Z:{" "}
          {canonical ? canonical.depth / oriented.depth : "—"}
        </p>
        <p>
          Metres per model unit:{" "}
          {candidate?.calibration?.metresPerModelUnit ?? "—"}
        </p>
        <p>Canonical metres: {JSON.stringify(real)}</p>
        <p>Anchor: bottom-center</p>
        <p>
          Measured world bounds: {bounds ? JSON.stringify(bounds) : "Pending"}
        </p>
        {warning && <p>{warning.code}</p>}
        {canonical && !candidate && <p>MODEL_DIMENSION_PROPORTION_MISMATCH</p>}
        {canonical && !renderedValid && (
          <p>MODEL_RENDERED_DIMENSION_MISMATCH</p>
        )}
        {proof?.key === key && proof.error && <p>{proof.error}</p>}
        {item.dimensionVerification && (
          <p>
            Verified by {item.dimensionVerification.verifiedByUserId} at{" "}
            {item.dimensionVerification.verifiedAt}; source:{" "}
            {item.dimensionVerification.dimensionSource}
          </p>
        )}
      </details>
    </StudioSplit>
  );
}

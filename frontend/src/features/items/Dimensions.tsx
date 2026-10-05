import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { catalogClient } from "./api";
const ModelPreview = lazy(() => import("./ModelPreview"));
export function Dimensions({
  item,
  perform,
  busy,
}: {
  item: Item;
  busy: boolean;
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
    setVerified(false);
    setAck(false);
  };
  return (
    <>
      <h2>Raw GLB bounds</h2>
      <p>
        {(["width", "depth", "height"] as const)
          .map((k) => asset.inspection!.dimensions[k].toFixed(4))
          .join(" × ")}{" "}
        model units (width × depth × height)
      </p>
      <p>
        These are model-space units and are not yet verified real product
        dimensions.
      </p>
      {item.calibrationStatus === "VERIFIED" && item.dimensions ? (
        <p>
          Confirmed real product size: {size(item.dimensions)} · Product
          orientation: {asset.calibration?.orientation}°
        </p>
      ) : (
        <p>
          Dimensions unverified. Existing saved measurements require a verified
          source.
        </p>
      )}
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
        <label>
          Product orientation
          <select
            value={orientation}
            disabled={!!item.usageCount}
            onChange={(e) => {
              setOrientation(Number(e.target.value) as typeof orientation);
              change();
            }}
          >
            {[0, 90, 180, 270].map((n) => (
              <option key={n} value={n}>
                {n}°
              </option>
            ))}
          </select>
        </label>
        <p>
          Defines how the 3D model axes map to product width/depth. Camera
          movement does not change product dimensions.
        </p>
        <p>
          Oriented model axes: width {oriented.width.toFixed(4)}, depth{" "}
          {oriented.depth.toFixed(4)}, height {oriented.height.toFixed(4)} model
          units.
        </p>
        <h2>Real product dimensions</h2>
        <p>Display unit: {units.label} (from Display &amp; Units settings)</p>
        {(["width", "depth", "height"] as const).map((k) => (
          <label key={k}>
            Real {k} ({units.label})
            <LengthInput
              required
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
          </label>
        ))}
        {canonical && (
          <div aria-label="Dimension validation">
            <p role="status">
              {candidate
                ? "✓ Model proportions match. This checks shape, not real-world accuracy."
                : "MODEL_DIMENSION_PROPORTION_MISMATCH: These dimensions would stretch the model."}
            </p>
            {warning ? (
              <>
                <p role="alert">
                  {warning.code}: {warning.message}
                </p>
                {warning.suggestedFactor && (
                  <p>
                    Suggested interpretation:{" "}
                    {size({
                      width: canonical.width * warning.suggestedFactor,
                      depth: canonical.depth * warning.suggestedFactor,
                      height: canonical.height * warning.suggestedFactor,
                    })}
                    . Did you intend these values in{" "}
                    {warning.suggestedFactor === 100
                      ? "metres rather than centimeters"
                      : "centimeters rather than metres"}
                    ? Check a verified source and correct the inputs explicitly.
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
              </>
            ) : (
              <p>
                {dimensionPlausibility(item.categoryId, canonical) === null
                  ? "No category size warning. Real measurements still require verification."
                  : ""}
              </p>
            )}
            <p role="status">
              {renderedValid
                ? "✓ Rendered calibrated size matches product dimensions"
                : candidate && !bounds
                  ? "Checking rendered calibrated size…"
                  : "MODEL_RENDERED_DIMENSION_MISMATCH: Rendered size has not been verified."}
            </p>
          </div>
        )}
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
          className="button"
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
      </form>
      <details>
        <summary>Advanced calibration</summary>
        <p>Oriented raw bounds (model units): {JSON.stringify(oriented)}</p>
        <p>
          Implied scale X (width):{" "}
          {canonical ? canonical.width / oriented.width : "—"}; Y (height):{" "}
          {canonical ? canonical.height / oriented.height : "—"}; Z (depth):{" "}
          {canonical ? canonical.depth / oriented.depth : "—"}
        </p>
        <p>
          Calculated metres per model unit:{" "}
          {candidate?.calibration?.metresPerModelUnit ?? "—"}
        </p>
        <p>Canonical dimensions in metres: {JSON.stringify(real)}</p>
        <p>Anchor: bottom-center</p>
        <p>
          Measured world bounds in metres:{" "}
          {bounds ? JSON.stringify(bounds) : "Pending"}
        </p>
        {proof?.key === key && proof.error && <p>{proof.error}</p>}
        {item.dimensionVerification && (
          <p>
            Verified by {item.dimensionVerification.verifiedByUserId} at{" "}
            {item.dimensionVerification.verifiedAt}; source:{" "}
            {item.dimensionVerification.dimensionSource}
          </p>
        )}
      </details>
      <Suspense fallback={<p>Loading preview…</p>}>
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
        />
      </Suspense>
    </>
  );
}

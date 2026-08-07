// Pure ranking math for the /rankings page. No React, no DOM — easy to
// unit-test on its own.
//
// WEIGHTING MODEL
// Each variable gets a raw numeric weight (0-10). `weights` is the only
// state a caller needs to track:
//   { price: 6, model_quality: 8, feature_coverage: 0 }
// weightsToFractions() turns that into normalized 0-1 fractions (dividing
// each raw value by the sum of all three) for rankPlans() to consume — i.e.
// each variable's weight is just its share of the total points assigned.
// NOTE: cost-per-task is intentionally NOT part of the ranking formula (per
// request) — it's still displayed elsewhere (Plans table, model pages) but
// doesn't factor into Rank score.

export const VARIABLES = ["price", "model_quality", "feature_coverage"];

export const VARIABLE_META = {
  price: {
    label: "Price",
    hint: "cheaper wins",
    help: "Turn this up to favor lower-priced plans. Turn it down if price doesn't matter much to you.",
  },
  model_quality: {
    label: "Model quality",
    hint: "smarter wins",
    help: "Turn this up to favor plans whose best accessible model scores higher on the AA Intelligence Index. Turn it down if raw capability matters less to you.",
  },
  feature_coverage: {
    label: "Feature coverage",
    hint: "more matches wins",
    help: "Turn this up to favor plans that support more of the features you selected above. Turn it down if feature support matters less to you.",
  },
};

// (a) Raw weight bounds for the numeric inputs.
export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 10;
export const DEFAULT_WEIGHT = 5;

// (b) Preset weight combos. Placeholders to retune later, not final — chosen
// to be directionally sensible (best_value leans on price with a little
// feature-coverage pull; best_performance leans hard on quality).
export const PRESETS = {
  best_value: { price: 8, model_quality: 5, feature_coverage: 2 },
  best_performance: { price: 2, model_quality: 10, feature_coverage: 2 },
};

export const PRESET_LABELS = {
  best_value: "Best value",
  best_performance: "Best performance",
};

function numOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Weights state helpers

// Initial weights on first load: everything at the default weight except
// feature_coverage, which starts at 0 unless the caller already has
// features selected (e.g. restoring from some other source — not currently
// used, but keeps the helper honest about its precondition).
export function createDefaultWeights(featureCoverageAvailable = false) {
  return {
    price: DEFAULT_WEIGHT,
    model_quality: DEFAULT_WEIGHT,
    feature_coverage: featureCoverageAvailable ? DEFAULT_WEIGHT : 0,
  };
}

export function nonZeroCount(weights) {
  return VARIABLES.filter((k) => Number(weights[k]) > 0).length;
}

// True when this variable is currently the ONLY non-zero one, meaning it
// can't be dropped to 0 without leaving every weight at 0 (which would make
// the fractions undefined). Used to show a hint next to its input.
export function isLastNonZero(weights, key) {
  return Number(weights[key]) > 0 && nonZeroCount(weights) === 1;
}

// Attempts to set `key` to `rawValue` (clamped to [MIN_WEIGHT, MAX_WEIGHT]).
// Returns `weights` unchanged (a no-op) if this would leave every weight at
// 0 — the same rule isLastNonZero() flags in the UI, kept here too as a
// belt-and-suspenders guard against any caller that bypasses it.
export function setWeight(weights, key, rawValue) {
  const n = Number(rawValue);
  const clamped = Number.isNaN(n) ? 0 : Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, n));
  const next = { ...weights, [key]: clamped };
  if (nonZeroCount(next) === 0) return weights;
  return next;
}

// Force feature_coverage to 0 (spec 4, filter emptied) and grays its input
// at the component layer. If feature_coverage happened to be the sole
// non-zero variable, forcing it to zero would leave every weight at 0 — in
// that edge case we bump price back to the default weight so the state
// stays valid. Returns `weights` unchanged if feature_coverage is already 0.
export function forceDisableFeatureCoverage(weights) {
  if (Number(weights.feature_coverage) === 0) return weights;
  let next = { ...weights, feature_coverage: 0 };
  if (nonZeroCount(next) === 0) next = { ...next, price: DEFAULT_WEIGHT };
  return next;
}

// Re-enable feature_coverage (spec 4, a feature gets selected again),
// restoring it to `restoreValue` (the weight it held immediately before
// being force-disabled — the caller is expected to have remembered that;
// falls back to DEFAULT_WEIGHT if nothing was tracked, e.g. on first load).
// No-op if it's already active.
export function restoreFeatureCoverage(weights, restoreValue = DEFAULT_WEIGHT) {
  if (Number(weights.feature_coverage) !== 0) return weights;
  const restored = Number(restoreValue) > 0 ? Number(restoreValue) : DEFAULT_WEIGHT;
  return { ...weights, feature_coverage: restored };
}

// weights -> plain 0-1 fractions for scoring (always sums to 1, since it's
// each raw weight divided by the sum of all three — guaranteed non-zero by
// the min-one-active guard above).
export function weightsToFractions(weights) {
  const raw = VARIABLES.map((k) => Number(weights[k]) || 0);
  const sum = raw.reduce((a, b) => a + b, 0);
  const fractions = {};
  VARIABLES.forEach((k, i) => { fractions[k] = sum > 0 ? raw[i] / sum : 0; });
  return fractions;
}

// ---------------------------------------------------------------------------
// Scoring

function makeNormalizer(values, { invert = false } = {}) {
  const nums = values.filter((v) => v !== null);
  if (nums.length === 0) return () => 0.5;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  return (raw) => {
    if (raw === null) return 0.5;
    if (range === 0) return 1;
    const pct = (raw - min) / range;
    return invert ? 1 - pct : pct;
  };
}

// Fraction of `selectedFeatureNames` that this plan supports (supported ===
// true) — supported-among-selected / selected-count, NOT
// supported / total-tracked-features. Returns null when nothing is
// selected — feature_coverage's weight is forced to 0 in that state anyway,
// so its score value is moot, but null (rather than a stand-in like 0 or 1)
// keeps that explicit for anything inspecting rows.
export function computeFeatureCoverage(plan, selectedFeatureNames) {
  if (!selectedFeatureNames || selectedFeatureNames.length === 0) return null;
  const supportedCount = selectedFeatureNames.filter((name) =>
    (plan.features || []).some((f) => f.feature_name === name && f.supported === true)
  ).length;
  return supportedCount / selectedFeatureNames.length;
}

// Ranks `plans` by a weighted blend of price (inverted), model quality, and
// feature coverage. `fractions` is a plain
// {price, model_quality, feature_coverage} map of 0-1 weights — typically
// weightsToFractions(weights). Normalization is min-max over the plans
// passed in — call this with the already-filtered set. Cost-per-task is
// NOT part of this formula (per request) — it's still available on each
// plan record for display, just not scored here.
//
// Plans are split into two tiers, in this order:
//   1. Scored — has a model-quality score. Ranked by __rankScore, highest
//      first.
//   2. No accessible model with a scored quality index at all — excluded
//      from normalization and scoring entirely, appended last in original
//      order, __rankScore: null, __noModelData: true.
export function rankPlans(plans, fractions, selectedFeatureNames = []) {
  const scored = [];
  const noQuality = [];
  for (const p of plans || []) {
    if (numOrNull(p.best_model_quality_score) === null) noQuality.push(p);
    else scored.push(p);
  }

  const priceNorm = makeNormalizer(scored.map((p) => numOrNull(p.base_price_usd_monthly)), { invert: true });
  const qualityNorm = makeNormalizer(scored.map((p) => numOrNull(p.best_model_quality_score)));

  const rankedScored = scored.map((p) => {
    const featureCoverage = computeFeatureCoverage(p, selectedFeatureNames) ?? 0;
    const priceScore = priceNorm(numOrNull(p.base_price_usd_monthly));
    const qualityScore = qualityNorm(numOrNull(p.best_model_quality_score));
    const rankScore =
      (fractions.price ?? 0) * priceScore +
      (fractions.model_quality ?? 0) * qualityScore +
      (fractions.feature_coverage ?? 0) * featureCoverage;
    return {
      ...p,
      __priceScore: priceScore,
      __qualityScore: qualityScore,
      __featureCoverage: featureCoverage,
      __rankScore: rankScore,
      __noModelData: false,
    };
  });
  rankedScored.sort((a, b) => b.__rankScore - a.__rankScore);

  const flaggedUnscored = noQuality.map((p) => ({
    ...p,
    __priceScore: null,
    __qualityScore: null,
    __featureCoverage: computeFeatureCoverage(p, selectedFeatureNames) ?? 0,
    __rankScore: null,
    __noModelData: true,
  }));

  return [...rankedScored, ...flaggedUnscored];
}
// Pure ranking math for the /rankings page. No React, no DOM — easy to
// unit-test on its own.
//
// WEIGHTING MODEL
// Each variable gets a raw numeric weight (0-10). `weights` is the only
// state a caller needs to track:
//   { price: 6, model_quality: 8, cost_per_task: 4 }
// weightsToFractions() turns that into normalized 0-1 fractions (dividing
// each raw value by the sum of all three) for rankPlans() to consume — i.e.
// each variable's weight is just its share of the total points assigned.

export const VARIABLES = ["price", "model_quality", "cost_per_task"];

export const VARIABLE_META = {
  price: { label: "Price", hint: "lower is better" },
  model_quality: { label: "Model quality", hint: "higher is better" },
  cost_per_task: { label: "Cost per task", hint: "lower is better" },
};

// (a) Raw weight bounds for the numeric inputs.
export const MIN_WEIGHT = 0;
export const MAX_WEIGHT = 10;
export const DEFAULT_WEIGHT = 5;

// (b) Preset weight combos. Placeholders to retune later, not final — chosen
// to be directionally sensible (best_value leans on price/cost;
// best_performance leans hard on quality).
export const PRESETS = {
  best_value: { price: 8, model_quality: 5, cost_per_task: 8 },
  best_performance: { price: 2, model_quality: 10, cost_per_task: 5 },
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

// Initial weights on first load: everything at the default weight.
export function createDefaultWeights() {
  return {
    price: DEFAULT_WEIGHT,
    model_quality: DEFAULT_WEIGHT,
    cost_per_task: DEFAULT_WEIGHT,
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

// Ranks `plans` by a weighted blend of price (inverted), model quality, and
// cost-per-task (inverted). `fractions` is a plain
// {price, model_quality, cost_per_task} map of 0-1 weights — typically
// weightsToFractions(weights). Normalization is min-max over the plans
// passed in — call this with the already-filtered set.
//
// Plans are split into three tiers, in this order:
//   1. Fully scored — has both a model-quality score AND a usable
//      (present and > 0) best-model cost-per-task figure. Ranked by
//      __rankScore, highest first.
//   2. Has model-quality data but no usable cost-per-task figure (missing
//      or 0) — pushed to the bottom rather than scored with a placeholder
//      cost, since a missing/zero cost isn't a real "free" signal. Kept in
//      original order, __rankScore: null, __noCostData: true.
//   3. No accessible model with a scored quality index at all — excluded
//      from normalization and scoring entirely, appended last in original
//      order, __rankScore: null, __noModelData: true.
export function rankPlans(plans, fractions) {
  const withQuality = [];
  const noQuality = [];
  for (const p of plans || []) {
    if (numOrNull(p.best_model_quality_score) === null) noQuality.push(p);
    else withQuality.push(p);
  }

  const scored = [];
  const noCost = [];
  for (const p of withQuality) {
    const cost = numOrNull(p.best_model_cost_per_task_usd);
    if (cost === null || cost === 0) noCost.push(p);
    else scored.push(p);
  }

  const priceNorm = makeNormalizer(scored.map((p) => numOrNull(p.base_price_usd_monthly)), { invert: true });
  const qualityNorm = makeNormalizer(scored.map((p) => numOrNull(p.best_model_quality_score)));
  const costNorm = makeNormalizer(scored.map((p) => numOrNull(p.best_model_cost_per_task_usd)), { invert: true });

  const rankedScored = scored.map((p) => {
    const priceScore = priceNorm(numOrNull(p.base_price_usd_monthly));
    const qualityScore = qualityNorm(numOrNull(p.best_model_quality_score));
    const costScore = costNorm(numOrNull(p.best_model_cost_per_task_usd));
    const rankScore =
      (fractions.price ?? 0) * priceScore +
      (fractions.model_quality ?? 0) * qualityScore +
      (fractions.cost_per_task ?? 0) * costScore;
    return {
      ...p,
      __priceScore: priceScore,
      __qualityScore: qualityScore,
      __costScore: costScore,
      __rankScore: rankScore,
      __noModelData: false,
      __noCostData: false,
    };
  });
  rankedScored.sort((a, b) => b.__rankScore - a.__rankScore);

  const flaggedNoCost = noCost.map((p) => ({
    ...p,
    __priceScore: null,
    __qualityScore: null,
    __costScore: null,
    __rankScore: null,
    __noModelData: false,
    __noCostData: true,
  }));

  const flaggedUnscored = noQuality.map((p) => ({
    ...p,
    __priceScore: null,
    __qualityScore: null,
    __costScore: null,
    __rankScore: null,
    __noModelData: true,
    __noCostData: false,
  }));

  return [...rankedScored, ...flaggedNoCost, ...flaggedUnscored];
}
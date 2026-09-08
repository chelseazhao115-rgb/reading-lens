import fs from 'node:fs';
import { ALL_DIAGNOSES, PRIMARY_ERRORS } from '../src/taxonomy.js';
import { quoteExistsInPassage } from '../src/text.js';
import { diagnose } from '../src/diagnostic-engine.js';
import { isTeacherAttestedReview, reviewProgress } from '../src/review-store.js';

export function withBaselinePredictions(candidates) {
  return candidates.map((item) => {
    const prediction = diagnose(item);
    return {
      ...structuredClone(item),
      predicted_primary_error: prediction.primary_error,
      predicted_confidence: prediction.confidence,
      prediction_status: prediction.status,
      prediction_requires_teacher_review: prediction.requires_teacher_review,
      prediction_provider: 'rule-baseline-engine-snapshot',
      prediction_prompt_version: 'none',
      prediction_model_version: 'deterministic-v2-safe-abstention'
    };
  });
}

export function loadFrozenReviewPack() {
  const file = new URL('./review-pack.json', import.meta.url);
  if (!fs.existsSync(file)) throw new Error('Frozen review pack is missing.');
  const items = JSON.parse(fs.readFileSync(file, 'utf8'));
  const validation = validateReviewCandidates(items);
  const completeness = validatePredictionSnapshotCompleteness(items);
  if (!validation.valid || validation.count !== 50 || !completeness.valid) {
    throw new Error(`Frozen review pack is invalid: ${[...validation.errors, ...completeness.errors].join('; ')}`);
  }
  return structuredClone(items);
}

export function validatePredictionSnapshotCompleteness(items) {
  const errors = [];
  for (const item of items) {
    if (!ALL_DIAGNOSES.includes(item.predicted_primary_error)) errors.push(`${item.id}: predicted_primary_error is missing or invalid`);
    if (!Number.isFinite(item.predicted_confidence)) errors.push(`${item.id}: predicted_confidence is missing or invalid`);
    if (typeof item.prediction_status !== 'string' || !item.prediction_status) errors.push(`${item.id}: prediction_status is missing`);
    if (typeof item.prediction_requires_teacher_review !== 'boolean') errors.push(`${item.id}: prediction_requires_teacher_review is missing`);
    if (!item.prediction_provider) errors.push(`${item.id}: prediction_provider is missing`);
    if (item.prediction_prompt_version === undefined || item.prediction_prompt_version === null) errors.push(`${item.id}: prediction_prompt_version is missing`);
    if (!item.prediction_model_version) errors.push(`${item.id}: prediction_model_version is missing`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateReviewCandidates(candidates) {
  const errors = [];
  const ids = new Set();
  for (const item of candidates) {
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (!ALL_DIAGNOSES.includes(item.proposed_primary_error)) errors.push(`${item.id}: invalid proposed label`);
    if (!['pending', 'approved', 'rejected', 'needs_revision'].includes(item.review_status)) errors.push(`${item.id}: invalid review status`);
    if (!item.passage || !item.question || !item.question_type) errors.push(`${item.id}: missing core question fields`);
    const expectedInvalidEvidence = item.proposed_primary_error === 'data_error';
    const evidenceValid = quoteExistsInPassage(item.standard_evidence?.quote ?? '', item.passage);
    if (!expectedInvalidEvidence && !evidenceValid) errors.push(`${item.id}: standard evidence is not an exact passage quote`);
    if (expectedInvalidEvidence && evidenceValid) errors.push(`${item.id}: data_error case does not contain a data error`);
  }
  return {
    valid: errors.length === 0,
    count: candidates.length,
    distribution: distribution(candidates, 'proposed_primary_error'),
    errors
  };
}

export function validatePredictionSnapshotIntegrity(items, seeds) {
  const fields = [
    'predicted_primary_error', 'predicted_confidence', 'prediction_status', 'prediction_requires_teacher_review',
    'prediction_provider', 'prediction_prompt_version', 'prediction_model_version'
  ];
  const seedById = new Map(seeds.map((item) => [item.id, item]));
  const errors = [];
  for (const item of items) {
    const seed = seedById.get(item.id);
    if (!seed) { errors.push(`${item.id}: unknown prediction case`); continue; }
    for (const field of fields) {
      if (item[field] !== seed[field]) errors.push(`${item.id}: ${field} was modified or missing`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function goldCases(candidates) {
  return candidates.filter((item) =>
    item.review_status === 'approved'
    && ALL_DIAGNOSES.includes(item.reviewer_label)
    && typeof item.reviewer_id === 'string'
    && item.reviewer_id.trim().length > 0
    && isTeacherAttestedReview(item)
    && typeof item.reviewed_at === 'string'
    && !Number.isNaN(Date.parse(item.reviewed_at))
  );
}

export function reviewSummary(candidates) {
  const gold = goldCases(candidates);
  const progress = reviewProgress(candidates);
  return {
    total_candidates: candidates.length,
    pending: progress.pending,
    approved: progress.approved,
    rejected: progress.rejected,
    needs_revision: progress.needs_revision,
    reviewed: progress.reviewed,
    provenance_excluded: progress.provenance_excluded,
    gold_eligible: gold.length,
    gold_distribution: distribution(gold, 'reviewer_label')
  };
}

export function officialTeacherMetrics(candidates, minimumGold = 50) {
  const gold = goldCases(candidates);
  if (gold.length < minimumGold) {
    return {
      available: false,
      gold_required: minimumGold,
      gold_eligible: gold.length,
      primary_cases: gold.filter((item) => PRIMARY_ERRORS.includes(item.reviewer_label)).length,
      primary_error_accuracy: null,
      primary_error_macro_f1: null,
      confusion_matrix: null,
      confidence_calibration: null,
      boundary_pair_report: null,
      reason_unavailable: `At least ${minimumGold} diagnostic-causal-blind-v3 independently teacher-reviewed approved cases with reviewer identity, author-independence attestation, timestamp, reviewer label, matching earliest failed step and review rationale are required.`
    };
  }
  const missingSnapshots = gold.filter((item) =>
    !ALL_DIAGNOSES.includes(item.predicted_primary_error)
    || !Number.isFinite(item.predicted_confidence)
    || !item.prediction_provider
    || !item.prediction_model_version
  );
  if (missingSnapshots.length) {
    return {
      available: false,
      gold_required: minimumGold,
      gold_eligible: gold.length,
      primary_cases: 0,
      primary_error_accuracy: null,
      primary_error_macro_f1: null,
      confusion_matrix: null,
      confidence_calibration: null,
      boundary_pair_report: null,
      reason_unavailable: `${missingSnapshots.length} gold cases are missing a frozen prediction snapshot.`
    };
  }
  const rows = gold.filter((item) => PRIMARY_ERRORS.includes(item.reviewer_label));
  const accuracy = rows.length ? rows.filter((item) => item.predicted_primary_error === item.reviewer_label).length / rows.length : null;
  const f1 = PRIMARY_ERRORS.map((label) => {
    const tp = rows.filter((item) => item.reviewer_label === label && item.predicted_primary_error === label).length;
    const fp = rows.filter((item) => item.reviewer_label !== label && item.predicted_primary_error === label).length;
    const fn = rows.filter((item) => item.reviewer_label === label && item.predicted_primary_error !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  });
  return {
    available: true,
    gold_required: minimumGold,
    gold_eligible: gold.length,
    primary_cases: rows.length,
    primary_error_accuracy: round(accuracy),
    primary_error_macro_f1: round(f1.reduce((sum, value) => sum + value, 0) / f1.length),
    confusion_matrix: Object.fromEntries(PRIMARY_ERRORS.map((goldLabel) => [goldLabel, Object.fromEntries(PRIMARY_ERRORS.map((predictedLabel) => [
      predictedLabel,
      rows.filter((item) => item.reviewer_label === goldLabel && item.predicted_primary_error === predictedLabel).length
    ]))])),
    abstained_or_special_predictions: rows.filter((item) => !PRIMARY_ERRORS.includes(item.predicted_primary_error)).length,
    confidence_calibration: confidenceCalibration(rows),
    boundary_pair_report: boundaryPairReport(rows),
    reason_unavailable: null
  };
}

function boundaryPairReport(rows) {
  const pairs = [
    ['location', 'paraphrase'],
    ['paraphrase', 'sentence_comprehension'],
    ['sentence_comprehension', 'question_strategy'],
    ['question_strategy', 'over_inference']
  ];
  return pairs.map(([a, b]) => {
    const members = rows.filter((item) => item.reviewer_label === a || item.reviewer_label === b);
    const aToB = members.filter((item) => item.reviewer_label === a && item.predicted_primary_error === b).length;
    const bToA = members.filter((item) => item.reviewer_label === b && item.predicted_primary_error === a).length;
    const correct = members.filter((item) => item.predicted_primary_error === item.reviewer_label).length;
    const outside = members.filter((item) =>
      item.predicted_primary_error !== item.reviewer_label
      && item.predicted_primary_error !== (item.reviewer_label === a ? b : a)
    ).length;
    return {
      pair: `${a}_vs_${b}`,
      labels: [a, b],
      gold_cases: members.length,
      pair_accuracy: members.length ? round(correct / members.length) : null,
      a_to_b: aToB,
      b_to_a: bToA,
      cross_confusion_count: aToB + bToA,
      cross_confusion_rate: members.length ? round((aToB + bToA) / members.length) : null,
      outside_pair_error_count: outside
    };
  });
}

function confidenceCalibration(rows) {
  const bucketRanges = [[0.6, 0.69], [0.7, 0.79], [0.8, 0.89], [0.9, 1]];
  const buckets = bucketRanges.map(([min, max]) => {
    const members = rows.filter((item) => item.predicted_confidence >= min && item.predicted_confidence <= max);
    const bucketAccuracy = members.length ? members.filter((item) => item.predicted_primary_error === item.reviewer_label).length / members.length : null;
    const averageConfidence = members.length ? members.reduce((sum, item) => sum + item.predicted_confidence, 0) / members.length : null;
    return {
      range: `${min.toFixed(2)}-${max.toFixed(2)}`,
      count: members.length,
      accuracy: round(bucketAccuracy),
      average_confidence: round(averageConfidence),
      calibration_gap: members.length ? round(Math.abs(averageConfidence - bucketAccuracy)) : null
    };
  });
  const covered = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const expectedCalibrationError = covered
    ? buckets.reduce((sum, bucket) => sum + (bucket.count / covered) * (bucket.calibration_gap ?? 0), 0)
    : null;
  const highConfidence = rows.filter((item) => item.predicted_confidence >= 0.9);
  const highConfidenceErrors = highConfidence.filter((item) => item.predicted_primary_error !== item.reviewer_label).length;
  const highConfidenceErrorRate = highConfidence.length ? highConfidenceErrors / highConfidence.length : null;
  return {
    buckets,
    covered_primary_cases: covered,
    excluded_below_0_60: rows.length - covered,
    expected_calibration_error: round(expectedCalibrationError),
    high_confidence_cases: highConfidence.length,
    high_confidence_errors: highConfidenceErrors,
    high_confidence_error_rate: round(highConfidenceErrorRate),
    calibration_warning: buckets.some((bucket) => bucket.calibration_gap !== null && bucket.calibration_gap > 0.15)
      || (highConfidenceErrorRate !== null && highConfidenceErrorRate > 0.1)
  };
}

export function toReviewCsv(candidates) {
  const fields = [
    'id', 'passage', 'question_type', 'question', 'correct_answer', 'user_answer', 'standard_evidence', 'user_evidence',
    'reasoning_process', 'review_status', 'reviewer_label', 'reviewer_failed_step', 'reviewer_notes', 'reviewer_id',
    'reviewer_role', 'qualification_attested', 'independence_attested', 'review_track', 'review_protocol_version', 'reviewed_at'
  ];
  const rows = candidates.map((item) => ({
    ...item,
    standard_evidence: item.standard_evidence?.quote ?? '',
    user_evidence: item.user_evidence?.quote ?? ''
  }));
  return [fields.join(','), ...rows.map((row) => fields.map((field) => csv(row[field])).join(','))].join('\n') + '\n';
}

function distribution(items, field) {
  return items.reduce((counts, item) => {
    const label = item[field] ?? 'unlabeled';
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, {});
}

function csv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function round(value) {
  return value === null ? null : Math.round(value * 1000) / 1000;
}

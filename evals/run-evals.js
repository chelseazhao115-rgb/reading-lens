import fs from 'node:fs';
import { diagnose } from '../src/diagnostic-engine.js';
import { PRIMARY_ERRORS } from '../src/taxonomy.js';
import { validateStandardEvidence } from '../src/validators.js';
import { getExerciseReviewItems, validateExerciseBank } from '../src/exercises.js';
import { exerciseReviewSummary, validateExerciseReviews } from './exercise-review.js';
import { loadFrozenReviewPack, officialTeacherMetrics, reviewSummary, validatePredictionSnapshotIntegrity } from './review-pack.js';
import { validateProviderOutput } from '../src/provider-output.js';
import { PROVIDER_OUTPUT_CHALLENGES } from './provider-output-challenges.js';

const dataset = JSON.parse(fs.readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'));
const correctPathCases = JSON.parse(fs.readFileSync(new URL('./correct-path-cases.json', import.meta.url), 'utf8'));
const boundaryChallenge = JSON.parse(fs.readFileSync(new URL('./boundary-challenge.json', import.meta.url), 'utf8'));
const providerBenchmarkPath = new URL('./results/provider-latest.json', import.meta.url);
const providerBenchmark = fs.existsSync(providerBenchmarkPath)
  ? JSON.parse(fs.readFileSync(providerBenchmarkPath, 'utf8'))
  : null;
const rows = dataset.map((sample) => ({ sample, prediction: diagnose(sample) }));
const challengeRows = boundaryChallenge.map((sample) => ({ sample, prediction: diagnose(sample) }));
const providerChallengeRows = PROVIDER_OUTPUT_CHALLENGES.map((item) => ({ ...item, validation: validateProviderOutput(item.output) }));

const accuracy = mean(rows.map(({ sample, prediction }) => prediction.primary_error === sample.gold_primary_error));
const evidenceRows = rows.filter(({ sample }) => sample.gold_primary_error !== 'data_error');
const evidenceAccuracy = mean(evidenceRows.map(({ sample }) => validateStandardEvidence(sample).valid));
const hallucinatedEvidenceRate = mean(rows.map(({ prediction }) => prediction.status === 'evidence_validation_failed' && prediction.primary_error !== 'data_error'));
const insufficientRows = rows.filter(({ sample }) => ['insufficient_information', 'ambiguous_question', 'data_error'].includes(sample.gold_primary_error));
const unsafeOverdiagnosisRate = mean(insufficientRows.map(({ prediction }) => prediction.status === 'diagnosed'));
const macroF1 = calculateMacroF1(rows, PRIMARY_ERRORS);
const exerciseValidation = validateExerciseBank();
const exerciseReviewedPath = new URL('./exercise-reviewed.json', import.meta.url);
const exerciseReviewCases = fs.existsSync(exerciseReviewedPath)
  ? JSON.parse(fs.readFileSync(exerciseReviewedPath, 'utf8'))
  : getExerciseReviewItems();
const exerciseReviewValidation = validateExerciseReviews(exerciseReviewCases);
const exerciseTeacherReview = exerciseReviewSummary(exerciseReviewCases);
const reviewedPath = new URL('./reviewed.json', import.meta.url);
const reviewSeeds = loadFrozenReviewPack();
const reviewCases = fs.existsSync(reviewedPath)
  ? JSON.parse(fs.readFileSync(reviewedPath, 'utf8'))
  : reviewSeeds;
const predictionSnapshotIntegrity = validatePredictionSnapshotIntegrity(reviewCases, reviewSeeds);
const teacherReview = reviewSummary(reviewCases);
const teacherMetrics = officialTeacherMetrics(reviewCases);
const correctPathRows = correctPathCases.map((sample) => ({ sample, prediction: diagnose(sample) }));
const correctPathAccuracy = mean(correctPathRows.map(({ sample, prediction }) =>
  prediction.status === sample.expected_status
  && prediction.answer_result === sample.expected_answer_result
  && prediction.primary_error === sample.expected_primary_error
));

const result = {
  generated_at: new Date().toISOString(),
  dataset: {
    total: rows.length,
    origin: 'synthetic_project_authored',
    limitation: 'Framework baseline only; not real-user or final teacher-agreement evidence.'
  },
  metrics: {
    primary_error_accuracy: round(accuracy),
    primary_error_macro_f1: round(macroF1),
    evidence_accuracy: round(evidenceAccuracy),
    hallucinated_evidence_rate: round(hallucinatedEvidenceRate),
    unsafe_overdiagnosis_rate: round(unsafeOverdiagnosisRate),
    micro_exercise_validity: exerciseValidation.valid ? 1 : 0,
    micro_exercise_teacher_validity: exerciseTeacherReview.teacher_validity,
    correct_path_accuracy: round(correctPathAccuracy)
  },
  failures: rows
    .filter(({ sample, prediction }) => prediction.primary_error !== sample.gold_primary_error)
    .map(({ sample, prediction }) => ({
      id: sample.id,
      gold: sample.gold_primary_error,
      predicted: prediction.primary_error,
      confidence: prediction.confidence,
      status: prediction.status
    })),
  confidence_buckets: confidenceBuckets(rows),
  exercise_evaluation: {
    total: exerciseValidation.count,
    data_origin: 'original_project_content',
    structural_validity: exerciseValidation.valid,
    errors: exerciseValidation.errors,
    limitation: exerciseTeacherReview.teacher_validity === null
      ? 'Structural checks only. Teacher review of instructional targeting and difficulty is still required.'
      : 'Structural validity and completed teacher review are reported separately; teacher review is a ten-case exploratory sample, not evidence of learning gains.',
    teacher_review_pack_valid: exerciseReviewValidation.valid,
    teacher_review: exerciseTeacherReview
  },
  teacher_review: {
    ...teacherReview,
    prediction_snapshot_integrity: predictionSnapshotIntegrity,
    official_metrics: predictionSnapshotIntegrity.valid ? teacherMetrics : {
      available: false,
      reason_unavailable: 'Prediction snapshot integrity failed; official metrics are disabled.'
    }
  },
  correct_path_evaluation: {
    total: correctPathRows.length,
    accuracy: round(correctPathAccuracy),
    failures: correctPathRows.filter(({ sample, prediction }) =>
      prediction.status !== sample.expected_status
      || prediction.answer_result !== sample.expected_answer_result
      || prediction.primary_error !== sample.expected_primary_error
    ).map(({ sample, prediction }) => ({
      id: sample.id,
      expected: { status: sample.expected_status, answer_result: sample.expected_answer_result, primary_error: sample.expected_primary_error },
      actual: { status: prediction.status, answer_result: prediction.answer_result, primary_error: prediction.primary_error }
    }))
  },
  boundary_challenge: challengeSummary(challengeRows),
  provider_output_contract: {
    total: providerChallengeRows.length,
    rejected: providerChallengeRows.filter((item) => !item.validation.valid).length,
    unsafe_acceptance_rate: round(mean(providerChallengeRows.map((item) => item.validation.valid))),
    cases: providerChallengeRows.map((item) => ({ id: item.id, rejected: !item.validation.valid, errors: item.validation.errors }))
  },
  provider_benchmark: providerBenchmark
};

console.log(JSON.stringify(result, null, 2));
fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./results/latest.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);

function mean(values) {
  return values.length ? values.filter(Boolean).length / values.length : 0;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function calculateMacroF1(rows, labels) {
  const scores = labels.map((label) => {
    const tp = rows.filter(({ sample, prediction }) => sample.gold_primary_error === label && prediction.primary_error === label).length;
    const fp = rows.filter(({ sample, prediction }) => sample.gold_primary_error !== label && prediction.primary_error === label).length;
    const fn = rows.filter(({ sample, prediction }) => sample.gold_primary_error === label && prediction.primary_error !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    return precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function confidenceBuckets(rows) {
  const buckets = [
    [0, 0.59],
    [0.6, 0.69],
    [0.7, 0.79],
    [0.8, 0.89],
    [0.9, 1]
  ];
  return buckets.map(([min, max]) => {
    const members = rows.filter(({ prediction }) => prediction.confidence >= min && prediction.confidence <= max);
    return {
      range: `${min.toFixed(2)}-${max.toFixed(2)}`,
      count: members.length,
      accuracy: round(mean(members.map(({ sample, prediction }) => sample.gold_primary_error === prediction.primary_error)))
    };
  });
}

function challengeSummary(rows) {
  const exact = rows.map(({ sample, prediction }) => prediction.primary_error === sample.gold_primary_error);
  const unsafe = rows.map(({ sample, prediction }) =>
    prediction.status === 'diagnosed' && prediction.primary_error !== sample.gold_primary_error
  );
  return {
    total: rows.length,
    origin: 'synthetic_adversarial_project_authored',
    limitation: 'Hard boundary regression only. Labels are project-authored and are not Teacher Gold.',
    exact_classification_accuracy: round(mean(exact)),
    unsafe_boundary_diagnosis_rate: round(mean(unsafe)),
    abstention_rate: round(mean(rows.map(({ prediction }) => prediction.status === 'abstained'))),
    cases: rows.map(({ sample, prediction }) => ({
      id: sample.id,
      boundary_pair: sample.boundary_pair,
      expected: sample.gold_primary_error,
      predicted: prediction.primary_error,
      status: prediction.status,
      confidence: prediction.confidence,
      safe: prediction.primary_error === sample.gold_primary_error || prediction.status === 'abstained'
    }))
  };
}

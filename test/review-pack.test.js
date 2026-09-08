import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_CANDIDATES } from '../evals/review-candidates.js';
import {
  goldCases, loadFrozenReviewPack, officialTeacherMetrics, reviewSummary, toReviewCsv,
  validatePredictionSnapshotCompleteness, validatePredictionSnapshotIntegrity, validateReviewCandidates, withBaselinePredictions
} from '../evals/review-pack.js';
import { causalStepForLabel } from '../src/review-store.js';

test('review pack contains exactly 50 structurally valid candidates', () => {
  const result = validateReviewCandidates(REVIEW_CANDIDATES);
  assert.equal(result.count, 50);
  assert.equal(result.valid, true, result.errors.join('\n'));
});

test('frozen review predictions remain authoritative when the current engine changes', () => {
  const frozen = loadFrozenReviewPack();
  const current = withBaselinePredictions(REVIEW_CANDIDATES);
  assert.equal(validatePredictionSnapshotCompleteness(frozen).valid, true);
  assert.equal(validatePredictionSnapshotIntegrity(frozen, frozen).valid, true);
  assert.notEqual(
    frozen.find((item) => item.id === 'review_insufficient_04').prediction_status,
    current.find((item) => item.id === 'review_insufficient_04').prediction_status
  );
});

test('candidate distribution covers all primary errors and special states', () => {
  const distribution = validateReviewCandidates(REVIEW_CANDIDATES).distribution;
  for (const label of ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference']) {
    assert.equal(distribution[label], 8);
  }
  assert.equal(distribution.insufficient_information, 5);
  assert.equal(distribution.ambiguous_question, 3);
  assert.equal(distribution.data_error, 2);
});

test('pending or incomplete reviews can never enter gold metrics', () => {
  assert.equal(goldCases(REVIEW_CANDIDATES).length, 0);
  const fakeApproval = { ...REVIEW_CANDIDATES[0], review_status: 'approved', reviewer_label: 'location' };
  assert.equal(goldCases([fakeApproval]).length, 0, 'reviewer identity and timestamp are required');
});

test('fully reviewed case becomes gold eligible', () => {
  const reviewed = {
    ...REVIEW_CANDIDATES[0], review_status: 'approved', reviewer_label: 'location',
    reviewer_failed_step: 'evidence_location', reviewer_notes: 'Evidence is in the wrong region.',
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_gold',
    review_protocol_version: 'diagnostic-causal-blind-v3', reviewed_at: '2026-08-22T00:00:00.000Z'
  };
  assert.equal(goldCases([reviewed]).length, 1);
  assert.equal(reviewSummary([reviewed]).gold_eligible, 1);
});

test('review summary excludes legacy approvals from current teacher progress', () => {
  const legacy = {
    ...REVIEW_CANDIDATES[0], review_status: 'approved', reviewer_label: 'location',
    reviewer_id: 'browser-validation', reviewer_notes: 'legacy browser record', reviewed_at: '2026-08-22T00:00:00Z'
  };
  assert.deepEqual(reviewSummary([legacy]), {
    total_candidates: 1, pending: 1, approved: 0, rejected: 0, needs_revision: 0,
    reviewed: 0, provenance_excluded: 1, gold_eligible: 0, gold_distribution: {}
  });
});

test('official teacher metrics remain unavailable below fifty gold cases', () => {
  const metrics = officialTeacherMetrics(REVIEW_CANDIDATES);
  assert.equal(metrics.available, false);
  assert.equal(metrics.primary_error_accuracy, null);
  assert.equal(metrics.confusion_matrix, null);
});

test('fifty approved cases produce official accuracy, macro F1 and confusion matrix', () => {
  const snapshots = withBaselinePredictions(REVIEW_CANDIDATES);
  const reviewed = snapshots.map((item, index) => ({
    ...structuredClone(item),
    review_status: 'approved',
    reviewer_label: item.proposed_primary_error,
    reviewer_failed_step: causalStepForLabel(item.proposed_primary_error), reviewer_notes: 'Teacher rationale for causal step.',
    reviewer_id: `teacher-${index % 2 + 1}`,
    reviewer_role: 'ielts_reading_teacher', qualification_attested: true, independence_attested: true,
    review_track: 'independent_teacher_gold', review_protocol_version: 'diagnostic-causal-blind-v3',
    reviewed_at: '2026-08-22T00:00:00Z'
  }));
  const baseline = officialTeacherMetrics(reviewed);
  assert.equal(baseline.available, true);
  assert.equal(baseline.gold_eligible, 50);
  assert.equal(baseline.primary_cases, 40);
  assert.equal(baseline.primary_error_accuracy, 0.6);
  assert.ok(baseline.primary_error_macro_f1 < 1);
  assert.equal(baseline.confusion_matrix.location.location, 8);
  assert.equal(baseline.abstained_or_special_predictions, 16);
  assert.equal(baseline.confidence_calibration.covered_primary_cases, 24);
  const paraphraseSentence = baseline.boundary_pair_report.find((item) => item.pair === 'paraphrase_vs_sentence_comprehension');
  assert.deepEqual(paraphraseSentence, {
    pair: 'paraphrase_vs_sentence_comprehension',
    labels: ['paraphrase', 'sentence_comprehension'],
    gold_cases: 16,
    pair_accuracy: 0.438,
    a_to_b: 0,
    b_to_a: 0,
    cross_confusion_count: 0,
    cross_confusion_rate: 0,
    outside_pair_error_count: 9
  });

  reviewed[0].reviewer_label = 'paraphrase';
  reviewed[0].reviewer_failed_step = 'semantic_mapping';
  const disagreement = officialTeacherMetrics(reviewed);
  assert.ok(disagreement.primary_error_accuracy < baseline.primary_error_accuracy);
  assert.equal(disagreement.confusion_matrix.paraphrase.location, 1);
});

test('official metrics reject missing or modified prediction snapshots', () => {
  const snapshots = withBaselinePredictions(REVIEW_CANDIDATES);
  assert.equal(validatePredictionSnapshotIntegrity(snapshots, snapshots).valid, true);
  const modified = structuredClone(snapshots);
  modified[0].predicted_confidence = 0.99;
  assert.equal(validatePredictionSnapshotIntegrity(modified, snapshots).valid, false);
  const reviewedWithoutSnapshots = REVIEW_CANDIDATES.map((item, index) => ({
    ...item, review_status: 'approved', reviewer_label: item.proposed_primary_error,
    reviewer_failed_step: causalStepForLabel(item.proposed_primary_error), reviewer_notes: 'Teacher rationale for causal step.',
    reviewer_id: `teacher-${index}`, reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_gold',
    review_protocol_version: 'diagnostic-causal-blind-v3', reviewed_at: '2026-08-22T00:00:00Z'
  }));
  assert.match(officialTeacherMetrics(reviewedWithoutSnapshots).reason_unavailable, /missing a frozen prediction snapshot/);
});

test('CSV export contains review fields and all candidates', () => {
  const csv = toReviewCsv(REVIEW_CANDIDATES);
  assert.match(csv.split('\n')[0], /reviewer_label/);
  assert.doesNotMatch(csv.split('\n')[0], /proposed_primary_error|predicted_primary_error|predicted_confidence/);
  assert.equal(csv.trim().split('\n').length, 51);
});

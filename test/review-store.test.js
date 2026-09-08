import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_CANDIDATES } from '../evals/review-candidates.js';
import {
  applyAuthorQaReview, applyTeacherReview as applyTeacherReviewRaw, authorQaProgress, blindReviewId,
  orderedReviewCases, pilotReviewCheckpoint, publicAuthorQaCase, publicReviewCase, reviewProgress
} from '../src/review-store.js';
import { reviewRevision } from '../src/review-revision.js';

function applyTeacherReview(item, review, now) {
  return applyTeacherReviewRaw(item, { ...review, expected_revision: reviewRevision(item, 'diagnostic') }, now);
}

const attested = {
  reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
  independence_attested: true, review_track: 'independent_teacher_gold',
  review_protocol_version: 'diagnostic-causal-blind-v3'
};

test('blind public case exposes only an opaque case reference', () => {
  const value = publicReviewCase({ ...REVIEW_CANDIDATES[0], predicted_primary_error: 'location', predicted_confidence: 0.7, prediction_provider: 'rule-baseline' }, blindReviewId(0));
  assert.equal(value.blind_id, 'blind-case-001');
  assert.equal('id' in value, false);
  assert.equal('proposed_primary_error' in value, false);
  assert.equal('predicted_primary_error' in value, false);
  assert.equal('predicted_confidence' in value, false);
  assert.equal('prediction_provider' in value, false);
});

test('excluded browser validation label is hidden before teacher re-review', () => {
  const value = publicReviewCase({
    ...REVIEW_CANDIDATES[0], review_status: 'approved', reviewer_label: 'location',
    reviewer_notes: 'old browser hint', reviewer_id: 'browser-validation', reviewed_at: '2026-08-22T00:00:00Z'
  });
  assert.equal(value.review_status, 'pending');
  assert.equal(value.reviewer_label, null);
  assert.equal(value.reviewer_notes, '');
  assert.equal(value.reviewer_id, null);
  assert.equal(value.provenance_status, 'excluded_legacy_or_untrusted_review_hidden');
});

test('legacy pilot records do not count as completed current-protocol reviews', () => {
  const legacy = orderedReviewCases(REVIEW_CANDIDATES).slice(0, 10).map((item) => ({
    ...item,
    review_status: 'approved', reviewer_label: item.proposed_primary_error,
    reviewer_notes: 'legacy browser check', reviewer_id: 'browser-validation', reviewed_at: '2026-08-22T00:00:00Z'
  }));
  const checkpoint = pilotReviewCheckpoint(legacy);
  assert.equal(checkpoint.reviewed, 0);
  assert.equal(checkpoint.approved, 0);
  assert.equal(checkpoint.provenance_issues, 10);
  assert.equal(checkpoint.ready_for_sample_audit, false);
  assert.equal(checkpoint.ready_to_continue, false);
});

test('teacher attestation from an older pre-hide client is not gold or exposed', () => {
  const value = publicReviewCase({
    ...REVIEW_CANDIDATES[0], review_status: 'approved', reviewer_label: 'location', reviewer_id: 'teacher',
    reviewer_role: 'ielts_reading_teacher', qualification_attested: true, reviewed_at: '2026-08-22T00:00:00Z'
  });
  assert.equal(value.review_status, 'pending');
  assert.equal(value.reviewer_label, null);
  assert.equal(value.provenance_status, 'excluded_legacy_or_untrusted_review_hidden');
});

test('approval requires reviewer identity and legal label', () => {
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], { review_status: 'approved', reviewer_label: 'location' }).error, 'reviewer_id_required');
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], { review_status: 'approved', reviewer_label: 'unknown', reviewer_id: 'teacher-001', ...attested }).error, 'valid_reviewer_label_required_for_approval');
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], { review_status: 'approved', reviewer_label: 'location', reviewer_id: 'browser-validation', ...attested }).error, 'reserved_reviewer_id_not_allowed');
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], { review_status: 'approved', reviewer_label: 'location', reviewer_id: 'teacher-001' }).error, 'ielts_reading_teacher_attestation_required');
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], {
    review_status: 'approved', reviewer_label: 'location', reviewer_id: 'teacher-001',
    reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_gold'
  }).error, 'current_blind_review_protocol_required');
});

test('qualified project author review is isolated from independent Teacher Gold', () => {
  const item = REVIEW_CANDIDATES[0];
  const result = applyAuthorQaReview(item, {
    expected_revision: reviewRevision(item, 'author_qa'), review_status: 'approved', reviewer_label: 'location',
    reviewer_failed_step: 'evidence_location', reviewer_notes: '作者检查认为学生证据选择了错误区域。',
    reviewer_id: 'author-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    review_track: 'author_qa', review_protocol_version: 'diagnostic-author-qa-v1'
  }, '2026-08-24T00:00:00Z');
  assert.equal(result.valid, true);
  assert.equal(authorQaProgress([result.value]).approved, 1);
  assert.equal(reviewProgress([result.value]).gold_eligible, 0);
  assert.equal(publicReviewCase(result.value, 'blind-case-001').review_status, 'pending');
  assert.equal(publicAuthorQaCase(result.value, 'blind-case-001').reviewer_label, 'location');
});

test('teacher qualification without author-independence declaration cannot enter Gold', () => {
  const item = REVIEW_CANDIDATES[0];
  const result = applyTeacherReviewRaw(item, {
    expected_revision: reviewRevision(item, 'diagnostic'), review_status: 'approved', reviewer_label: 'location',
    reviewer_failed_step: 'evidence_location', reviewer_notes: 'Evidence is in the wrong region.',
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    review_track: 'independent_teacher_gold', independence_attested: false,
    review_protocol_version: 'diagnostic-causal-blind-v3'
  });
  assert.equal(result.error, 'independent_reviewer_attestation_required');
});

test('author and independent reviewer identifiers cannot cross tracks', () => {
  const item = REVIEW_CANDIDATES[0];
  const independent = applyTeacherReviewRaw(item, {
    expected_revision: reviewRevision(item, 'diagnostic'), review_status: 'approved', reviewer_label: 'location',
    reviewer_failed_step: 'evidence_location', reviewer_notes: 'Evidence is in the wrong region.',
    reviewer_id: 'author-001', ...attested
  });
  assert.equal(independent.error, 'independent_teacher_id_required');
  const author = applyAuthorQaReview(item, {
    expected_revision: reviewRevision(item, 'author_qa'), review_status: 'approved', reviewer_label: 'location',
    reviewer_failed_step: 'evidence_location', reviewer_notes: '作者检查认为证据区域选择错误。',
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    review_track: 'author_qa', review_protocol_version: 'diagnostic-author-qa-v1'
  });
  assert.equal(author.error, 'valid_author_qa_id_required');
});

test('non-approved review requires notes that explain the sample problem', () => {
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], {
    review_status: 'needs_revision', reviewer_id: 'teacher-001', reviewer_notes: '', ...attested
  }).error, 'reviewer_notes_required_for_non_approval');
});

test('approved review requires causal step agreement and a substantive rationale', () => {
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], {
    review_status: 'approved', reviewer_label: 'location', reviewer_failed_step: 'semantic_mapping',
    reviewer_notes: 'Evidence is wrong.', reviewer_id: 'teacher-001', ...attested
  }).error, 'reviewer_failed_step_must_match_label');
  assert.equal(applyTeacherReview(REVIEW_CANDIDATES[0], {
    review_status: 'approved', reviewer_label: 'location', reviewer_failed_step: 'evidence_location',
    reviewer_notes: 'short', reviewer_id: 'teacher-001', ...attested
  }).error, 'reviewer_rationale_required_for_approval');
});

test('pilot review covers all five primary categories and three safe special states without exposing them', () => {
  const ordered = orderedReviewCases(REVIEW_CANDIDATES);
  assert.deepEqual(ordered.slice(0, 10).map((item) => item.id), [
    'review_location_01', 'review_paraphrase_01', 'review_sentence_01', 'review_strategy_01', 'review_inference_01',
    'review_insufficient_01', 'review_ambiguous_01', 'review_data_error_01', 'review_paraphrase_02', 'review_strategy_02'
  ]);
  assert.deepEqual(new Set(ordered.slice(0, 10).map((item) => item.proposed_primary_error)), new Set([
    'location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference',
    'insufficient_information', 'ambiguous_question', 'data_error'
  ]));
  assert.equal('proposed_primary_error' in publicReviewCase(ordered[0]), false);
});

test('pilot checkpoint reports sample readiness without model results', () => {
  const reviewed = REVIEW_CANDIDATES.map((item) => ({ ...item }));
  for (const item of orderedReviewCases(reviewed).slice(0, 10)) {
    item.review_status = 'approved'; item.reviewer_label = 'location'; item.reviewer_failed_step = 'evidence_location';
    item.reviewer_notes = 'Evidence is in the wrong region.'; item.reviewer_id = 'teacher-001'; item.reviewed_at = '2026-08-22T00:00:00Z'; Object.assign(item, attested);
  }
  const checkpoint = pilotReviewCheckpoint(reviewed);
  assert.deepEqual(checkpoint, {
    total: 10, available: 10, reviewed: 10, approved: 10, sample_issues: 0,
    ready_for_sample_audit: true, teacher_attested: 10, provenance_issues: 0, ready_to_continue: true, predictions_hidden: true
  });
  assert.equal('accuracy' in checkpoint, false);
});

test('valid teacher review records server time and preserves core evidence', () => {
  const result = applyTeacherReview(REVIEW_CANDIDATES[0], {
    review_status: 'approved', reviewer_label: 'location', reviewer_failed_step: 'evidence_location',
    reviewer_id: 'teacher-001', reviewer_notes: 'Evidence is in the wrong region.', ...attested
  }, '2026-08-22T12:00:00.000Z');
  assert.equal(result.valid, true);
  assert.equal(result.value.reviewed_at, '2026-08-22T12:00:00.000Z');
  assert.deepEqual(result.value.standard_evidence, REVIEW_CANDIDATES[0].standard_evidence);
});

test('stale diagnostic review cannot overwrite a newer teacher judgment', () => {
  const item = REVIEW_CANDIDATES[0];
  const staleRevision = reviewRevision(item, 'diagnostic');
  const first = applyTeacherReview(item, {
    review_status: 'approved', reviewer_label: 'location', reviewer_failed_step: 'evidence_location',
    reviewer_id: 'teacher-001', reviewer_notes: 'Evidence is in the wrong region.', ...attested
  }, '2026-08-22T12:00:00.000Z');
  const overwrite = applyTeacherReviewRaw(first.value, {
    expected_revision: staleRevision, review_status: 'approved', reviewer_label: 'paraphrase',
    reviewer_failed_step: 'semantic_mapping', reviewer_id: 'teacher-002',
    reviewer_notes: 'The semantic mapping is the earliest failure.', ...attested
  });
  assert.equal(overwrite.valid, false);
  assert.equal(overwrite.status, 409);
  assert.equal(overwrite.error, 'stale_review_revision');
});

test('review progress distinguishes pending, approved and revision cases', () => {
  const records = [
    REVIEW_CANDIDATES[0],
    { ...REVIEW_CANDIDATES[1], review_status: 'approved' },
    {
      ...REVIEW_CANDIDATES[2], review_status: 'needs_revision', reviewer_id: 'teacher-001',
      reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
      independence_attested: true, review_track: 'independent_teacher_gold',
      review_protocol_version: 'diagnostic-causal-blind-v3', reviewer_notes: '样本证据不足，需要重新编写。',
      reviewed_at: '2026-08-22T00:00:00Z'
    }
  ];
  assert.deepEqual(reviewProgress(records), { total: 3, pending: 2, approved: 0, rejected: 0, needs_revision: 1, reviewed: 1, gold_eligible: 0, provenance_excluded: 1 });
});

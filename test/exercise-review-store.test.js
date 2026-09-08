import test from 'node:test';
import assert from 'node:assert/strict';
import { getExerciseReviewItems } from '../src/exercises.js';
import { applyExerciseBlindResponse as applyExerciseBlindResponseRaw, applyExerciseTeacherReview as applyExerciseTeacherReviewRaw, blindExerciseReviewId, exerciseReviewProgress, publicExerciseReview } from '../src/exercise-review-store.js';
import { reviewRevision } from '../src/review-revision.js';

function applyExerciseBlindResponse(item, review, now) {
  return applyExerciseBlindResponseRaw(item, { ...review, expected_revision: reviewRevision(item, 'exercise') }, now);
}

function applyExerciseTeacherReview(item, review, now) {
  return applyExerciseTeacherReviewRaw(item, { ...review, expected_revision: reviewRevision(item, 'exercise') }, now);
}

function six(value = true) {
  return {
    targets_primary_error: value,
    original_content: value,
    unique_answer: value,
    answer_correct: value,
    difficulty_appropriate: value,
    no_answer_leak: value
  };
}

function revealed(item, overrides = {}) {
  const result = applyExerciseBlindResponse(item, {
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_exercise',
    review_protocol_version: 'exercise-two-stage-v3',
    blind_answer: item.answer, blind_target_error: item.target_error, ...overrides
  }, '2026-08-22T00:00:00Z');
  assert.equal(result.valid, true);
  return result.value;
}

test('pending exercise hides gold until blind answer and target are locked', () => {
  const item = getExerciseReviewItems()[0];
  const pending = publicExerciseReview(item, blindExerciseReviewId(0));
  assert.equal(pending.blind_id, 'blind-exercise-001');
  assert.equal('id' in pending, false);
  assert.equal('answer' in pending, false);
  assert.equal('target_error' in pending, false);
  assert.equal('stage' in pending, false);
  const locked = revealed(item);
  const publicLocked = publicExerciseReview(locked);
  assert.equal(publicLocked.answer, item.answer);
  assert.equal(publicLocked.target_error, item.target_error);
  assert.equal(publicLocked.stage, item.stage);
  assert.equal(applyExerciseBlindResponse(locked, {
    reviewer_id: 'teacher-001', blind_answer: item.answer, blind_target_error: item.target_error
  }).error, 'blind_response_already_locked');
});

test('exercise blind review rejects missing teacher attestation and reserved ids', () => {
  const item = getExerciseReviewItems()[0];
  assert.equal(applyExerciseBlindResponse(item, {
    reviewer_id: 'teacher-01', blind_answer: item.answer, blind_target_error: item.target_error
  }).error, 'ielts_reading_teacher_attestation_required');
  assert.equal(applyExerciseBlindResponse(item, {
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_exercise',
    blind_answer: item.answer, blind_target_error: item.target_error
  }).error, 'current_blind_review_protocol_required');
  assert.equal(applyExerciseBlindResponse(item, {
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: false, review_track: 'independent_teacher_exercise',
    review_protocol_version: 'exercise-two-stage-v3', blind_answer: item.answer, blind_target_error: item.target_error
  }).error, 'independent_reviewer_attestation_required');
  assert.equal(applyExerciseBlindResponse(item, {
    reviewer_id: 'browser-validation', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    blind_answer: item.answer, blind_target_error: item.target_error
  }).error, 'ielts_reading_teacher_attestation_required');
});

test('excluded exercise review cannot reveal its prior blind answer or gold', () => {
  const item = {
    ...getExerciseReviewItems()[0], blind_answer: 'old answer', blind_target_error: 'location',
    blind_revealed_at: '2026-08-22T00:00:00Z', reviewer_id: 'browser-validation'
  };
  const value = publicExerciseReview(item);
  assert.equal('answer' in value, false);
  assert.equal('target_error' in value, false);
  assert.equal(value.blind_answer, null);
  assert.equal(value.blind_revealed_at, null);
});

test('approved exercise review requires reviewer and all six dimensions true', () => {
  const item = revealed(getExerciseReviewItems()[0]);
  const missingReviewer = applyExerciseTeacherReview(item, { review_status: 'approved', ...six() });
  assert.equal(missingReviewer.error, 'reviewer_id_required');
  const failedDimension = applyExerciseTeacherReview(item, {
    review_status: 'approved', reviewer_id: 'teacher-001', ...six(), unique_answer: false
  });
  assert.equal(failedDimension.error, 'approval_requires_all_dimensions_true');
});

test('failed dimension requires a non-approved status and notes', () => {
  const item = revealed(getExerciseReviewItems()[0]);
  const missingNotes = applyExerciseTeacherReview(item, {
    review_status: 'needs_revision', reviewer_id: 'teacher-001', ...six(), difficulty_appropriate: false
  });
  assert.equal(missingNotes.error, 'notes_required_for_failed_dimension');
  const approved = applyExerciseTeacherReview(item, {
    review_status: 'needs_revision', reviewer_id: 'teacher-001', reviewer_notes: '难度偏低', ...six(), difficulty_appropriate: false
  }, '2026-08-22T00:00:00Z');
  assert.equal(approved.valid, true);
  assert.equal(approved.value.review_status, 'needs_revision');
  assert.equal(approved.value.reviewed_at, '2026-08-22T00:00:00Z');
});

test('all-pass exercise cannot be rejected or marked revision', () => {
  const item = revealed(getExerciseReviewItems()[0]);
  const result = applyExerciseTeacherReview(item, {
    review_status: 'rejected', reviewer_id: 'teacher-001', reviewer_notes: '不使用', ...six()
  });
  assert.equal(result.error, 'non_approval_requires_failed_dimension');
});

test('blind disagreement is preserved as a metric but does not override six-dimension approval', () => {
  const seed = getExerciseReviewItems()[0];
  const item = revealed(seed, { blind_answer: seed.options.find((option) => option !== seed.answer) });
  const result = applyExerciseTeacherReview(item, {
    review_status: 'approved', reviewer_id: 'teacher-001', ...six()
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.review_status, 'approved');
  assert.notEqual(result.value.blind_answer, result.value.answer);
});

test('public exercise review and progress preserve pending status without inventing approval', () => {
  const items = getExerciseReviewItems();
  const publicItem = publicExerciseReview(items[0], blindExerciseReviewId(0));
  publicItem.passage = 'changed outside';
  assert.notEqual(publicItem.passage, items[0].passage);
  const progress = exerciseReviewProgress(items);
  assert.equal(progress.pending, 10);
  assert.equal(progress.gold_eligible, 0);
  assert.equal(progress.teacher_validity, null);
});

test('blind exercise ids are opaque, stable and reject invalid indexes', () => {
  assert.equal(blindExerciseReviewId(0), 'blind-exercise-001');
  assert.equal(blindExerciseReviewId(9), 'blind-exercise-010');
  assert.equal(blindExerciseReviewId(-1), null);
  assert.equal(blindExerciseReviewId(1.5), null);
});

test('stale exercise review cannot overwrite a newer blind-review stage', () => {
  const item = getExerciseReviewItems()[0];
  const staleRevision = reviewRevision(item, 'exercise');
  const locked = revealed(item);
  const overwrite = applyExerciseBlindResponseRaw(locked, {
    expected_revision: staleRevision, reviewer_id: 'teacher-002', reviewer_role: 'ielts_reading_teacher',
    qualification_attested: true, independence_attested: true, review_track: 'independent_teacher_exercise',
    review_protocol_version: 'exercise-two-stage-v3',
    blind_answer: item.answer, blind_target_error: item.target_error
  });
  assert.equal(overwrite.valid, false);
  assert.equal(overwrite.status, 409);
  assert.equal(overwrite.error, 'stale_review_revision');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getExerciseReviewItems } from '../src/exercises.js';
import {
  eligibleExerciseReviews, exerciseReviewSummary, toExerciseReviewCsv,
  validateExerciseReviewIntegrity, validateExerciseReviews
} from '../evals/exercise-review.js';
import { parseExerciseReviewCsv } from '../evals/import-exercise-review-csv.js';

test('exercise review pack contains all ten unchanged exercises', () => {
  const items = getExerciseReviewItems();
  assert.deepEqual(validateExerciseReviews(items), { valid: true, count: 10, errors: [] });
  const roundTrip = parseExerciseReviewCsv(toExerciseReviewCsv(items));
  assert.equal(roundTrip.length, 10);
  assert.equal(validateExerciseReviewIntegrity(roundTrip, items).valid, true);
});

test('pending reviews cannot create a teacher validity claim', () => {
  const summary = exerciseReviewSummary(getExerciseReviewItems());
  assert.equal(summary.pending, 10);
  assert.equal(summary.teacher_validity, null);
  assert.equal(summary.gold_eligible, 0);
});

test('only fully approved six-dimension review is eligible', () => {
  const [item] = getExerciseReviewItems();
  Object.assign(item, {
    review_status: 'approved', targets_primary_error: true, original_content: true, unique_answer: true,
    answer_correct: true, difficulty_appropriate: true, no_answer_leak: true,
    blind_answer: item.answer, blind_target_error: item.target_error, blind_revealed_at: '2026-08-22T00:00:00Z',
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_exercise',
    review_protocol_version: 'exercise-two-stage-v3',
    reviewed_at: '2026-08-22T00:00:00Z'
  });
  assert.equal(eligibleExerciseReviews([item]).length, 1);
  item.difficulty_appropriate = false;
  assert.equal(eligibleExerciseReviews([item]).length, 0);
});

test('teacher validity and blind agreement remain separate measures', () => {
  const [item] = getExerciseReviewItems();
  Object.assign(item, {
    review_status: 'approved', targets_primary_error: true, original_content: true, unique_answer: true,
    answer_correct: true, difficulty_appropriate: true, no_answer_leak: true,
    blind_answer: item.answer, blind_target_error: 'over_inference', blind_revealed_at: '2026-08-22T00:00:00Z',
    reviewer_id: 'teacher-001', reviewer_role: 'ielts_reading_teacher', qualification_attested: true,
    independence_attested: true, review_track: 'independent_teacher_exercise',
    review_protocol_version: 'exercise-two-stage-v3', reviewed_at: '2026-08-22T00:00:00Z'
  });
  const summary = exerciseReviewSummary([item]);
  assert.equal(summary.teacher_validity, 1);
  assert.equal(summary.blind_answer_agreement, 1);
  assert.equal(summary.blind_target_agreement, 0);
});

test('blind agreement metrics stay unavailable until all ten reviews complete', () => {
  const items = getExerciseReviewItems();
  const summary = exerciseReviewSummary(items);
  assert.equal(summary.blinded_complete, 0);
  assert.equal(summary.blind_answer_agreement, null);
  assert.equal(summary.blind_target_agreement, null);
});

test('review import rejects modified exercise content', () => {
  const seeds = getExerciseReviewItems();
  const modified = structuredClone(seeds);
  modified[0].answer = 'tampered';
  const integrity = validateExerciseReviewIntegrity(modified, seeds);
  assert.equal(integrity.valid, false);
  assert.match(integrity.errors[0], /answer was modified/);
});

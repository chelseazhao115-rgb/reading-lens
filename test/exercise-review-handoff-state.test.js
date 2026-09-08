import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveExerciseReviewHandoffState } from '../public/exercise-review-handoff-state.js';

const cases = (reviewed) => Array.from({ length: 10 }, (_, index) => ({ review_status: index < reviewed ? 'approved' : 'pending' }));

test('exercise handoff starts at the first opaque blind exercise', () => {
  const state = deriveExerciseReviewHandoffState({
    progress: { total: 10, reviewed_complete: 0, blinded_complete: 0, gold_eligible: 0 }, cases: cases(0)
  });
  assert.equal(state.href, '/exercise-review.html?case=1');
  assert.match(state.title, /先盲判/);
  assert.match(state.status, /0\/10/);
});

test('exercise handoff resumes at the next pending exercise without publishing partial rates', () => {
  const state = deriveExerciseReviewHandoffState({
    progress: { total: 10, reviewed_complete: 3, blinded_complete: 4, gold_eligible: 2 }, cases: cases(3)
  });
  assert.equal(state.href, '/exercise-review.html?case=4');
  assert.match(state.title, /3\/10.*第4题/);
  assert.match(state.status, /已锁定盲判4\/10条/);
  assert.doesNotMatch(state.status, /20%|40%/);
});

test('exercise handoff reports completion only after all ten reviews finish', () => {
  const state = deriveExerciseReviewHandoffState({
    progress: { total: 10, reviewed_complete: 10, blinded_complete: 10, gold_eligible: 9 }, cases: cases(10)
  });
  assert.equal(state.href, '/exercise-review.html');
  assert.match(state.title, /10条独立教师审核已完成/);
  assert.match(state.status, /9\/10/);
});

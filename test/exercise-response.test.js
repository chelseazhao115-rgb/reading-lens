import test from 'node:test';
import assert from 'node:assert/strict';
import { rollbackUnverifiedAttempt, validExerciseCheckResponse } from '../public/exercise-response.js';

const valid = {
  valid: true, status: 'checked', exercise_id: 'location_transfer_01', target_error: 'location',
  stage: 'transfer', correct: false, feedback: '迁移题尚未答对。', next_exercise: null
};

test('client accepts only a complete matching exercise check response', () => {
  assert.equal(validExerciseCheckResponse(valid, 'location_transfer_01'), true);
  assert.equal(validExerciseCheckResponse({ ...valid, exercise_id: 'other' }, 'location_transfer_01'), false);
  assert.equal(validExerciseCheckResponse({ ...valid, status: 'request_error' }, 'location_transfer_01'), false);
  assert.equal(validExerciseCheckResponse({ ...valid, correct: undefined }, 'location_transfer_01'), false);
  assert.equal(validExerciseCheckResponse(null, 'location_transfer_01'), false);
  const immediate = {
    ...valid, exercise_id: 'location_immediate_01', stage: 'immediate', correct: true,
    next_exercise: { id: 'location_transfer_01', target_error: 'location', stage: 'transfer', passage: 'Text.', question: 'Question?', options: ['A', 'B'] }
  };
  assert.equal(validExerciseCheckResponse(immediate, 'location_immediate_01'), true);
  assert.equal(validExerciseCheckResponse({ ...immediate, next_exercise: { ...immediate.next_exercise, target_error: 'paraphrase' } }, 'location_immediate_01'), false);
  assert.equal(validExerciseCheckResponse({ ...immediate, next_exercise: { ...immediate.next_exercise, answer: 'A' } }, 'location_immediate_01'), false);
});

test('network or invalid responses do not consume a learner attempt', () => {
  assert.equal(rollbackUnverifiedAttempt(1), 0);
  assert.equal(rollbackUnverifiedAttempt(3), 2);
  assert.equal(rollbackUnverifiedAttempt(0), 0);
  assert.equal(rollbackUnverifiedAttempt(Number.NaN), 0);
});

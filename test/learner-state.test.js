import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDiagnosis, applyEvidenceTime, applyExerciseResult, createLearnerState, recordEvent } from '../src/learner-state.js';

test('learner state records observable repeated errors without personality labels', () => {
  let state = createLearnerState();
  const diagnosis = { status: 'diagnosed', primary_error: 'paraphrase' };
  state = applyDiagnosis(state, diagnosis, '2026-08-22T00:00:00.000Z');
  state = applyDiagnosis(state, diagnosis, '2026-08-22T00:01:00.000Z');
  assert.equal(state.error_counts.paraphrase, 2);
  assert.deepEqual(state.recurring_errors, ['paraphrase']);
  assert.doesNotMatch(JSON.stringify(state), /粗心|逻辑差|学习能力弱/);
});

test('learner state separates immediate and transfer outcomes', () => {
  let state = createLearnerState();
  state = applyExerciseResult(state, { exercise_id: 'a', target_error: 'location', stage: 'immediate', correct: true }, 1);
  state = applyExerciseResult(state, { exercise_id: 'b', target_error: 'location', stage: 'transfer', correct: false }, 0);
  assert.equal(state.micro_exercise_results.length, 1);
  assert.equal(state.transfer_results.length, 1);
  assert.equal(state.help_dependency, 0.5);
});

test('analytics events are appended with explicit names', () => {
  const state = recordEvent(createLearnerState(), 'diagnosis_completed', { primary_error: 'location' }, '2026-08-22T00:00:00.000Z');
  assert.equal(state.events[0].event, 'diagnosis_completed');
});

test('learner state records average evidence time and retry attempts', () => {
  let state = createLearnerState();
  state = applyEvidenceTime(state, 12.5);
  state = applyEvidenceTime(state, 17.5);
  state = applyExerciseResult(state, { exercise_id: 'a', target_error: 'location', stage: 'immediate', correct: false, attempt_number: 1 }, 1);
  state = applyExerciseResult(state, { exercise_id: 'a', target_error: 'location', stage: 'immediate', correct: true, attempt_number: 2 }, 0);
  assert.equal(state.average_evidence_time, 15);
  assert.deepEqual(state.micro_exercise_results.map((item) => item.attempt_number), [1, 2]);
  assert.equal(state.help_dependency, 0.5);
});

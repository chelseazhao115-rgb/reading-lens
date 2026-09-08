import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIMARY_ERRORS } from '../src/taxonomy.js';
import { checkExercise, getExerciseSet, publicExerciseCheckResult, validateExerciseBank } from '../src/exercises.js';

test('exercise bank is structurally valid', () => {
  assert.deepEqual(validateExerciseBank(), { valid: true, count: 10, errors: [] });
});

test('every primary error has one immediate and one transfer exercise', () => {
  for (const category of PRIMARY_ERRORS) {
    const set = getExerciseSet(category);
    assert.equal(set.immediate.target_error, category);
    assert.equal(set.immediate.stage, 'immediate');
    assert.equal(set.transfer.target_error, category);
    assert.equal(set.transfer.stage, 'transfer');
  }
});

test('public exercise payload never leaks the answer', () => {
  for (const category of PRIMARY_ERRORS) {
    const set = getExerciseSet(category);
    assert.equal('answer' in set.immediate, false);
    assert.equal('answer' in set.transfer, false);
    assert.equal(JSON.stringify(set).includes('correct_answer'), false);
  }
});

test('server-side exercise check returns correctness and transfer stage', () => {
  const result = checkExercise('strategy_transfer_01', 'NOT GIVEN');
  assert.equal(result.valid, true);
  assert.equal(result.correct, true);
  assert.equal(result.stage, 'transfer');
  assert.match(result.feedback, /迁移题回答正确/);
});

test('public check responses never expose answer on wrong, correct or transfer attempts', () => {
  const results = [
    checkExercise('location_immediate_01', 'The city introduced electric buses in 2021.'),
    checkExercise('location_immediate_01', 'Passenger complaints fell after new route maps were installed in 2023.'),
    checkExercise('location_transfer_01', 'Some desert plants store water in thick leaves.')
  ];
  assert.equal(results[0].correct, false);
  assert.equal(results[1].correct, true);
  for (const result of results) {
    assert.equal('correct_answer' in result, true, 'internal result keeps deterministic gold');
    const safe = publicExerciseCheckResult(result);
    assert.equal('correct_answer' in safe, false);
    assert.equal(JSON.stringify(safe).includes(result.correct_answer), false);
  }
});

test('public immediate success plus next transfer payload contains no exercise gold', () => {
  const internal = checkExercise('strategy_immediate_01', 'NOT GIVEN');
  const response = { ...publicExerciseCheckResult(internal), next_exercise: getExerciseSet('question_strategy').transfer };
  assert.equal(response.correct, true);
  assert.equal(JSON.stringify(response).includes('correct_answer'), false);
  assert.equal(JSON.stringify(response).includes('answer'), false);
});

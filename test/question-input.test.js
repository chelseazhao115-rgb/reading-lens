import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeDemoDiagnosticInput } from '../src/question-input.js';

test('server canonicalization ignores client-tampered answer, passage and standard evidence', () => {
  const result = canonicalizeDemoDiagnosticInput({
    question_id: 'demo_square_002', user_answer: 'TRUE',
    user_evidence: { quote: 'The council later prohibited private cars from entering the square between noon and six' },
    reasoning_process: 'The sentence directly supports the statement.',
    correct_answer: 'FALSE', passage: 'tampered passage', question: 'tampered question',
    standard_evidence: { quote: 'tampered evidence' }
  });
  assert.equal(result.valid, true);
  assert.equal(result.input.correct_answer, 'TRUE');
  assert.notEqual(result.input.passage, 'tampered passage');
  assert.notEqual(result.input.question, 'tampered question');
  assert.notEqual(result.input.standard_evidence.quote, 'tampered evidence');
});

test('unknown question id is rejected instead of falling back to another question', () => {
  assert.deepEqual(canonicalizeDemoDiagnosticInput({ question_id: 'unknown' }), { valid: false, error: 'unknown_question_id' });
});

test('canonicalization only carries whitelisted student behavior fields', () => {
  const result = canonicalizeDemoDiagnosticInput({
    question_id: 'demo_fox_001', user_answer: 'TRUE', user_evidence: { quote: 'quote' },
    reasoning_process: 'reason', previous_error_history: ['location'], admin_override: true
  });
  assert.equal(result.valid, true);
  assert.equal('admin_override' in result.input, false);
  assert.deepEqual(result.input.previous_error_history, ['location']);
});

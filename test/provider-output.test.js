import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProviderOutput } from '../src/provider-output.js';

test('correct output requires all five causal steps to pass', () => {
  const result = validateProviderOutput({
    status: 'correct', primary_error: null, confidence: 0.9,
    evidence: { standard_quote_valid: true },
    decision_trace: {
      evidence_location: 'pass', semantic_mapping: 'pass', sentence_understanding: 'pass',
      question_rule: 'pass', reasoning_boundary: 'pass'
    }
  });
  assert.equal(result.valid, true, result.errors.join(','));
});

test('diagnosed output below 0.60 cannot bypass confidence policy', () => {
  const result = validateProviderOutput({
    status: 'diagnosed', primary_error: 'location', secondary_error: null, confidence: 0.59,
    evidence: { standard_quote_valid: true },
    decision_trace: {
      evidence_location: 'fail', semantic_mapping: 'not_assessed', sentence_understanding: 'not_assessed',
      question_rule: 'not_assessed', reasoning_boundary: 'not_assessed'
    }
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('diagnosis_below_confidence_threshold'));
});

test('high-confidence abstention is rejected as contradictory output', () => {
  const result = validateProviderOutput({
    status: 'abstained', primary_error: 'insufficient_information', confidence: 0.8, reason: 'Cannot decide.'
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('abstention_confidence_too_high'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteExistsInPassage } from '../src/text.js';
import { validateStandardEvidence, validateUserEvidence } from '../src/validators.js';

test('accepts an exact evidence quote after whitespace normalization', () => {
  assert.equal(quoteExistsInPassage('The path closes in winter.', 'Before sunrise.  The path closes in winter. After sunset.'), true);
});

test('rejects a paraphrase presented as a quote', () => {
  assert.equal(quoteExistsInPassage('The route is shut during winter.', 'The path closes in winter.'), false);
});

test('evidence validator fails closed when quote is absent', () => {
  const result = validateStandardEvidence({ passage: 'Only source text.', standard_evidence: { quote: 'Invented quote.' } });
  assert.deepEqual(result, { valid: false, status: 'evidence_validation_failed', reason: 'quote_not_in_passage' });
});

test('user evidence must be a verbatim passage quote', () => {
  const result = validateUserEvidence({ passage: 'Only source text.', user_evidence: { quote: 'Invented learner quote.' } });
  assert.deepEqual(result, { valid: false, status: 'evidence_validation_failed', reason: 'user_quote_not_in_passage' });
});

test('a wrong-location quote is valid evidence when it exists in the passage', () => {
  const result = validateUserEvidence({ passage: 'Relevant sentence. Unrelated sentence.', user_evidence: { quote: 'Unrelated sentence.' } });
  assert.deepEqual(result, { valid: true, status: 'ok', reason: null });
});

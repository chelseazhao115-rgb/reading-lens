import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeExternalDiagnosticInput } from '../src/external-question-input.js';

const valid = {
  source: 'idictation', source_url: 'https://www.idictation.cn/ielts/read-result/read-jy/123',
  question_number: '8', question_type: 'TRUE_FALSE_NOT_GIVEN',
  passage: 'The route closes in winter.', question: 'The route stays open all year.', options: ['TRUE', 'FALSE', 'NOT GIVEN'],
  user_answer: 'NOT GIVEN', correct_answer: 'FALSE', user_evidence: 'The route closes in winter.',
  standard_evidence: 'The route closes in winter.', reasoning_process: 'I treated absent detail as NOT GIVEN.',
  adapter_version: 'idictation-v1'
};

test('canonicalizes a complete idictation payload without retaining its URL path', () => {
  const result = canonicalizeExternalDiagnosticInput(valid);
  assert.equal(result.valid, true);
  assert.equal(result.provenance.source_origin, 'https://www.idictation.cn');
  assert.equal(result.provenance.source_url, undefined);
  assert.match(result.provenance.content_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.input.user_evidence, { quote: valid.user_evidence });
});

test('rejects non-target URLs and incomplete adapter output', () => {
  assert.equal(canonicalizeExternalDiagnosticInput({ ...valid, source_url: 'https://example.com/test' }).error, 'unsupported_source_url');
  const missing = canonicalizeExternalDiagnosticInput({ ...valid, correct_answer: '' });
  assert.equal(missing.error, 'missing_required_fields');
  assert.deepEqual(missing.missing_fields, ['correct_answer']);
});

test('rejects oversized passages before provider execution', () => {
  const result = canonicalizeExternalDiagnosticInput({ ...valid, passage: 'x'.repeat(30001) });
  assert.deepEqual({ error: result.error, field: result.field }, { error: 'field_too_long', field: 'passage' });
});

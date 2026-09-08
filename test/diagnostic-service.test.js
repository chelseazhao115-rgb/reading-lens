import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiagnosticService } from '../src/diagnostic-service.js';

const validInput = {
  passage: 'The path closes in winter.',
  question_type: 'TRUE_FALSE_NOT_GIVEN',
  question: 'The path remains open in winter.',
  correct_answer: 'FALSE',
  user_answer: 'TRUE',
  standard_evidence: { quote: 'The path closes in winter.' },
  user_evidence: { quote: 'The path closes in winter.' },
  reasoning_process: 'I did not notice that closes means it is not open.'
};

test('safety gate blocks hallucinated standard evidence before provider runs', async () => {
  let calls = 0;
  const provider = { id: 'spy', promptVersion: 'p1', modelVersion: 'm1', async diagnose() { calls += 1; return {}; } };
  const service = createDiagnosticService(provider);
  const result = await service.diagnose({ ...validInput, standard_evidence: { quote: 'Invented.' } });
  assert.equal(calls, 0);
  assert.equal(result.status, 'evidence_validation_failed');
});

test('safety gate rejects learner evidence that is not in the passage before provider runs', async () => {
  let calls = 0;
  const provider = { id: 'spy', promptVersion: 'p1', modelVersion: 'm1', async diagnose() { calls += 1; return {}; } };
  const result = await createDiagnosticService(provider).diagnose({
    ...validInput,
    user_evidence: { quote: 'This sentence was never in the passage.' }
  });
  assert.equal(calls, 0);
  assert.equal(result.status, 'evidence_validation_failed');
  assert.equal(result.primary_error, 'insufficient_information');
  assert.equal(result.reason, 'user_quote_not_in_passage');
});

test('provider and version metadata are recorded for valid diagnosis', async () => {
  const provider = {
    id: 'fake-provider', promptVersion: 'prompt-7', promptHash: 'abc123', modelVersion: 'model-3',
    async diagnose() { return validSentenceDiagnosis(); }
  };
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.provider, 'fake-provider');
  assert.equal(result.prompt_version, 'prompt-7');
  assert.equal(result.prompt_hash, 'abc123');
  assert.equal(result.model_version, 'model-3');
  assert.equal(result.confidence_components.decision_tree_consistency, 1);
  assert.equal(result.answer_result, 'incorrect');
});

test('provider cannot override the server-computed answer result', async () => {
  const provider = fakeProvider({ ...validSentenceDiagnosis(), answer_result: 'correct' });
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.answer_result, 'incorrect');
  assert.equal(result.lucky_correct, false);
});

test('illegal provider label fails closed without returning feedback-ready diagnosis', async () => {
  const provider = fakeProvider({ ...validSentenceDiagnosis(), primary_error: 'careless' });
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.status, 'abstained');
  assert.equal(result.primary_error, 'insufficient_information');
  assert.equal(result.requires_teacher_review, true);
  assert.equal(result.guard_reason_code, 'provider_output_validation_failed');
  assert.ok(result.output_validation_errors.includes('invalid_primary_error_for_diagnosis'));
});

test('causal-chain jump in provider trace fails closed', async () => {
  const provider = fakeProvider({
    ...validSentenceDiagnosis(),
    decision_trace: {
      evidence_location: 'pass', semantic_mapping: 'not_assessed', sentence_understanding: 'fail',
      question_rule: 'not_assessed', reasoning_boundary: 'not_assessed'
    }
  });
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.status, 'abstained');
  assert.ok(result.output_validation_errors.includes('decision_trace_causal_order_invalid'));
});

test('invalid paid provider output preserves cost telemetry for budget audit', async () => {
  const provider = fakeProvider({
    ...validSentenceDiagnosis(), primary_error: 'invented_label', model_cost_usd: 0.00042
  });
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.status, 'abstained');
  assert.equal(result.model_cost_usd, 0.00042);
  assert.ok(result.output_validation_errors.includes('invalid_primary_error_for_diagnosis'));
  assert.deepEqual(result.output_validation_snapshot, {
    status: 'diagnosed', primary_error: 'invented_label', confidence: 0.8, confidence_type: 'number'
  });
});

test('provider exception fails closed with reproducibility metadata', async () => {
  const provider = {
    id: 'failing-provider', promptVersion: 'p9', modelVersion: 'm9',
    async diagnose() { throw new Error('secret upstream detail'); }
  };
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.status, 'abstained');
  assert.equal(result.provider, 'failing-provider');
  assert.equal(result.prompt_version, 'p9');
  assert.equal(result.model_version, 'm9');
  assert.deepEqual(result.output_validation_errors, ['provider_request_failed']);
  assert.doesNotMatch(result.reason, /secret upstream detail/);
  assert.equal(result.provider_failure_code, 'provider_request_failed');
});

test('provider failure telemetry exposes only an allowlisted cause code', async () => {
  const provider = {
    id: 'json-failing-provider', promptVersion: 'p11', modelVersion: 'm11',
    async diagnose() {
      throw Object.assign(new Error('raw output and secret detail'), {
        code: 'provider_output_json_invalid', model_cost_usd: 0.00031
      });
    }
  };
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.status, 'abstained');
  assert.equal(result.provider_failure_code, 'provider_output_json_invalid');
  assert.deepEqual(result.output_validation_errors, ['provider_output_json_invalid']);
  assert.equal(result.model_cost_usd, 0.00031);
  assert.doesNotMatch(JSON.stringify(result), /raw output|secret detail/);
});

test('provider timeout aborts and fails closed without blocking the diagnosis request', async () => {
  let aborted = false;
  const provider = {
    id: 'hanging-provider', promptVersion: 'p10', modelVersion: 'm10',
    diagnose(_input, { signal }) {
      signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    }
  };
  const startedAt = Date.now();
  const result = await createDiagnosticService(provider, { timeoutMs: 10 }).diagnose(validInput);
  assert.equal(result.status, 'abstained');
  assert.deepEqual(result.output_validation_errors, ['provider_timeout']);
  assert.equal(aborted, true);
  assert.ok(Date.now() - startedAt < 500);
});

test('provider confidence is capped by deterministic evidence and reasoning components', async () => {
  const provider = fakeProvider({ ...validSentenceDiagnosis(), confidence: 0.99 });
  const result = await createDiagnosticService(provider).diagnose(validInput);
  assert.equal(result.confidence, 0.85);
  assert.equal(result.confidence_ceiling, 0.85);
  assert.equal(result.confidence_language, '你的主要错因是');
});

function validSentenceDiagnosis() {
  return {
    status: 'diagnosed', primary_error: 'sentence_comprehension', secondary_error: null, confidence: 0.8,
    evidence: { standard_quote_valid: true },
    decision_trace: {
      evidence_location: 'pass', semantic_mapping: 'pass', sentence_understanding: 'fail',
      question_rule: 'not_assessed', reasoning_boundary: 'not_assessed'
    }
  };
}

function fakeProvider(value) {
  return { id: 'fake-provider', promptVersion: 'p1', modelVersion: 'm1', async diagnose() { return value; } };
}

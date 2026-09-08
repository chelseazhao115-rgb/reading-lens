import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDeepSeekCandidateEvidence } from '../src/provider-candidate-evidence.js';

const smoke = JSON.parse(fs.readFileSync(new URL('../evals/results/deepseek-smoke.json', import.meta.url), 'utf8'));
const remaining = JSON.parse(fs.readFileSync(new URL('../evals/results/deepseek-remaining.json', import.meta.url), 'utf8'));
const v3Smoke = JSON.parse(fs.readFileSync(new URL('../evals/results/deepseek-v3-smoke.json', import.meta.url), 'utf8'));
const v3Remaining = JSON.parse(fs.readFileSync(new URL('../evals/results/deepseek-v3-remaining.json', import.meta.url), 'utf8'));

test('DeepSeek v2 evidence recomputes all eight paid calls and preserves the failed promotion gate', () => {
  const result = buildDeepSeekCandidateEvidence(smoke, remaining);
  assert.equal(result.valid, true);
  assert.equal(result.v2.metrics.total, 8);
  assert.equal(result.v2.metrics.exact_classification_accuracy, 0.75);
  assert.equal(result.v2.metrics.unsafe_diagnosis_rate, 0);
  assert.equal(result.v2.metrics.abstention_rate, 0.25);
  assert.equal(result.v2.metrics.output_guard_failure_rate, 0.25);
  assert.equal(result.v2.metrics.total_cost_usd, 0.00187866);
  assert.equal(result.v2.promotion_gate.eligible_for_promotion, false);
  assert.equal(result.comparison.unsafe_diagnosis_change, -0.5);
});

test('DeepSeek v3 evidence preserves history and does not promote a contract-failing candidate', () => {
  const result = buildDeepSeekCandidateEvidence(smoke, remaining, v3Smoke, v3Remaining);
  assert.equal(result.valid, true);
  assert.equal(result.v2.metrics.exact_classification_accuracy, 0.75);
  assert.equal(result.v3.metrics.total, 8);
  assert.equal(result.v3.metrics.exact_classification_accuracy, 0.875);
  assert.equal(result.v3.metrics.unsafe_diagnosis_rate, 0);
  assert.equal(result.v3.metrics.abstention_rate, 0.125);
  assert.equal(result.v3.metrics.output_guard_failure_rate, 0.125);
  assert.equal(result.v3.promotion_gate.eligible_for_promotion, false);
  assert.equal(result.comparison.v2_to_v3_accuracy_change, 0.125);
  assert.equal(result.comparison.v2_to_v3_contract_failure_change, -0.125);
});

test('candidate evidence rejects mixed prompt versions or incomplete case sets', () => {
  const mixed = structuredClone(remaining);
  mixed.provider.prompt_version = 'diagnostic-causal-v1';
  const result = buildDeepSeekCandidateEvidence(smoke, mixed);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(','), /remaining_prompt_invalid/);
  const incomplete = structuredClone(remaining);
  incomplete.cases.pop();
  assert.match(buildDeepSeekCandidateEvidence(smoke, incomplete).errors.join(','), /candidate_case_count_invalid/);
});

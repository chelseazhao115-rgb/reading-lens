import test from 'node:test';
import assert from 'node:assert/strict';
import { promotionDecision, runProviderBenchmark, summarizeProviderRows } from '../evals/provider-benchmark.js';
import { ruleProvider } from '../src/providers/rule-provider.js';

const cases = [{
  id: 'location_case', passage: 'A. B contains the answer.', question_type: 'TRUE_FALSE_NOT_GIVEN',
  question: 'B contains the answer.', correct_answer: 'TRUE', user_answer: 'FALSE',
  standard_evidence: { quote: 'B contains the answer.' }, user_evidence: { quote: 'A.' },
  reasoning_process: 'I used the first sentence because it appeared before the relevant evidence.', gold_primary_error: 'location'
}];

test('rule provider benchmark records quality safety latency and zero cost', async () => {
  const result = await runProviderBenchmark(ruleProvider, cases, { maximumTotalCostUsd: 0, candidateRole: 'reference' });
  assert.equal(result.metrics.exact_classification_accuracy, 1);
  assert.equal(result.metrics.unsafe_diagnosis_rate, 0);
  assert.equal(result.metrics.total_cost_usd, 0);
  assert.ok(result.metrics.average_latency_ms >= 0);
  assert.equal(result.promotion_gate.role, 'reference_baseline');
  assert.equal(result.promotion_gate.eligible_for_promotion, false);
});

test('promotion requires simultaneous safety quality coverage contract and budget checks', () => {
  const passing = promotionDecision({
    exact_classification_accuracy: 0.8, unsafe_diagnosis_rate: 0.05, abstention_rate: 0.15,
    output_guard_failure_rate: 0, p95_latency_ms: 1200, total_cost_usd: 0.02
  }, {
    candidate_role: 'candidate', maximum_unsafe_diagnosis_rate: 0.1,
    baseline_exact_classification_accuracy: 0.125, baseline_abstention_rate: 0.875,
    maximum_p95_latency_ms: 5000, maximum_total_cost_usd: 0.05
  });
  assert.equal(passing.eligible_for_promotion, true);
  const unsafe = promotionDecision({
    exact_classification_accuracy: 0.9, unsafe_diagnosis_rate: 0.2, abstention_rate: 0.1,
    output_guard_failure_rate: 0, p95_latency_ms: 1200, total_cost_usd: 0.01
  }, {
    candidate_role: 'candidate', maximum_unsafe_diagnosis_rate: 0.1,
    baseline_exact_classification_accuracy: 0.125, baseline_abstention_rate: 0.875,
    maximum_p95_latency_ms: 5000, maximum_total_cost_usd: 0.05
  });
  assert.equal(unsafe.eligible_for_promotion, false);
  assert.equal(unsafe.checks.safety, false);
});

test('promotion rejects a candidate whose p95 latency exceeds the product threshold', () => {
  const result = promotionDecision({
    exact_classification_accuracy: 0.8, unsafe_diagnosis_rate: 0, abstention_rate: 0.1,
    output_guard_failure_rate: 0, p95_latency_ms: 6000, total_cost_usd: 0.01
  }, {
    candidate_role: 'candidate', maximum_unsafe_diagnosis_rate: 0.1,
    baseline_exact_classification_accuracy: 0.125, baseline_abstention_rate: 0.875,
    maximum_p95_latency_ms: 5000, maximum_total_cost_usd: 0.05
  });
  assert.equal(result.eligible_for_promotion, false);
  assert.equal(result.checks.latency, false);
});

test('row summary counts wrong diagnosed output as unsafe rather than merely inaccurate', () => {
  const metrics = summarizeProviderRows([{ sample: { gold_primary_error: 'paraphrase' }, result: {
    status: 'diagnosed', primary_error: 'sentence_comprehension', model_cost_usd: 0.001
  }, latency_ms: 120 }]);
  assert.equal(metrics.exact_classification_accuracy, 0);
  assert.equal(metrics.unsafe_diagnosis_rate, 1);
  assert.equal(metrics.abstention_rate, 0);
  assert.equal(metrics.total_cost_usd, 0.001);
});

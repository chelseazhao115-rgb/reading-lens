import { DEFAULT_PROMOTION_THRESHOLDS, promotionDecision, summarizeProviderRows } from '../evals/provider-benchmark.js';

const V1_DOCUMENTED_SUMMARY = Object.freeze({
  prompt_version: 'diagnostic-causal-v1',
  source: 'docs/iteration-046.md',
  raw_case_artifacts_retained: false,
  metrics: Object.freeze({
    total: 8,
    exact_classification_accuracy: 0.5,
    unsafe_diagnosis_rate: 0.5,
    abstention_rate: 0,
    p95_latency_ms: 2126,
    total_cost_usd: 0.00143766
  })
});

export function buildDeepSeekCandidateEvidence(smoke, remaining, v3Smoke = null, v3Remaining = null) {
  const errors = validateParts(smoke, remaining, 'diagnostic-causal-v2');
  if (errors.length) return { valid: false, errors };
  const v2 = summarizeCandidate(smoke, remaining, [
    'evals/results/deepseek-smoke.json', 'evals/results/deepseek-remaining.json'
  ]);
  let v3 = null;
  if (v3Smoke || v3Remaining) {
    const v3Errors = validateParts(v3Smoke, v3Remaining, 'diagnostic-causal-v3');
    if (v3Errors.length) return { valid: false, errors: v3Errors.map((error) => `v3_${error}`) };
    v3 = summarizeCandidate(v3Smoke, v3Remaining, [
      'evals/results/deepseek-v3-smoke.json', 'evals/results/deepseek-v3-remaining.json'
    ]);
  }
  const latest = v3 ?? v2;
  return {
    valid: true,
    data_source: 'live_paid_provider_evaluation',
    provider: structuredClone((v3Smoke ?? smoke).provider),
    dataset: {
      total: latest.metrics.total,
      origin: (v3Smoke ?? smoke).dataset.origin,
      limitation: 'Eight project-authored adversarial cases; not independent Teacher Gold and not evidence of learning effectiveness.'
    },
    v1: structuredClone(V1_DOCUMENTED_SUMMARY),
    v2,
    ...(v3 ? { v3 } : {}),
    comparison: {
      accuracy_change: round(latest.metrics.exact_classification_accuracy - V1_DOCUMENTED_SUMMARY.metrics.exact_classification_accuracy),
      unsafe_diagnosis_change: round(latest.metrics.unsafe_diagnosis_rate - V1_DOCUMENTED_SUMMARY.metrics.unsafe_diagnosis_rate),
      v2_to_v3_accuracy_change: v3 ? round(v3.metrics.exact_classification_accuracy - v2.metrics.exact_classification_accuracy) : null,
      v2_to_v3_contract_failure_change: v3 ? round(v3.metrics.output_guard_failure_rate - v2.metrics.output_guard_failure_rate) : null,
      interpretation: v3
        ? 'Prompt v3 improved exact classification and reduced contract failures, but one over-inference case still failed the provider/output contract and was safely rejected.'
        : 'Prompt v2 removed observed unsafe wrong diagnoses, but two outputs still failed the causal/structured contract and were safely rejected.'
    }
  };
}

function summarizeCandidate(smoke, remaining, sourceArtifacts) {
  const cases = [...smoke.cases, ...remaining.cases];
  const rows = cases.map((item) => ({
    sample: { gold_primary_error: item.expected },
    result: {
      status: item.status,
      primary_error: item.predicted,
      guard_reason_code: item.guard_reason_code,
      model_cost_usd: item.cost_usd
    },
    latency_ms: item.latency_ms
  }));
  const metrics = summarizeProviderRows(rows);
  const promotionGate = promotionDecision(metrics, {
    ...DEFAULT_PROMOTION_THRESHOLDS,
    maximum_total_cost_usd: smoke.budget.maximum_total_cost_usd + remaining.budget.maximum_total_cost_usd,
    maximum_p95_latency_ms: Math.min(smoke.budget.maximum_p95_latency_ms, remaining.budget.maximum_p95_latency_ms),
    candidate_role: 'candidate'
  });
  return {
    prompt_version: smoke.provider.prompt_version,
    raw_case_artifacts_retained: true,
    source_artifacts: sourceArtifacts,
    metrics: { total: cases.length, ...metrics },
    promotion_gate: promotionGate
  };
}

function validateParts(smoke, remaining, expectedPromptVersion) {
  const errors = [];
  for (const [name, value] of [['smoke', smoke], ['remaining', remaining]]) {
    if (value?.provider?.id !== 'deepseek-responses') errors.push(`${name}_provider_invalid`);
    if (value?.provider?.prompt_version !== expectedPromptVersion) errors.push(`${name}_prompt_invalid`);
    if (!Array.isArray(value?.cases)) errors.push(`${name}_cases_invalid`);
  }
  if (smoke?.provider?.prompt_hash !== remaining?.provider?.prompt_hash) errors.push('prompt_hash_mismatch');
  if (smoke?.provider?.model_version !== remaining?.provider?.model_version) errors.push('model_version_mismatch');
  const cases = [...(smoke?.cases ?? []), ...(remaining?.cases ?? [])];
  if (cases.length !== 8) errors.push('candidate_case_count_invalid');
  if (new Set(cases.map((item) => item.id)).size !== cases.length) errors.push('candidate_case_ids_duplicate');
  return errors;
}

function round(value) { return Math.round(value * 1000) / 1000; }

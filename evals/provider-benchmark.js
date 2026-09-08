import { createDiagnosticService } from '../src/diagnostic-service.js';

export const DEFAULT_PROMOTION_THRESHOLDS = Object.freeze({
  maximum_unsafe_diagnosis_rate: 0.1,
  baseline_exact_classification_accuracy: 0.125,
  baseline_abstention_rate: 0.875,
  maximum_p95_latency_ms: 5000
});

export async function runProviderBenchmark(provider, cases, options = {}) {
  const service = createDiagnosticService(provider);
  const rows = [];
  let reservedOrSpent = 0;
  for (const sample of cases) {
    const reservation = typeof provider.estimateMaximumCostUsd === 'function' ? provider.estimateMaximumCostUsd(sample) : 0;
    if (reservedOrSpent + reservation > (options.maximumTotalCostUsd ?? 0)) {
      throw Object.assign(new Error(`Budget guard stopped before ${sample.id}: worst-case total would exceed configured cap.`), { code: 'provider_budget_guard' });
    }
    const started = performance.now();
    const result = await service.diagnose(sample);
    const measuredLatency = Math.round((performance.now() - started) * 100) / 100;
    rows.push({
      sample, result,
      latency_ms: Number.isFinite(result.benchmark_recorded_latency_ms) && result.benchmark_recorded_latency_ms >= 0
        ? result.benchmark_recorded_latency_ms : measuredLatency
    });
    reservedOrSpent += finiteCost(result.model_cost_usd);
    if (reservedOrSpent > (options.maximumTotalCostUsd ?? 0)) {
      throw Object.assign(new Error(`Budget guard stopped after ${sample.id}: observed cost exceeded configured cap.`), { code: 'provider_budget_guard' });
    }
  }
  const metrics = summarizeProviderRows(rows);
  return {
    generated_at: new Date().toISOString(),
    provider: {
      id: provider.id, prompt_version: provider.promptVersion,
      prompt_hash: provider.promptHash ?? null, model_version: provider.modelVersion
    },
    dataset: {
      total: cases.length,
      origin: 'synthetic_adversarial_project_authored',
      limitation: 'Provider integration and boundary benchmark only. Project-authored labels are not Teacher Gold.'
    },
    metrics,
    budget: {
      maximum_total_cost_usd: options.maximumTotalCostUsd ?? 0,
      observed_total_cost_usd: metrics.total_cost_usd,
      maximum_p95_latency_ms: options.maximumP95LatencyMs ?? DEFAULT_PROMOTION_THRESHOLDS.maximum_p95_latency_ms,
      observed_p95_latency_ms: metrics.p95_latency_ms
    },
    promotion_gate: promotionDecision(metrics, {
      ...DEFAULT_PROMOTION_THRESHOLDS,
      maximum_total_cost_usd: options.maximumTotalCostUsd ?? 0,
      maximum_p95_latency_ms: options.maximumP95LatencyMs ?? DEFAULT_PROMOTION_THRESHOLDS.maximum_p95_latency_ms,
      candidate_role: options.candidateRole ?? 'reference'
    }),
    cases: rows.map(({ sample, result, latency_ms: latency }) => ({
      id: sample.id,
      expected: sample.gold_primary_error,
      predicted: result.primary_error,
      status: result.status,
      confidence: result.confidence,
      latency_ms: latency,
      cost_usd: finiteCost(result.model_cost_usd),
      guard_reason_code: result.guard_reason_code ?? null,
      provider_failure_code: result.provider_failure_code ?? null,
      output_validation_errors: result.output_validation_errors ?? [],
      output_validation_snapshot: result.output_validation_snapshot ?? null
    }))
  };
}

export function summarizeProviderRows(rows) {
  const exact = rows.filter(({ sample, result }) => result.primary_error === sample.gold_primary_error).length;
  const unsafe = rows.filter(({ sample, result }) => result.status === 'diagnosed' && result.primary_error !== sample.gold_primary_error).length;
  const abstained = rows.filter(({ result }) => result.status === 'abstained').length;
  const guardFailures = rows.filter(({ result }) => result.guard_reason_code === 'provider_output_validation_failed').length;
  const latencies = rows.map((row) => row.latency_ms).sort((a, b) => a - b);
  const totalCost = rows.reduce((sum, { result }) => sum + finiteCost(result.model_cost_usd), 0);
  return {
    exact_classification_accuracy: ratio(exact, rows.length),
    unsafe_diagnosis_rate: ratio(unsafe, rows.length),
    abstention_rate: ratio(abstained, rows.length),
    output_guard_failure_rate: ratio(guardFailures, rows.length),
    average_latency_ms: round(rows.length ? latencies.reduce((sum, value) => sum + value, 0) / rows.length : 0),
    p95_latency_ms: round(percentile(latencies, 0.95)),
    total_cost_usd: roundMoney(totalCost),
    average_cost_usd: roundMoney(rows.length ? totalCost / rows.length : 0)
  };
}

export function promotionDecision(metrics, options) {
  const reference = options.candidate_role === 'reference';
  const checks = {
    safety: metrics.unsafe_diagnosis_rate <= options.maximum_unsafe_diagnosis_rate,
    quality_improvement: metrics.exact_classification_accuracy > options.baseline_exact_classification_accuracy,
    coverage_improvement: metrics.abstention_rate < options.baseline_abstention_rate,
    output_contract: metrics.output_guard_failure_rate === 0,
    latency: metrics.p95_latency_ms <= options.maximum_p95_latency_ms,
    budget: metrics.total_cost_usd <= options.maximum_total_cost_usd
  };
  return {
    role: reference ? 'reference_baseline' : 'candidate',
    eligible_for_promotion: reference ? false : Object.values(checks).every(Boolean),
    checks,
    reason: reference
      ? 'Reference baseline cannot promote itself.'
      : Object.values(checks).every(Boolean) ? 'Candidate passes all non-regression gates.' : 'Candidate fails one or more non-regression gates.'
  };
}

function ratio(value, total) { return round(total ? value / total : 0); }
function round(value) { return Math.round(value * 1000) / 1000; }
function roundMoney(value) { return Math.round(value * 1e8) / 1e8; }
function finiteCost(value) { return Number.isFinite(value) && value >= 0 ? value : 0; }
function percentile(values, quantile) {
  if (!values.length) return 0;
  return values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
}

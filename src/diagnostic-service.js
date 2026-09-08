import { validateInput, validateQuestion, validateStandardEvidence, validateUserEvidence } from './validators.js';
import { normalizeProviderOutput } from './provider-output.js';

export function createDiagnosticService(provider, options = {}) {
  if (!provider || typeof provider.diagnose !== 'function') {
    throw new TypeError('A diagnostic provider with diagnose(input) is required');
  }
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15000;

  return {
    async diagnose(input) {
      const answerResult = compareAnswers(input?.user_answer, input?.correct_answer);
      const inputCheck = validateInput(input);
      if (!inputCheck.valid) return guardedResult('insufficient_information', `缺少字段：${inputCheck.missing_fields.join(', ')}`, 'abstained', answerResult);

      const evidenceCheck = validateStandardEvidence(input);
      if (!evidenceCheck.valid) return guardedResult('data_error', evidenceCheck.reason, 'evidence_validation_failed', answerResult);

      const userEvidenceCheck = validateUserEvidence(input);
      if (!userEvidenceCheck.valid) {
        const status = userEvidenceCheck.status === 'evidence_validation_failed' ? 'evidence_validation_failed' : 'abstained';
        return guardedResult('insufficient_information', userEvidenceCheck.reason, status, answerResult);
      }

      const questionCheck = validateQuestion(input);
      if (!questionCheck.valid) return guardedResult('ambiguous_question', questionCheck.reason, 'abstained', 'unknown');

      let result;
      try {
        result = await callProviderWithTimeout(provider, input, timeoutMs);
      } catch (error) {
        const failureCode = safeProviderFailureCode(error?.code);
        return providerGuardedResult(provider, answerResult, [failureCode], error, failureCode);
      }
      const normalized = normalizeProviderOutput(result, input, answerResult);
      if (!normalized.valid) return providerGuardedResult(provider, answerResult, normalized.errors, result);
      return {
        ...normalized.value,
        provider: provider.id,
        prompt_version: provider.promptVersion,
        prompt_hash: provider.promptHash ?? null,
        model_version: provider.modelVersion
      };
    }
  };
}

async function callProviderWithTimeout(provider, input, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => provider.diagnose(input, { signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('provider_timeout'), { code: 'provider_timeout' }));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function providerGuardedResult(provider, answerResult, errors, rawResult = null, providerFailureCode = null) {
  return {
    ...guardedResult('insufficient_information', '模型输出未通过结构化安全校验，建议教师确认', 'abstained', answerResult),
    provider: provider.id,
    prompt_version: provider.promptVersion,
    prompt_hash: provider.promptHash ?? null,
    model_version: provider.modelVersion,
    guard_reason_code: 'provider_output_validation_failed',
    output_validation_errors: errors,
    provider_failure_code: providerFailureCode,
    output_validation_snapshot: safeValidationSnapshot(rawResult),
    model_cost_usd: finiteTelemetry(rawResult?.model_cost_usd),
    benchmark_recorded_latency_ms: finiteTelemetry(rawResult?.benchmark_recorded_latency_ms)
  };
}

const SAFE_PROVIDER_FAILURE_CODES = new Set([
  'provider_timeout', 'provider_http_error', 'provider_empty_output',
  'provider_response_json_invalid', 'provider_output_json_invalid',
  'provider_structured_output_invalid'
]);

function safeProviderFailureCode(value) {
  return SAFE_PROVIDER_FAILURE_CODES.has(value) ? value : 'provider_request_failed';
}

function safeValidationSnapshot(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    status: scalar(value.status),
    primary_error: scalar(value.primary_error),
    confidence: scalar(value.confidence),
    confidence_type: typeof value.confidence
  };
}

function scalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) || value === null ? value : '[non-scalar]';
}

function finiteTelemetry(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function guardedResult(primaryError, reason, status = 'abstained', answerResult = 'unknown') {
  return {
    status,
    primary_error: primaryError,
    answer_result: answerResult,
    secondary_error: null,
    confidence: 0,
    confidence_language: null,
    requires_teacher_review: true,
    reason,
    provider: 'safety-gate',
    prompt_version: null,
    prompt_hash: null,
    model_version: null
  };
}

function compareAnswers(userAnswer, correctAnswer) {
  if (userAnswer === undefined || correctAnswer === undefined) return 'unknown';
  if (String(correctAnswer).trim().toUpperCase() === 'AMBIGUOUS') return 'unknown';
  return String(userAnswer).trim().toUpperCase() === String(correctAnswer).trim().toUpperCase() ? 'correct' : 'incorrect';
}

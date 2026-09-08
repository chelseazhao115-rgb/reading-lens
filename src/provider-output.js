import { PRIMARY_ERRORS, SPECIAL_STATES } from './taxonomy.js';

export const TRACE_STEPS = Object.freeze([
  'evidence_location', 'semantic_mapping', 'sentence_understanding', 'question_rule', 'reasoning_boundary'
]);

const EXPECTED_TRACES = Object.freeze({
  location: trace('fail', 'not_assessed', 'not_assessed', 'not_assessed', 'not_assessed'),
  paraphrase: trace('pass', 'fail', 'not_assessed', 'not_assessed', 'not_assessed'),
  sentence_comprehension: trace('pass', 'pass', 'fail', 'not_assessed', 'not_assessed'),
  question_strategy: trace('pass', 'pass', 'pass', 'fail', 'not_assessed'),
  over_inference: trace('pass', 'pass', 'pass', 'pass', 'fail'),
  correct: trace('pass', 'pass', 'pass', 'pass', 'pass')
});

export function validateProviderOutput(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['output_must_be_object'] };
  if (!['diagnosed', 'correct', 'abstained'].includes(value.status)) errors.push('invalid_status');
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) errors.push('invalid_confidence');

  if (value.status === 'diagnosed') {
    if (!PRIMARY_ERRORS.includes(value.primary_error)) errors.push('invalid_primary_error_for_diagnosis');
    if (value.secondary_error !== null && value.secondary_error !== undefined
      && (!PRIMARY_ERRORS.includes(value.secondary_error) || value.secondary_error === value.primary_error)) {
      errors.push('invalid_secondary_error');
    }
    if (value.confidence < 0.6) errors.push('diagnosis_below_confidence_threshold');
    validateTrace(value.decision_trace, EXPECTED_TRACES[value.primary_error], errors);
    if (value.evidence?.standard_quote_valid !== true) errors.push('provider_evidence_confirmation_missing');
  }

  if (value.status === 'correct') {
    if (value.primary_error !== null) errors.push('correct_result_must_not_have_primary_error');
    validateTrace(value.decision_trace, EXPECTED_TRACES.correct, errors);
    if (value.evidence?.standard_quote_valid !== true) errors.push('provider_evidence_confirmation_missing');
  }

  if (value.status === 'abstained') {
    if (!SPECIAL_STATES.includes(value.primary_error)) errors.push('invalid_abstention_state');
    if (value.confidence >= 0.6) errors.push('abstention_confidence_too_high');
    if (typeof value.reason !== 'string' || !value.reason.trim()) errors.push('abstention_reason_required');
  }
  return { valid: errors.length === 0, errors };
}

export function normalizeProviderOutput(value, input, answerResult) {
  const validation = validateProviderOutput(value);
  if (!validation.valid) return { valid: false, errors: validation.errors };
  const components = confidenceComponents(value, input);
  const confidenceCeiling = calculateConfidenceCeiling(components);
  const confidence = Math.min(value.confidence, confidenceCeiling);
  if (value.status === 'diagnosed' && confidence < 0.6) {
    return { valid: false, errors: ['deterministic_confidence_below_threshold'] };
  }
  return {
    valid: true,
    value: {
      ...value,
      answer_result: answerResult,
      lucky_correct: value.status === 'diagnosed' && answerResult === 'correct',
      confidence,
      confidence_ceiling: confidenceCeiling,
      confidence_components: components,
      confidence_language: value.status === 'diagnosed'
        ? confidence >= 0.8 ? '你的主要错因是' : '最可能的错因是'
        : value.confidence_language ?? null,
      requires_teacher_review: value.status === 'abstained' || confidence < 0.6
    }
  };
}

function validateTrace(actual, expected, errors) {
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)) {
    errors.push('decision_trace_required');
    return;
  }
  const keys = Object.keys(actual);
  if (keys.length !== TRACE_STEPS.length || TRACE_STEPS.some((step) => !keys.includes(step))) errors.push('decision_trace_shape_invalid');
  if (expected && TRACE_STEPS.some((step) => actual[step] !== expected[step])) errors.push('decision_trace_causal_order_invalid');
}

function confidenceComponents(value, input) {
  return {
    evidence_validity: 1,
    reasoning_completeness: String(input.reasoning_process ?? '').trim().length >= 20 ? 1 : 0.5,
    decision_tree_consistency: 1,
    category_uniqueness: value.secondary_error ? 0 : 1,
    historical_consistency: (input.previous_error_history ?? []).includes(value.primary_error) ? 1 : 0
  };
}

function calculateConfidenceCeiling(parts) {
  const value = 0.35 + 0.2 * parts.evidence_validity + 0.1 * parts.reasoning_completeness
    + 0.15 * parts.decision_tree_consistency + 0.05 * parts.category_uniqueness
    + 0.05 * parts.historical_consistency;
  return Math.round(Math.min(value, 0.95) * 100) / 100;
}

function trace(...values) {
  return Object.freeze(Object.fromEntries(TRACE_STEPS.map((step, index) => [step, values[index]])));
}

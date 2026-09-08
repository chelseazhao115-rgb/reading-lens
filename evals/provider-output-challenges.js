export const PROVIDER_OUTPUT_CHALLENGES = Object.freeze([
  { id: 'illegal_label', output: diagnosed({ primary_error: 'careless' }) },
  { id: 'causal_chain_jump', output: diagnosed({
    decision_trace: {
      evidence_location: 'pass', semantic_mapping: 'not_assessed', sentence_understanding: 'fail',
      question_rule: 'not_assessed', reasoning_boundary: 'not_assessed'
    }
  }) },
  { id: 'high_confidence_abstention', output: {
    status: 'abstained', primary_error: 'insufficient_information', confidence: 0.92, reason: 'Cannot decide.'
  } },
  { id: 'missing_evidence_confirmation', output: diagnosed({ evidence: undefined }) },
  { id: 'malformed_output', output: 'sentence_comprehension' }
]);

function diagnosed(overrides = {}) {
  return {
    status: 'diagnosed', primary_error: 'sentence_comprehension', secondary_error: null, confidence: 0.8,
    evidence: { standard_quote_valid: true },
    decision_trace: {
      evidence_location: 'pass', semantic_mapping: 'pass', sentence_understanding: 'fail',
      question_rule: 'not_assessed', reasoning_boundary: 'not_assessed'
    },
    ...overrides
  };
}

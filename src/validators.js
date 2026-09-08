import { quoteExistsInPassage } from './text.js';

const REQUIRED_FIELDS = [
  'passage',
  'question_type',
  'question',
  'correct_answer',
  'user_answer'
];

export function validateInput(input) {
  const missingFields = REQUIRED_FIELDS.filter((field) => {
    const value = input?.[field];
    return value === undefined || value === null || String(value).trim() === '';
  });

  if (missingFields.length) {
    return { valid: false, status: 'insufficient_information', missing_fields: missingFields };
  }
  return { valid: true, status: 'ok', missing_fields: [] };
}

export function validateStandardEvidence(input) {
  const quote = input?.standard_evidence?.quote;
  if (!quote) {
    return { valid: false, status: 'evidence_validation_failed', reason: 'missing_standard_evidence' };
  }
  if (!quoteExistsInPassage(quote, input.passage)) {
    return { valid: false, status: 'evidence_validation_failed', reason: 'quote_not_in_passage' };
  }
  return { valid: true, status: 'ok', reason: null };
}

export function validateUserEvidence(input) {
  const quote = input?.user_evidence?.quote;
  if (!quote || !String(quote).trim()) {
    return { valid: false, status: 'insufficient_information', reason: 'missing_user_evidence' };
  }
  if (!quoteExistsInPassage(quote, input.passage)) {
    return { valid: false, status: 'evidence_validation_failed', reason: 'user_quote_not_in_passage' };
  }
  return { valid: true, status: 'ok', reason: null };
}

export function validateQuestion(input) {
  if (input?.question_status === 'ambiguous' || String(input?.correct_answer).toUpperCase() === 'AMBIGUOUS') {
    return {
      valid: false,
      status: 'ambiguous_question',
      reason: input?.ambiguity_reason ?? '题目存在多个合理解释，不能进行确定性错因诊断'
    };
  }
  return { valid: true, status: 'ok', reason: null };
}

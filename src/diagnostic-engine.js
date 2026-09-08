import { tokenOverlap } from './text.js';
import { validateInput, validateQuestion, validateStandardEvidence, validateUserEvidence } from './validators.js';

const SIGNALS = {
  question_strategy: [
    /(?:absent|not (?:mentioned|listed|reported|stated)|no support|unsupported).{0,50}(?:must be|means|so i (?:selected|chose|marked))\s+false/i,
    /(?:selected|chose|used|marked)\s+false.{0,80}(?:not given|not (?:mentioned|listed|reported|stated)|absent|no support)/i,
    /(?:selected|chose|used|marked)\s+not given.{0,80}(?:whenever|instead of checking|wording (?:was|is) not exactly|not exactly identical)/i,
    /false means.{0,60}(?:does not state|not stated|not mentioned|no information|no support)/i,
    /the rule i used.{0,80}(?:false whenever|whenever.{0,40}false)/i,
    /(?:false|not given).{0,30}(?:are interchangeable|mean the same)/i,
    /the rule.{0,60}(?:absent.*false|not mentioned.*false)/i,
    /heading.*detail/i
  ],
  over_inference: [
    /i know/i,
    /usually/i,
    /must mean/i,
    /probably/i,
    /common sense/i,
    /in real life/i
  ],
  paraphrase: [
    /same word/i,
    /exact word/i,
    /different word/i,
    /not mentioned because/i,
    /could not find the word/i
  ],
  sentence_comprehension: [
    /thought .* meant/i,
    /did not notice.*not/i,
    /refer(s|red)? to/i,
    /because of the grammar/i,
    /contrast/i,
    /comparison/i
  ]
};

function evidenceScore(input) {
  const userEvidence = input.user_evidence?.quote ?? '';
  const standardEvidence = input.standard_evidence?.quote ?? '';
  return tokenOverlap(userEvidence, standardEvidence);
}

function matchingCategories(reasoning = '') {
  return Object.entries(SIGNALS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(reasoning)))
    .map(([category]) => category);
}

function calculateConfidence({ evidenceValid, reasoningComplete, uniqueCategory, historicalMatch }) {
  const raw = 0.35
    + (evidenceValid ? 0.2 : 0)
    + (reasoningComplete ? 0.15 : 0)
    + (uniqueCategory ? 0.2 : 0)
    + (historicalMatch ? 0.1 : 0);
  return Math.round(Math.min(raw, 0.95) * 100) / 100;
}

export function diagnose(input) {
  const answerResult = compareAnswers(input?.user_answer, input?.correct_answer);
  const inputCheck = validateInput(input);
  if (!inputCheck.valid) {
    return abstain('insufficient_information', 0, `缺少字段：${inputCheck.missing_fields.join(', ')}`, answerResult);
  }

  const evidenceCheck = validateStandardEvidence(input);
  if (!evidenceCheck.valid) {
    return abstain('data_error', 0, evidenceCheck.reason, answerResult);
  }

  const userEvidenceCheck = validateUserEvidence(input);
  if (!userEvidenceCheck.valid && userEvidenceCheck.status === 'evidence_validation_failed') {
    return abstain('insufficient_information', 0, userEvidenceCheck.reason, answerResult, 'evidence_validation_failed');
  }

  const questionCheck = validateQuestion(input);
  if (!questionCheck.valid) {
    return abstain('ambiguous_question', 0, questionCheck.reason, 'unknown');
  }

  const userEvidence = input.user_evidence?.quote?.trim() ?? '';
  const reasoning = input.reasoning_process?.trim() ?? '';
  if (!userEvidence || !reasoning) {
    const missing = [!userEvidence && 'user_evidence', !reasoning && 'reasoning_process'].filter(Boolean);
    return abstain('insufficient_information', 0.25, `诊断信息不足：${missing.join(', ')}`, answerResult);
  }

  const overlap = evidenceScore(input);
  const evidenceLocated = overlap >= 0.5;
  const categories = matchingCategories(reasoning);
  let primaryError;

  // Fixed causal chain: evidence location is evaluated before semantic/reasoning categories.
  if (answerResult === 'correct' && evidenceLocated && categories.length === 0) {
    return {
      status: 'correct',
      answer_result: 'correct',
      primary_error: null,
      secondary_error: null,
      confidence: 0.9,
      confidence_language: '答案与证据均成立',
      requires_teacher_review: false,
      evidence: {
        standard_quote_valid: true,
        user_standard_token_overlap: Math.round(overlap * 100) / 100,
        user_evidence_located: true
      },
      decision_trace: {
        evidence_location: 'pass', semantic_mapping: 'pass', sentence_understanding: 'pass',
        question_rule: 'pass', reasoning_boundary: 'pass'
      }
    };
  }

  // When none of the observable rule signals fire, the baseline cannot safely
  // distinguish the four semantic stages. Do not turn that unknown into a
  // sentence-comprehension diagnosis by default.
  if (evidenceLocated && categories.length === 0) {
    return abstain(
      'insufficient_information',
      0.55,
      '当前规则基线无法从这段判断过程区分同义替换、句子理解、题型策略或推理越界，建议教师确认',
      answerResult
    );
  }

  if (!evidenceLocated) primaryError = 'location';
  else if (categories.includes('paraphrase')) primaryError = 'paraphrase';
  else if (categories.includes('sentence_comprehension')) primaryError = 'sentence_comprehension';
  else if (categories.includes('question_strategy')) primaryError = 'question_strategy';
  else if (categories.includes('over_inference')) primaryError = 'over_inference';
  else primaryError = 'sentence_comprehension';

  const historicalMatch = (input.previous_error_history ?? []).includes(primaryError);
  const confidence = calculateConfidence({
    evidenceValid: evidenceLocated,
    reasoningComplete: reasoning.length >= 20,
    uniqueCategory: categories.length === 1 || primaryError === 'location',
    historicalMatch
  });

  if (confidence < 0.6) {
    return abstain(primaryError, confidence, '当前证据无法支持稳定的确定性诊断', answerResult);
  }

  return {
    status: 'diagnosed',
    answer_result: answerResult,
    lucky_correct: answerResult === 'correct',
    primary_error: primaryError,
    secondary_error: categories.find((category) => category !== primaryError) ?? null,
    confidence,
    confidence_language: confidence >= 0.8 ? '你的主要错因是' : '最可能的错因是',
    requires_teacher_review: confidence < 0.6,
    evidence: {
      standard_quote_valid: true,
      user_standard_token_overlap: Math.round(overlap * 100) / 100,
      user_evidence_located: evidenceLocated
    },
    decision_trace: {
      evidence_location: evidenceLocated ? 'pass' : 'fail',
      semantic_mapping: traceState(primaryError, 'paraphrase'),
      sentence_understanding: traceState(primaryError, 'sentence_comprehension'),
      question_rule: traceState(primaryError, 'question_strategy'),
      reasoning_boundary: traceState(primaryError, 'over_inference')
    }
  };
}

function traceState(primaryError, stepError) {
  const order = ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference'];
  const primaryIndex = order.indexOf(primaryError);
  const stepIndex = order.indexOf(stepError);
  if (primaryIndex === stepIndex) return 'fail';
  return primaryIndex > stepIndex ? 'pass' : 'not_assessed';
}

function abstain(candidate, confidence, reason, answerResult = 'unknown', statusOverride = null) {
  return {
    status: statusOverride ?? (candidate === 'data_error' ? 'evidence_validation_failed' : 'abstained'),
    primary_error: candidate,
    answer_result: answerResult,
    secondary_error: null,
    confidence,
    confidence_language: null,
    requires_teacher_review: true,
    reason
  };
}

function compareAnswers(userAnswer, correctAnswer) {
  if (userAnswer === undefined || correctAnswer === undefined) return 'unknown';
  if (String(correctAnswer).trim().toUpperCase() === 'AMBIGUOUS') return 'unknown';
  return String(userAnswer).trim().toUpperCase() === String(correctAnswer).trim().toUpperCase() ? 'correct' : 'incorrect';
}

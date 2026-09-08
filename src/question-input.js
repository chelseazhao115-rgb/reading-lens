import { findDemoQuestion } from './demo-questions.js';

export function canonicalizeDemoDiagnosticInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, error: 'input_must_be_object' };
  const question = findDemoQuestion(input.question_id);
  if (!question) return { valid: false, error: 'unknown_question_id' };
  return {
    valid: true,
    question,
    input: {
      id: question.id,
      question_id: question.id,
      passage: question.passage,
      question_type: question.question_type,
      question: question.question,
      correct_answer: question.correct_answer,
      standard_evidence: structuredClone(question.standard_evidence),
      user_answer: input.user_answer,
      user_evidence: { quote: typeof input.user_evidence?.quote === 'string' ? input.user_evidence.quote : '' },
      reasoning_process: typeof input.reasoning_process === 'string' ? input.reasoning_process : '',
      previous_error_history: Array.isArray(input.previous_error_history)
        ? input.previous_error_history.filter((item) => typeof item === 'string').slice(-20) : []
    }
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../src/diagnostic-engine.js';

const base = {
  passage: 'The museum waived admission charges on Fridays, allowing visitors to enter without payment. The gift shop closes at five.',
  question_type: 'TRUE_FALSE_NOT_GIVEN',
  question: 'The museum was free on Fridays.',
  correct_answer: 'TRUE',
  user_answer: 'NOT GIVEN',
  standard_evidence: { quote: 'The museum waived admission charges on Fridays, allowing visitors to enter without payment.' },
  user_evidence: { quote: 'The museum waived admission charges on Fridays, allowing visitors to enter without payment.' },
  reasoning_process: 'I could not find the exact word free, so I selected not given.'
};

test('follows the causal chain and identifies paraphrase after evidence passes', () => {
  const result = diagnose(base);
  assert.equal(result.primary_error, 'paraphrase');
  assert.equal(result.decision_trace.evidence_location, 'pass');
  assert.equal(result.decision_trace.semantic_mapping, 'fail');
  assert.equal(result.decision_trace.sentence_understanding, 'not_assessed');
});

test('location failure takes priority over semantic keyword signals', () => {
  const result = diagnose({
    ...base,
    user_evidence: { quote: 'The gift shop closes at five.' }
  });
  assert.equal(result.primary_error, 'location');
});

test('abstains when user evidence and reasoning are missing', () => {
  const result = diagnose({ ...base, user_evidence: { quote: '' }, reasoning_process: '' });
  assert.equal(result.status, 'abstained');
  assert.equal(result.primary_error, 'insufficient_information');
  assert.equal(result.requires_teacher_review, true);
});

test('stops diagnosis when standard quote is not in passage', () => {
  const result = diagnose({ ...base, standard_evidence: { quote: 'Invented evidence.' } });
  assert.equal(result.status, 'evidence_validation_failed');
  assert.equal(result.primary_error, 'data_error');
});

test('stops diagnosis when learner quote is not in the passage', () => {
  const result = diagnose({ ...base, user_evidence: { quote: 'Invented learner evidence.' } });
  assert.equal(result.status, 'evidence_validation_failed');
  assert.equal(result.primary_error, 'insufficient_information');
  assert.equal(result.reason, 'user_quote_not_in_passage');
});

test('returns a correct state when answer, evidence and reasoning are sound', () => {
  const result = diagnose({
    ...base,
    user_answer: 'TRUE',
    reasoning_process: 'The phrase without payment directly means visitors did not have to pay.'
  });
  assert.equal(result.status, 'correct');
  assert.equal(result.answer_result, 'correct');
  assert.equal(result.primary_error, null);
});

test('P004 question 4 stays correct when sound reasoning explicitly says NOT GIVEN', () => {
  const result = diagnose({
    passage: 'The article describes the northern forest, where researchers counted 46 tree species. It contains no information about the number of species in the southern forest.',
    question_type: 'TRUE_FALSE_NOT_GIVEN', question: 'The southern forest contains fewer tree species.',
    correct_answer: 'NOT GIVEN', user_answer: 'NOT GIVEN',
    standard_evidence: { quote: 'It contains no information about the number of species in the southern forest.' },
    user_evidence: { quote: 'It contains no information about the number of species in the southern forest.' },
    reasoning_process: '原文没有说明南部森林的物种数量，因此答案是 NOT GIVEN。'
  });
  assert.equal(result.status, 'correct');
  assert.equal(result.primary_error, null);
  assert.equal(result.lucky_correct, undefined);
});

test('P004 question 5 stays correct when NOT GIVEN is used as a valid conclusion', () => {
  const result = diagnose({
    passage: 'The university installed more water fountains across the campus in June. A later report recorded where the fountains were placed but did not measure how much water students drank.',
    question_type: 'TRUE_FALSE_NOT_GIVEN', question: 'Students drank more water after June.',
    correct_answer: 'NOT GIVEN', user_answer: 'NOT GIVEN',
    standard_evidence: { quote: 'A later report recorded where the fountains were placed but did not measure how much water students drank.' },
    user_evidence: { quote: 'did not measure how much water students drank.' },
    reasoning_process: 'The report did not measure whether consumption increased, so the answer is NOT GIVEN.'
  });
  assert.equal(result.status, 'correct');
  assert.equal(result.primary_error, null);
});

test('explicitly treating absent information as FALSE still diagnoses question strategy', () => {
  const result = diagnose({
    ...base,
    passage: 'The report gives no information about staff income.',
    question: 'Most staff had high incomes.', correct_answer: 'NOT GIVEN', user_answer: 'FALSE',
    standard_evidence: { quote: 'The report gives no information about staff income.' },
    user_evidence: { quote: 'The report gives no information about staff income.' },
    reasoning_process: 'The income information was not mentioned, so I selected FALSE.'
  });
  assert.equal(result.status, 'diagnosed');
  assert.equal(result.primary_error, 'question_strategy');
});

test('diagnoses lucky correct answer when evidence is in the wrong location', () => {
  const result = diagnose({
    ...base,
    user_answer: 'TRUE',
    user_evidence: { quote: 'The gift shop closes at five.' },
    reasoning_process: 'I selected this unrelated sentence because it looked familiar.'
  });
  assert.equal(result.status, 'diagnosed');
  assert.equal(result.answer_result, 'correct');
  assert.equal(result.lucky_correct, true);
  assert.equal(result.primary_error, 'location');
});

test('marks an incorrect answer before diagnosing its cause', () => {
  const result = diagnose(base);
  assert.equal(result.answer_result, 'incorrect');
});

test('abstains instead of defaulting natural reasoning to sentence comprehension', () => {
  const result = diagnose({
    ...base,
    reasoning_process: 'Complimentary sounded like an additional service rather than information about the ticket price.'
  });
  assert.equal(result.status, 'abstained');
  assert.equal(result.primary_error, 'insufficient_information');
  assert.equal(result.confidence, 0.55);
  assert.equal(result.requires_teacher_review, true);
});

test('abstains on an ambiguous question before diagnosing the learner', () => {
  const result = diagnose({
    ...base,
    correct_answer: 'AMBIGUOUS',
    question_status: 'ambiguous',
    ambiguity_reason: 'The pronoun has two plausible antecedents.'
  });
  assert.equal(result.status, 'abstained');
  assert.equal(result.primary_error, 'ambiguous_question');
  assert.equal(result.requires_teacher_review, true);
  assert.equal(result.confidence, 0);
});

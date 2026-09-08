import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_QUESTIONS, findDemoQuestion, publicDemoQuestions } from '../src/demo-questions.js';

test('minimal demo set contains five original evidence-valid questions', () => {
  assert.equal(DEMO_QUESTIONS.length, 5);
  assert.equal(new Set(DEMO_QUESTIONS.map((item) => item.id)).size, 5);
  for (const item of DEMO_QUESTIONS) {
    assert.equal(item.data_origin, 'original_project_content');
    assert.equal(item.question_type, 'TRUE_FALSE_NOT_GIVEN');
    assert.equal(item.passage.includes(item.standard_evidence.quote), true, item.id);
    assert.equal(['TRUE', 'FALSE', 'NOT GIVEN'].includes(item.correct_answer), true, item.id);
    const mapping = item.diagnostic_support.paraphrase_mapping;
    assert.equal(item.question.includes(mapping.question_expression), true, `${item.id}: question mapping must be verbatim`);
    assert.equal(item.passage.includes(mapping.passage_expression), true, `${item.id}: passage mapping must be verbatim`);
    assert.equal(item.diagnostic_support.answer_rule.answer, item.correct_answer);
    assert.equal(typeof item.diagnostic_support.answer_rule.explanation, 'string');
  }
});

test('public question projection excludes answer and standard evidence', () => {
  const publicItems = publicDemoQuestions();
  assert.equal(publicItems.length, 5);
  for (const item of publicItems) {
    assert.equal('correct_answer' in item, false);
    assert.equal('standard_evidence' in item, false);
    assert.equal('diagnostic_support' in item, false);
  }
  assert.equal(findDemoQuestion('unknown'), null);
});

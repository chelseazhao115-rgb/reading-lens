import test from 'node:test';
import assert from 'node:assert/strict';
import { PRIMARY_ERRORS } from '../src/taxonomy.js';
import { feedbackFor } from '../src/feedback.js';

test('every primary error has concise where, why and fix feedback', () => {
  for (const category of PRIMARY_ERRORS) {
    const feedback = feedbackFor(category);
    assert.equal(typeof feedback.where, 'string');
    assert.equal(typeof feedback.why, 'string');
    assert.equal(typeof feedback.fix, 'string');
    assert.ok(feedback.where.length < 120);
    assert.ok(feedback.why.length < 120);
    assert.ok(feedback.fix.length < 120);
  }
});

const support = { paraphrase_mapping: {
    question_expression: 'Cars were banned', passage_expression: 'prohibited private cars from entering',
    explanation: 'Both expressions mean that cars could not enter.'
  }, answer_rule: { answer: 'TRUE', explanation: '原文与题干判断一致。' } };

test('paraphrase feedback names the exact authored correspondence and an immediate action', () => {
  const feedback = feedbackFor('paraphrase', support);
  assert.deepEqual(feedback.specific, {
    question_expression: 'Cars were banned', passage_expression: 'prohibited private cars from entering',
    explanation: 'Both expressions mean that cars could not enter.',
    action: '先把“Cars were banned”改写成自己的话，再回原文核对“prohibited private cars from entering”的对象、方向和程度。'
  });
  assert.equal(feedbackFor('location', { paraphrase_mapping: null }).specific, undefined);
});

test('all five errors turn the same authored evidence into category-specific teaching actions', () => {
  const actions = Object.fromEntries(PRIMARY_ERRORS.map((category) => [category, feedbackFor(category, support).specific.action]));
  assert.match(actions.location, /决定性句子/);
  assert.match(actions.paraphrase, /改写成自己的话/);
  assert.match(actions.sentence_comprehension, /否定、转折、比较和限定词/);
  assert.match(actions.question_strategy, /本题应选TRUE/);
  assert.match(actions.over_inference, /直接支持/);
  assert.equal(new Set(Object.values(actions)).size, PRIMARY_ERRORS.length);
});

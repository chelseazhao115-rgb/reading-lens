import test from 'node:test';
import assert from 'node:assert/strict';
import { funnelFromEvents, productMetricsFromState, sevenDayRepeatUsage } from '../public/learner-store.js';

test('funnel computes explicit behavior counts and safe rates', () => {
  const events = [
    'question_started', 'answer_submitted', 'evidence_submitted', 'diagnosis_completed', 'diagnosis_viewed',
    'micro_exercise_started', 'micro_exercise_completed', 'transfer_completed', 'diagnosis_accepted'
  ].map((event) => ({ event }));
  const funnel = funnelFromEvents(events);
  assert.equal(funnel.transfer_completed, 1);
  assert.equal(funnel.rates.diagnosis_completion, 1);
  assert.equal(funnel.rates.transfer_completion, 1);
  assert.equal(funnel.rates.diagnosis_acceptance, 1);
});

test('funnel returns null rather than invented rate when denominator is zero', () => {
  const funnel = funnelFromEvents([]);
  assert.equal(funnel.rates.diagnosis_completion, null);
  assert.equal(funnel.rates.transfer_completion, null);
  assert.equal(funnel.rates.diagnosis_acceptance, null);
});

test('product metrics calculate transfer accuracy and repeated error occurrences', () => {
  const state = {
    events: [
      { event: 'diagnosis_completed', occurred_at: '2026-08-01T00:00:00Z', properties: { primary_error: 'location' } },
      { event: 'diagnosis_completed', occurred_at: '2026-08-02T00:00:00Z', properties: { primary_error: 'paraphrase' } },
      { event: 'diagnosis_completed', occurred_at: '2026-08-03T00:00:00Z', properties: { primary_error: 'location' } }
    ],
    transfer_results: [{ correct: true }, { correct: false }]
  };
  const metrics = productMetricsFromState(state, new Date('2026-08-03T00:00:00Z'));
  assert.equal(metrics.transfer_accuracy, 0.5);
  assert.equal(metrics.recurring_error_rate, 0.333);
  assert.equal(metrics.seven_day_repeat_usage, null);
});

test('7-day repeat usage remains null before observation and records return after day seven', () => {
  const first = { event: 'question_started', occurred_at: '2026-08-01T00:00:00Z' };
  assert.equal(sevenDayRepeatUsage([first], new Date('2026-08-05T00:00:00Z')), null);
  assert.equal(sevenDayRepeatUsage([first], new Date('2026-08-10T00:00:00Z')), 0);
  assert.equal(sevenDayRepeatUsage([first, { event: 'question_started', occurred_at: '2026-08-08T00:00:00Z' }], new Date('2026-08-10T00:00:00Z')), 1);
});

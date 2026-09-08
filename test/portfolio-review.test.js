import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPortfolioWithdrawal, exportPortfolioReviews, PORTFOLIO_CONCEPTS,
  summarizePortfolioReviews, validatePortfolioReview
} from '../public/portfolio-review-store.js';

function record(id, overrides = {}) {
  return {
    reviewer_id: id, reviewer_role: 'product_interviewer', consent_confirmed: true, first_exposure: true,
    recall_without_case: true, prompting_used: false, reading_time_seconds: 240,
    concepts: Object.fromEntries(PORTFOLIO_CONCEPTS.map((key) => [key, true])),
    observer_notes: '', completed_at: '2026-08-22T00:00:00Z',
    data_source: 'real_portfolio_comprehension_research', ...overrides
  };
}

test('portfolio review requires eligible first-exposure blind recall without prompting', () => {
  assert.equal(validatePortfolioReview(record('R001')).valid, true);
  assert.match(validatePortfolioReview(record('R002', { first_exposure: false })).errors.join(','), /first_exposure_required/);
  assert.match(validatePortfolioReview(record('R003', { recall_without_case: false })).errors.join(','), /blind_recall_required/);
  assert.match(validatePortfolioReview(record('R004', { prompting_used: true })).errors.join(','), /prompting_invalidates_recall/);
});

test('all nine concepts require explicit true or false scoring', () => {
  const concepts = { ...record('R005').concepts };
  delete concepts.model_evaluation;
  assert.match(validatePortfolioReview(record('R005', { concepts })).errors.join(','), /all_concepts_must_be_scored/);
});

test('portfolio metrics remain N/A below five eligible reviewers', () => {
  const summary = summarizePortfolioReviews([record('R010'), record('R011')]);
  assert.equal(summary.claim_ready, false);
  assert.equal(summary.metrics, null);
});

test('five reviewers produce transparent time and recall metrics', () => {
  const oneMissing = { ...record('R020').concepts, learning_validation: false };
  const records = [
    record('R020', { concepts: oneMissing }), record('R021'), record('R022'),
    record('R023', { reading_time_seconds: 320 }), record('R024')
  ];
  const summary = summarizePortfolioReviews(records);
  assert.equal(summary.claim_ready, true);
  assert.equal(summary.metrics.within_three_to_five_minutes_rate, 0.8);
  assert.equal(summary.metrics.all_nine_recall_rate, 0.8);
  assert.equal(summary.metrics.eight_or_more_recall_rate, 1);
  assert.equal(summary.metrics.median_concepts_recalled, 9);
});

test('portfolio export labels evidence and does not imply hiring outcomes', () => {
  const payload = exportPortfolioReviews([record('R030')], []);
  assert.equal(payload.direct_identifiers_prohibited, true);
  assert.equal(payload.summary.metrics, null);
  assert.match(payload.summary.limitation, /comprehension claims remain N\/A/);
});

test('portfolio withdrawal removes only the named record and keeps minimal audit', () => {
  const result = applyPortfolioWithdrawal([record('R040'), record('R041')], 'R040', '评审者要求撤回', '2026-08-23T00:00:00Z');
  assert.equal(result.valid, true);
  assert.deepEqual(result.records.map((item) => item.reviewer_id), ['R041']);
  assert.deepEqual(Object.keys(result.audit_entry).sort(), ['action', 'occurred_at', 'reason', 'reviewer_id']);
});

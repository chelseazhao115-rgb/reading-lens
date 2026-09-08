import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_CANDIDATES } from '../evals/review-candidates.js';
import { toReviewCsv, withBaselinePredictions } from '../evals/review-pack.js';
import { parseReviewCsv } from '../evals/import-review-csv.js';

test('CSV review export and import preserve all 50 candidate records', () => {
  const parsed = parseReviewCsv(toReviewCsv(withBaselinePredictions(REVIEW_CANDIDATES)));
  assert.equal(parsed.length, 50);
  assert.equal(parsed[0].id, REVIEW_CANDIDATES[0].id);
  assert.equal(parsed[0].standard_evidence.quote, REVIEW_CANDIDATES[0].standard_evidence.quote);
  assert.equal(parsed[49].reasoning_process, REVIEW_CANDIDATES[49].reasoning_process);
  assert.equal(typeof parsed[0].predicted_confidence, 'number');
  assert.equal(parsed[0].prediction_model_version, 'deterministic-v2-safe-abstention');
});

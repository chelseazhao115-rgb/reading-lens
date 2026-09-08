import fs from 'node:fs';
import { REVIEW_CANDIDATES } from './review-candidates.js';
import { loadFrozenReviewPack, reviewSummary, toReviewCsv, validateReviewCandidates, withBaselinePredictions } from './review-pack.js';

const packUrl = new URL('./review-pack.json', import.meta.url);
const candidates = fs.existsSync(packUrl) ? loadFrozenReviewPack() : withBaselinePredictions(REVIEW_CANDIDATES);
const validation = validateReviewCandidates(candidates);
if (!validation.valid || validation.count !== 50) {
  console.error(JSON.stringify(validation, null, 2));
  process.exitCode = 1;
} else {
  if (!fs.existsSync(packUrl)) fs.writeFileSync(packUrl, `${JSON.stringify(candidates, null, 2)}\n`);
  fs.writeFileSync(new URL('./review-pack.csv', import.meta.url), toReviewCsv(candidates));
  console.log(JSON.stringify({ validation, review: reviewSummary(candidates) }, null, 2));
}

import fs from 'node:fs';
import { getExerciseReviewItems } from '../src/exercises.js';
import { exerciseReviewSummary, toExerciseReviewCsv, validateExerciseReviews } from './exercise-review.js';

const items = getExerciseReviewItems();
const validation = validateExerciseReviews(items);
if (!validation.valid) {
  console.error(JSON.stringify(validation, null, 2));
  process.exitCode = 1;
} else {
  fs.writeFileSync(new URL('./exercise-review-pack.json', import.meta.url), `${JSON.stringify(items, null, 2)}\n`);
  fs.writeFileSync(new URL('./exercise-review-pack.csv', import.meta.url), toExerciseReviewCsv(items));
  console.log(JSON.stringify({ validation, review: exerciseReviewSummary(items) }, null, 2));
}

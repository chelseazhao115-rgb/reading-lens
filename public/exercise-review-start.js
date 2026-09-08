import { deriveExerciseReviewHandoffState } from './exercise-review-handoff-state.js';

const title = document.querySelector('#exercise-handoff-title');
const status = document.querySelector('#exercise-handoff-status');
const cta = document.querySelector('#exercise-handoff-cta');

try {
  const response = await fetch('/api/exercise-reviews');
  if (!response.ok) throw new Error('exercise_review_progress_unavailable');
  const state = deriveExerciseReviewHandoffState(await response.json());
  title.textContent = state.title;
  status.textContent = state.status;
  cta.textContent = state.ctaLabel;
  cta.href = state.href;
} catch {
  status.textContent = '暂时无法读取服务端进度；进入审核页后仍会自动定位到下一条待审练习。';
}

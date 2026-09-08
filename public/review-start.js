import { deriveReviewHandoffState } from './review-handoff-state.js';

const title = document.querySelector('#review-handoff-title');
const status = document.querySelector('#review-handoff-status');
const cta = document.querySelector('#review-handoff-cta');
const phaseKicker = document.querySelector('#review-phase-kicker');
const phaseTitle = document.querySelector('#review-phase-title');
const phaseBody = document.querySelector('#review-phase-body');
const invitation = document.querySelector('#review-invitation-text');

try {
  const response = await fetch('/api/reviews');
  if (!response.ok) throw new Error('review_progress_unavailable');
  const state = deriveReviewHandoffState(await response.json());
  title.textContent = state.title;
  status.textContent = state.status;
  cta.textContent = state.ctaLabel;
  cta.href = state.href;
  phaseKicker.textContent = state.phaseKicker;
  phaseTitle.textContent = state.phaseTitle;
  phaseBody.textContent = state.phaseBody;
  invitation.textContent = state.invitationText;
} catch {
  status.textContent = '暂时无法读取服务端进度；进入审核页后会自动定位到下一条待审案例。';
}

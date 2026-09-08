import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveReviewHandoffState } from '../public/review-handoff-state.js';

const cases = (approved) => Array.from({ length: 50 }, (_, index) => ({
  review_status: index < approved ? 'approved' : 'pending',
  qualification_attested: index < approved
}));

test('review handoff resumes at case 11 after the pilot passes', () => {
  const state = deriveReviewHandoffState({
    progress: { total: 50, gold_eligible: 10 },
    pilot_checkpoint: { total: 10, reviewed: 10, sample_issues: 0, ready_to_continue: true },
    cases: cases(10)
  });
  assert.equal(state.href, '/review.html?case=11');
  assert.match(state.title, /第11–50条/);
  assert.match(state.status, /10\/50/);
  assert.equal(state.phaseTitle, '本次只完成CASE 11–20');
  assert.match(state.phaseBody, /前10条已经保存，不要重复审核/);
  assert.match(state.invitationText, /CASE 11–20/);
  assert.match(state.invitationText, /共10条/);
});

test('review handoff stops expansion when the pilot has unresolved issues', () => {
  const state = deriveReviewHandoffState({
    progress: { total: 50, gold_eligible: 8 },
    pilot_checkpoint: { total: 10, reviewed: 10, sample_issues: 2, ready_to_continue: false },
    cases: cases(8)
  });
  assert.equal(state.href, '/review.html?case=1');
  assert.match(state.title, /暂不应继续/);
  assert.match(state.status, /2个样本问题/);
  assert.match(state.invitationText, /暂停状态/);
});

test('review handoff reports completion only when all Gold cases qualify', () => {
  const state = deriveReviewHandoffState({
    progress: { total: 50, gold_eligible: 50 },
    pilot_checkpoint: { total: 10, reviewed: 10, ready_to_continue: true },
    cases: cases(50)
  });
  assert.equal(state.href, '/review.html?case=1');
  assert.match(state.title, /Gold已完成/);
  assert.match(state.invitationText, /暂不继续招募/);
});

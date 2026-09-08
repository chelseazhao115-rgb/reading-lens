import { chooseValidationPriority } from './validation-state.js';

const elements = {
  updated: document.querySelector('#validation-updated'), priorityNumber: document.querySelector('#priority-number'),
  priorityTitle: document.querySelector('#priority-title'), priorityDetail: document.querySelector('#priority-detail'),
  priorityAction: document.querySelector('#priority-action'), diagnosisProgress: document.querySelector('#diagnosis-progress'),
  diagnosisRemaining: document.querySelector('#diagnosis-remaining'), exerciseProgress: document.querySelector('#exercise-progress'),
  exerciseRemaining: document.querySelector('#exercise-remaining'), retestProgress: document.querySelector('#retest-progress'),
  retestRemaining: document.querySelector('#retest-remaining')
};

try {
  const responses = await Promise.all([fetch('/api/reviews'), fetch('/api/exercise-reviews'), fetch('/api/usability-summary')]);
  if (!responses.every((response) => response.ok)) throw new Error('progress_unavailable');
  const [reviews, exercises, usability] = await Promise.all(responses.map((response) => response.json()));
  render({ reviews, exercises, usability });
} catch {
  elements.updated.textContent = '无法读取服务端进度。请确认本地服务正在运行后刷新；不要依据本页占位数字开展审核。';
  elements.updated.dataset.state = 'error';
}

function render({ reviews, exercises, usability }) {
  const diagnosisDone = bounded(reviews.progress?.gold_eligible, 0, 50);
  // 收尾进度按“已完成教师审核”计算；通过率与盲判一致率是独立结果，
  // 不应把已经给出“需修订”结论的案例重新显示为待审核。
  const exerciseDone = bounded(exercises.progress?.reviewed_complete, 0, 10);
  const retestDone = bounded(usability.post_fix_retest?.eligible_records, 0, 3);
  setProgress(elements.diagnosisProgress, elements.diagnosisRemaining, diagnosisDone, 50, '条Gold待完成');
  setProgress(elements.exerciseProgress, elements.exerciseRemaining, exerciseDone, 10, '条教师审核待完成');
  setProgress(elements.retestProgress, elements.retestRemaining, retestDone, 3, '名新用户待完成');
  const next = chooseValidationPriority({ diagnosisDone, exerciseDone, retestDone });
  elements.priorityNumber.textContent = next.number; elements.priorityTitle.textContent = next.title;
  elements.priorityDetail.textContent = next.detail; elements.priorityAction.textContent = next.action; elements.priorityAction.href = next.href;
  document.querySelector(`[data-task="${next.task}"]`)?.setAttribute('data-current', 'true');
  elements.updated.textContent = `服务端进度已读取 · ${new Date().toLocaleString('zh-CN')}`;
}

function setProgress(valueElement, remainingElement, done, total, suffix) { valueElement.textContent = `${done} / ${total}`; remainingElement.textContent = done >= total ? '最小样本已达到' : `${total - done}${suffix}`; }
function bounded(value, minimum, maximum) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : minimum; }

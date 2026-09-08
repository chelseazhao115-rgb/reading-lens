import { funnelFromEvents, loadState, productMetricsFromState } from './learner-store.js';
import { loadStudyRecords, summarizeStudyRecords } from './usability-store.js';

const state = loadState();
const funnel = funnelFromEvents(state.events);
const productMetrics = productMetricsFromState(state);
const studySummary = summarizeStudyRecords(loadStudyRecords());
const labels = {
  question_started: '开始题目', answer_submitted: '提交答案', evidence_submitted: '提交证据', diagnosis_completed: '完成诊断',
  diagnosis_viewed: '查看诊断', micro_exercise_started: '开始微练习', micro_exercise_completed: '完成微练习', transfer_completed: '完成迁移题'
};
const rateLabels = {
  diagnosis_completion: '诊断完成率', evidence_submission: '证据提交率', micro_exercise_start: '微练习开始率',
  micro_exercise_completion: '微练习完成率', transfer_completion: '迁移完成率', diagnosis_acceptance: '诊断认可率',
  transfer_accuracy: '迁移题正确率', recurring_error_rate: '复发错因率', seven_day_repeat_usage: '7日复访'
};

const list = document.querySelector('#funnel-list');
Object.entries(labels).forEach(([key, label]) => {
  const item = document.createElement('li');
  item.innerHTML = `<span>${label}</span><strong>${funnel[key]}</strong>`;
  list.append(item);
});
const grid = document.querySelector('#rate-grid');
Object.entries(rateLabels).forEach(([key, label]) => {
  const item = document.createElement('div');
  const value = key in funnel.rates ? funnel.rates[key] : productMetrics[key];
  item.innerHTML = `<strong>${value === null ? 'N/A' : `${Math.round(value * 100)}%`}</strong><span>${label}</span>`;
  grid.append(item);
});

document.querySelector('#real-user-status').textContent = studySummary.claim_ready
  ? `${studySummary.eligible_records}名合格目标用户；已达到探索性可用性汇总门槛。`
  : `${studySummary.eligible_records}名合格目标用户；不足${studySummary.minimum_sample}名，指标保持N/A。`;
const realGrid = document.querySelector('#real-user-metrics');
const realMetrics = studySummary.metrics;
[
  [studySummary.eligible_records, '合格研究记录'],
  [realMetrics ? percent(realMetrics.unassisted_completion_rate) : 'N/A', '无帮助完成率'],
  [realMetrics ? percent(realMetrics.evidence_selection_success_rate) : 'N/A', '证据提交成功率'],
  [realMetrics ? percent(realMetrics.diagnosis_comprehension_rate) : 'N/A', '诊断理解率'],
  [realMetrics ? `${realMetrics.median_completion_time_seconds}s` : 'N/A', '完整任务中位时间'],
  [realMetrics ? `${realMetrics.median_diagnosis_comprehension_time_seconds}s` : 'N/A', '理解诊断中位时间']
].forEach(([value, label]) => {
  const item = document.createElement('div');
  item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
  realGrid.append(item);
});

function percent(value) { return `${Math.round(value * 100)}%`; }

import {
  PORTFOLIO_CONCEPTS, exportPortfolioReviews, loadPortfolioReviews, savePortfolioReview,
  summarizePortfolioReviews, withdrawPortfolioReview
} from './portfolio-review-store.js';

const form = document.querySelector('#portfolio-review-form');
const recallPanel = document.querySelector('#recall-panel');
const timerLedger = document.querySelector('#timer-ledger');
const timerText = document.querySelector('#reading-timer');
const timerStatus = document.querySelector('#timer-status');
const startButton = document.querySelector('#start-reading');
const stopButton = document.querySelector('#stop-reading');
let readingStartedAt = null;
let timerInterval = null;
let pendingWithdrawalId = null;

startButton.addEventListener('click', () => {
  if (!form.elements.reviewer_id.reportValidity() || !form.elements.reviewer_role.reportValidity()
    || !form.elements.first_exposure.reportValidity() || !form.elements.consent_confirmed.reportValidity()) return;
  readingStartedAt = Date.now();
  form.elements.reading_time_seconds.value = '';
  recallPanel.disabled = true;
  timerLedger.dataset.state = 'running';
  timerStatus.textContent = '案例已打开。让评审者独立阅读；不要解释页面或项目。';
  startButton.disabled = true;
  stopButton.disabled = false;
  window.open('/case-study.html?mode=portfolio-comprehension', '_blank', 'noopener');
  renderTimer();
  timerInterval = setInterval(renderTimer, 1000);
});

stopButton.addEventListener('click', () => {
  if (!readingStartedAt) return;
  clearInterval(timerInterval);
  const elapsed = Math.max(1, Math.round((Date.now() - readingStartedAt) / 1000));
  form.elements.reading_time_seconds.value = String(elapsed);
  timerLedger.dataset.state = elapsed > 300 ? 'overtime' : 'stopped';
  timerStatus.textContent = `阅读用时 ${elapsed} 秒。请先关闭案例页，再让评审者自由复述。`;
  stopButton.disabled = true;
  recallPanel.disabled = false;
  recallPanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const record = {
    reviewer_id: data.get('reviewer_id')?.trim(),
    reviewer_role: data.get('reviewer_role'),
    consent_confirmed: data.get('consent_confirmed') === 'on',
    first_exposure: data.get('first_exposure') === 'on',
    recall_without_case: data.get('recall_without_case') === 'on',
    prompting_used: data.get('prompting_used') === 'true',
    reading_time_seconds: Number(data.get('reading_time_seconds')),
    concepts: Object.fromEntries(PORTFOLIO_CONCEPTS.map((key) => [key, data.get(key) === 'true'])),
    observer_notes: data.get('observer_notes')?.trim() ?? '',
    completed_at: new Date().toISOString(),
    data_source: 'real_portfolio_comprehension_research'
  };
  const result = savePortfolioReview(record);
  const message = document.querySelector('#portfolio-review-message');
  if (!result.valid) {
    message.textContent = `无法保存：${result.errors.join('、')}。请确认限时阅读、盲回忆和九项判断均已完成。`;
    return;
  }
  message.textContent = '已保存匿名理解记录。少于5名时不会显示聚合结论。';
  resetProtocol();
  renderSummary();
});

document.querySelector('#export-portfolio-study').addEventListener('click', () => {
  const payload = exportPortfolioReviews();
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `reading-lens-portfolio-comprehension-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector('#portfolio-records').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-withdraw-id]');
  if (!button) return;
  pendingWithdrawalId = button.dataset.withdrawId;
  document.querySelector('#portfolio-withdraw-id').textContent = pendingWithdrawalId;
  document.querySelector('#portfolio-withdraw-reason').value = '';
  document.querySelector('#portfolio-withdraw').hidden = false;
});

document.querySelector('#cancel-portfolio-withdraw').addEventListener('click', cancelWithdrawal);
document.querySelector('#confirm-portfolio-withdraw').addEventListener('click', () => {
  if (!pendingWithdrawalId) return;
  const result = withdrawPortfolioReview(pendingWithdrawalId, document.querySelector('#portfolio-withdraw-reason').value);
  if (!result.valid) {
    document.querySelector('#portfolio-review-message').textContent = `无法撤回：${result.errors.join('、')}。`;
    return;
  }
  cancelWithdrawal();
  document.querySelector('#portfolio-review-message').textContent = '已撤回指定匿名记录；其他样本未修改。';
  renderSummary();
});

function renderTimer() {
  const elapsed = Math.max(0, Math.floor((Date.now() - readingStartedAt) / 1000));
  const remaining = Math.max(0, 300 - elapsed);
  timerText.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  if (elapsed > 300) timerLedger.dataset.state = 'overtime';
}

function renderSummary() {
  const records = loadPortfolioReviews();
  const summary = summarizePortfolioReviews(records);
  document.querySelector('#portfolio-readiness').textContent = summary.claim_ready ? 'EXPLORATORY READY' : 'NOT READY';
  const metrics = summary.metrics;
  const values = [
    [summary.eligible_records, `合格记录 / 至少${summary.minimum_sample}`],
    [metrics ? percent(metrics.within_three_to_five_minutes_rate) : 'N/A', '3–5分钟窗口'],
    [metrics ? percent(metrics.all_nine_recall_rate) : 'N/A', '九项全部复述'],
    [metrics ? metrics.median_concepts_recalled : 'N/A', '复述概念中位数 / 9']
  ];
  const container = document.querySelector('#portfolio-summary');
  container.replaceChildren(...values.map(([value, label]) => {
    const item = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = value;
    const span = document.createElement('span'); span.textContent = label;
    item.append(strong, span); return item;
  }));
  const list = document.querySelector('#portfolio-records');
  list.replaceChildren(...records.map((record) => {
    const row = document.createElement('div'); row.className = 'portfolio-record';
    const meta = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = record.reviewer_id;
    const detail = document.createElement('span');
    detail.textContent = `${PORTFOLIO_CONCEPTS.filter((key) => record.concepts[key]).length}/9 · ${record.reading_time_seconds}s · ${record.reviewer_role}`;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'danger-button'; button.textContent = '撤回'; button.dataset.withdrawId = record.reviewer_id;
    meta.append(strong, detail); row.append(meta, button); return row;
  }));
  if (!records.length) {
    const empty = document.createElement('p'); empty.className = 'report-note'; empty.textContent = '尚无真实案例理解记录。';
    list.replaceChildren(empty);
  }
}

function resetProtocol() {
  clearInterval(timerInterval);
  readingStartedAt = null;
  form.reset();
  form.elements.reading_time_seconds.value = '';
  recallPanel.disabled = true;
  timerText.textContent = '05:00';
  timerLedger.dataset.state = 'idle';
  timerStatus.textContent = '点击开始后会在新标签打开案例。主持人不要解释项目。';
  startButton.disabled = false;
  stopButton.disabled = true;
}

function cancelWithdrawal() {
  pendingWithdrawalId = null;
  document.querySelector('#portfolio-withdraw').hidden = true;
}

function percent(value) { return `${Math.round(value * 100)}%`; }

renderSummary();

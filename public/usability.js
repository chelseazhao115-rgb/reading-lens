import {
  correctStudyRecord, deriveSessionTelemetry, exportStudyPayload, importStudyPayload, loadStudyAudit, loadStudyRecords,
  saveStudyRecord, summarizeStudyRecords, withdrawStudyRecord
} from './usability-store.js';
import { loadState } from './learner-store.js';

const form = document.querySelector('#study-form');
const timers = createTimers();
let editingParticipantId = null;
let pendingWithdrawalId = null;
let activeTelemetry = null;
const instructionalFields = ['specific_error_understood', 'next_action_understood', 'practice_relevance_understood'];

document.querySelector('#diagnosis-timer').addEventListener('click', () => timers.toggle('diagnosis'));
document.querySelector('#create-research-session').addEventListener('click', createResearchSession);
document.querySelector('#sync-research-session').addEventListener('click', syncResearchSession);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const record = {
    participant_id: data.get('participant_id')?.trim(),
    research_session_id: data.get('research_session_id'),
    telemetry_verified: activeTelemetry?.valid === true,
    telemetry: activeTelemetry,
    consent_confirmed: data.get('consent_confirmed') === 'on',
    reading_band: data.get('reading_band'),
    has_ielts_experience: data.get('has_ielts_experience') === 'true',
    accuracy_plateau: data.get('accuracy_plateau') === 'true',
    unassisted_completion: data.get('unassisted_completion') === 'true',
    evidence_selection_success: data.get('evidence_selection_success') === 'true',
    diagnosis_understood: data.get('diagnosis_understood') === 'true',
    study_round: data.get('study_round'),
    specific_error_understood: booleanOrNull(data.get('specific_error_understood')),
    next_action_understood: booleanOrNull(data.get('next_action_understood')),
    practice_relevance_understood: booleanOrNull(data.get('practice_relevance_understood')),
    completion_time_seconds: Number(data.get('completion_time_seconds')),
    diagnosis_comprehension_time_seconds: Number(data.get('diagnosis_comprehension_time_seconds')),
    blocker_codes: data.getAll('blocker_codes'),
    observer_notes: data.get('observer_notes')?.trim() ?? '',
    completed_at: new Date().toISOString(),
    data_source: 'real_user_research'
  };
  const correctionReason = document.querySelector('#correction-reason').value;
  const result = editingParticipantId
    ? correctStudyRecord(editingParticipantId, record, correctionReason)
    : saveStudyRecord(record);
  const message = document.querySelector('#study-message');
  if (!result.valid) {
    message.textContent = result.errors.includes('duplicate_research_session_id')
      ? '无法保存：这个匿名产品会话已经对应另一名参与者。请为每名参与者创建新的专属会话，不能重复计算同一事件链。'
      : `无法保存：${result.errors.join('、')}。请确认目标用户条件、同意和两个计时器均已完成。`;
    return;
  }
  message.textContent = editingParticipantId
    ? '已保存纠错版本，并写入不含作答内容的审计记录。'
    : '已保存匿名研究记录。该记录不会进入Demo漏斗。';
  resetForm();
  renderSummary();
});

document.querySelector('#cancel-correction').addEventListener('click', resetForm);

document.querySelector('#study-records').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const participantId = button.dataset.participantId;
  if (button.dataset.action === 'correct') beginCorrection(participantId);
  if (button.dataset.action === 'withdraw') beginWithdrawal(participantId);
});

document.querySelector('#cancel-withdraw').addEventListener('click', cancelWithdrawal);
document.querySelector('#confirm-withdraw').addEventListener('click', () => {
  if (!pendingWithdrawalId) return;
  const reason = document.querySelector('#withdraw-reason').value;
  const result = withdrawStudyRecord(pendingWithdrawalId, reason);
  const message = document.querySelector('#record-message');
  if (!result.valid) {
    message.textContent = `无法撤回：${result.errors.join('、')}。`;
    return;
  }
  const withdrawnId = pendingWithdrawalId;
  if (editingParticipantId === withdrawnId) resetForm();
  cancelWithdrawal();
  document.querySelector('#study-message').textContent = `已撤回匿名记录 ${withdrawnId}；审计日志不保留其作答内容。`;
  renderSummary();
});

document.querySelector('#export-study').addEventListener('click', () => {
  const payload = exportStudyPayload();
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `reading-lens-usability-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector('#import-study').addEventListener('change', async (event) => {
  const input = event.currentTarget;
  const message = document.querySelector('#import-study-message');
  const file = input.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const result = importStudyPayload(payload);
    if (!result.valid) {
      message.textContent = `导入失败，现有记录未改变：${result.errors.join('、')}。`;
      return;
    }
    message.textContent = `导入完成：新增${result.imported}条，跳过${result.skipped}条完全相同的记录。`;
    renderSummary();
  } catch {
    message.textContent = '导入失败：文件不是有效的Reading Lens研究JSON，现有记录未改变。';
  } finally {
    input.value = '';
  }
});

function renderSummary() {
  const records = loadStudyRecords();
  const summary = summarizeStudyRecords(records);
  document.querySelector('#study-readiness').textContent = summary.claim_ready ? 'EXPLORATORY READY' : 'NOT READY';
  const metrics = summary.metrics;
  const values = [
    [summary.eligible_records, `合格记录 / 至少${summary.minimum_sample}`],
    [summary.duplicate_session_records, '重复会话记录（已排除）'],
    [metrics ? percent(metrics.unassisted_completion_rate) : 'N/A', '无帮助完成率'],
    [metrics ? percent(metrics.evidence_selection_success_rate) : 'N/A', '证据提交成功率'],
    [metrics ? percent(metrics.diagnosis_comprehension_rate) : 'N/A', '诊断理解率'],
    [metrics ? `${metrics.median_completion_time_seconds}s` : 'N/A', '完整任务中位时间'],
    [metrics ? `${metrics.median_diagnosis_comprehension_time_seconds}s` : 'N/A', '理解诊断中位时间']
  ];
  const teaching = summary.instructional_value_metrics;
  values.push(
    [summary.post_fix_retest_records, '修复后复测样本'],
    [teaching ? percent(teaching.specific_error_understanding_rate) : 'N/A', '能指出具体错点'],
    [teaching ? percent(teaching.next_action_understanding_rate) : 'N/A', '知道下次怎么做'],
    [teaching ? percent(teaching.practice_relevance_understanding_rate) : 'N/A', '理解练习针对性']
  );
  const grid = document.querySelector('#study-summary');
  grid.replaceChildren(...values.map(([value, label]) => {
    const item = document.createElement('div');
    item.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    return item;
  }));
  renderRecords(records);
}

function renderRecords(records) {
  const container = document.querySelector('#study-records');
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'report-note';
    empty.textContent = '尚无真实研究记录。';
    container.replaceChildren(empty);
  } else {
    container.replaceChildren(...records.map((record) => {
      const row = document.createElement('div');
      row.className = 'record-row';
      const description = document.createElement('div');
      const id = document.createElement('strong');
      const meta = document.createElement('span');
      id.textContent = record.participant_id;
      meta.textContent = `版本 ${record.revision ?? 1} · ${new Date(record.completed_at).toLocaleString('zh-CN')}`;
      description.append(id, document.createElement('br'), meta);
      row.append(description, actionButton('纠错', 'correct', record.participant_id, 'secondary-button'), actionButton('撤回', 'withdraw', record.participant_id, 'danger-button'));
      return row;
    }));
  }
  document.querySelector('#audit-count').textContent = `审计动作 ${loadStudyAudit().length} 条；导出JSON时一并保存。`;
}

function actionButton(label, action, participantId, className) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = label;
  button.dataset.action = action; button.dataset.participantId = participantId;
  button.setAttribute('aria-label', `${label}记录 ${participantId}`);
  return button;
}

function beginCorrection(participantId) {
  const record = loadStudyRecords().find((item) => item.participant_id === participantId);
  if (!record) return;
  editingParticipantId = participantId;
  document.querySelector('#correction-banner').hidden = false;
  document.querySelector('#correction-id').textContent = participantId;
  document.querySelector('#correction-reason').value = '';
  form.elements.participant_id.value = record.participant_id;
  form.elements.participant_id.readOnly = true;
  form.elements.research_session_id.value = record.research_session_id;
  activeTelemetry = record.telemetry;
  showSessionControls(record.research_session_id);
  renderTelemetry(record.telemetry);
  for (const field of ['reading_band']) form.elements[field].value = record[field];
  for (const field of ['has_ielts_experience', 'accuracy_plateau', 'unassisted_completion', 'diagnosis_understood']) {
    form.elements[field].value = String(record[field]);
  }
  for (const field of instructionalFields) {
    form.elements[field].value = record[field] == null ? '' : String(record[field]);
    form.elements[field].required = (record.study_round ?? 'baseline') === 'post_fix_retest';
  }
  form.elements.study_round.value = record.study_round ?? 'baseline';
  form.elements.evidence_selection_success.value = String(record.evidence_selection_success);
  form.elements.evidence_selection_success_display.value = record.evidence_selection_success ? '是（产品事件）' : '否（产品事件）';
  form.elements.consent_confirmed.checked = record.consent_confirmed;
  form.elements.observer_notes.value = record.observer_notes ?? '';
  document.querySelectorAll('input[name="blocker_codes"]').forEach((input) => { input.checked = record.blocker_codes.includes(input.value); });
  timers.load(record.completion_time_seconds, record.diagnosis_comprehension_time_seconds);
  document.querySelector('#study-form button[type="submit"]').textContent = '保存纠错版本';
  form.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function beginWithdrawal(participantId) {
  pendingWithdrawalId = participantId;
  document.querySelector('#withdraw-panel').hidden = false;
  document.querySelector('#withdraw-id').textContent = participantId;
  document.querySelector('#withdraw-reason').value = '';
  document.querySelector('#record-message').textContent = '';
  document.querySelector('#withdraw-reason').focus();
}

function cancelWithdrawal() {
  pendingWithdrawalId = null;
  document.querySelector('#withdraw-panel').hidden = true;
  document.querySelector('#withdraw-reason').value = '';
  document.querySelector('#record-message').textContent = '';
}

function resetForm() {
  editingParticipantId = null;
  form.reset();
  form.elements.study_round.value = 'post_fix_retest';
  for (const field of instructionalFields) form.elements[field].required = true;
  form.elements.participant_id.readOnly = false;
  activeTelemetry = null;
  timers.reset();
  document.querySelector('#open-research-session').hidden = true;
  document.querySelector('#sync-research-session').hidden = true;
  document.querySelector('#research-session-status').textContent = '尚未创建会话。';
  form.elements.evidence_selection_success_display.value = '等待事件同步';
  document.querySelector('#correction-banner').hidden = true;
  document.querySelector('#correction-reason').value = '';
  document.querySelector('#study-form button[type="submit"]').textContent = '保存匿名研究记录';
}

function createResearchSession() {
  const participantId = form.elements.participant_id.value.trim();
  const consent = form.elements.consent_confirmed.checked;
  const status = document.querySelector('#research-session-status');
  if (!/^[A-Za-z0-9_-]{2,24}$/.test(participantId)) { status.textContent = '请先填写有效的匿名参与者编号。'; return; }
  if (!consent) { status.textContent = '必须先确认参与者已同意匿名事件记录。'; return; }
  const sessionId = `rs_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
  form.elements.research_session_id.value = sessionId;
  activeTelemetry = null;
  form.elements.completion_time_seconds.value = '';
  form.elements.evidence_selection_success.value = '';
  form.elements.evidence_selection_success_display.value = '等待事件同步';
  document.querySelector('#task-time').textContent = '等待事件同步';
  showSessionControls(sessionId);
  status.textContent = '会话已创建。请让参与者从专属链接进入产品，完成诊断后返回同步。';
}

function showSessionControls(sessionId) {
  const open = document.querySelector('#open-research-session');
  open.href = `/?research_session=${encodeURIComponent(sessionId)}`;
  open.hidden = false;
  document.querySelector('#sync-research-session').hidden = false;
}

function syncResearchSession() {
  const sessionId = form.elements.research_session_id.value;
  const telemetry = deriveSessionTelemetry(loadState(sessionId).events, sessionId);
  activeTelemetry = telemetry.valid ? telemetry : null;
  if (!telemetry.valid) {
    document.querySelector('#research-session-status').textContent = `事件链尚未完成：缺少 ${telemetry.missing_events.join('、')}。`;
    return;
  }
  renderTelemetry(telemetry);
  document.querySelector('#research-session-status').textContent = !telemetry.core_event_chain_complete
    ? `已验证会话开始，但任务中途停止；缺少 ${telemetry.missing_events.join('、')}。请记录阻塞点并将无帮助完成设为否。`
    : telemetry.path_completion_verified
      ? `已验证${telemetry.event_count}条本会话事件，当前学习路径完整。`
      : `核心诊断链已记录，但诊断路径尚未出现迁移题完成事件；请将“无研究者帮助完成”记录为否。`;
}

function renderTelemetry(telemetry) {
  form.elements.completion_time_seconds.value = telemetry.completion_time_seconds;
  form.elements.evidence_selection_success.value = String(telemetry.evidence_selection_success);
  form.elements.evidence_selection_success_display.value = telemetry.evidence_selection_success ? '是（产品事件）' : '否（产品事件）';
  timers.setTask(telemetry.completion_time_seconds);
}

function createTimers() {
  const state = { diagnosis: null };
  const elapsed = { diagnosis: null };
  return {
    toggle(name) {
      const button = document.querySelector(`#${name}-timer`);
      if (state[name] === null) {
        state[name] = performance.now();
        button.textContent = '停止计时';
        button.setAttribute('aria-label', '停止诊断理解计时');
        document.querySelector(`#${name}-time`).textContent = '计时中';
      } else {
        elapsed[name] = Math.max(1, Math.round((performance.now() - state[name]) / 1000));
        state[name] = null;
        form.elements.diagnosis_comprehension_time_seconds.value = elapsed[name];
        button.textContent = '重新计时';
        button.setAttribute('aria-label', '重新开始诊断理解计时');
        document.querySelector(`#${name}-time`).textContent = `${elapsed[name]}秒`;
      }
    },
    reset() {
      for (const name of ['diagnosis']) {
        state[name] = null; elapsed[name] = null;
        document.querySelector(`#${name}-timer`).textContent = '开始计时';
        document.querySelector(`#${name}-timer`).setAttribute('aria-label', '开始诊断理解计时');
        document.querySelector(`#${name}-time`).textContent = '未开始';
      }
      document.querySelector('#task-time').textContent = '等待事件同步';
    },
    load(taskSeconds, diagnosisSeconds) {
      state.diagnosis = null;
      elapsed.diagnosis = Number(diagnosisSeconds);
      form.elements.completion_time_seconds.value = Number(taskSeconds);
      form.elements.diagnosis_comprehension_time_seconds.value = elapsed.diagnosis;
      document.querySelector('#task-time').textContent = `${Number(taskSeconds)}秒`;
      document.querySelector('#diagnosis-time').textContent = `${elapsed.diagnosis}秒`;
      document.querySelector('#diagnosis-timer').textContent = '重新计时';
      document.querySelector('#diagnosis-timer').setAttribute('aria-label', '重新开始诊断理解计时');
    },
    setTask(seconds) {
      form.elements.completion_time_seconds.value = Number(seconds);
      document.querySelector('#task-time').textContent = `${Number(seconds)}秒`;
    }
  };
}

function percent(value) { return `${Math.round(value * 100)}%`; }
function booleanOrNull(value) { return value === 'true' ? true : value === 'false' ? false : null; }
renderSummary();

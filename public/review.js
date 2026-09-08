import { formatReviewSaveConfirmation } from './review-save-confirmation.js';

const reviewerIdInput = document.querySelector('#reviewer-id');
const form = document.querySelector('#review-form');
const message = document.querySelector('#review-message');
const attestation = document.querySelector('#reviewer-attestation');
const reviewSearchParams = new URLSearchParams(location.search);
const authorQaMode = reviewSearchParams.get('track') === 'author_qa';
const requestedCaseNumber = Number(reviewSearchParams.get('case'));
const reviewApi = authorQaMode ? '/api/author-reviews' : '/api/reviews';
const saveApi = authorQaMode ? '/api/author-reviews/save' : '/api/reviews/save';
const reviewerStorageKey = authorQaMode ? 'reading-lens-author-qa-id' : 'reading-lens-independent-reviewer-id';
const reviewerIdPattern = authorQaMode ? /^author-[a-z0-9][a-z0-9-]{2,49}$/i : /^teacher-[a-z0-9][a-z0-9-]{2,49}$/i;
let cases = [];
let currentIndex = 0;
let formDirty = false;

reviewerIdInput.value = localStorage.getItem(reviewerStorageKey) ?? '';
reviewerIdInput.addEventListener('input', () => localStorage.setItem(reviewerStorageKey, reviewerIdInput.value.trim()));
configureTrackCopy();

await loadCases();

document.querySelectorAll('.review-save').forEach((button) => {
  button.addEventListener('click', () => saveReview(button.dataset.status));
});
document.querySelector('#previous-case').addEventListener('click', () => navigate(-1));
document.querySelector('#next-case').addEventListener('click', () => navigate(1));
form.addEventListener('input', markFormDirty);
form.addEventListener('change', markFormDirty);
window.addEventListener('beforeunload', (event) => {
  if (!formDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

async function loadCases() {
  try {
    const response = await fetch(reviewApi);
    const payload = await response.json();
    cases = payload.cases;
    const requestedIndex = Number.isInteger(requestedCaseNumber) && requestedCaseNumber >= 1 && requestedCaseNumber <= cases.length
      ? requestedCaseNumber - 1 : -1;
    const firstNeedsWork = cases.findIndex((item) => authorQaMode
      ? item.review_status !== 'approved'
      : item.review_status === 'pending' || item.qualification_attested !== true);
    currentIndex = requestedIndex >= 0 ? requestedIndex : firstNeedsWork >= 0 ? firstNeedsWork : 0;
    renderProgress(payload.progress);
    renderPilot(payload.pilot_checkpoint);
    renderCase();
  } catch {
    message.textContent = '审核数据暂时无法加载。请确认本地服务正在运行。';
  }
}

function renderCase() {
  const item = cases[currentIndex];
  if (!item) return;
  document.querySelector('#case-position').textContent = `CASE ${currentIndex + 1} / ${cases.length}`;
  document.querySelector('#case-title').textContent = `盲审案例 ${String(currentIndex + 1).padStart(2, '0')}`;
  document.querySelector('#review-passage').textContent = item.passage;
  document.querySelector('#review-question').textContent = item.question;
  document.querySelector('#review-correct-answer').textContent = item.correct_answer;
  document.querySelector('#review-user-answer').textContent = item.user_answer;
  document.querySelector('#review-standard-evidence').textContent = item.standard_evidence?.quote || '缺失';
  document.querySelector('#review-user-evidence').textContent = item.user_evidence?.quote || '未提交';
  document.querySelector('#review-reasoning').textContent = item.reasoning_process || '未提交';
  document.querySelector('#reviewer-label').value = item.reviewer_label ?? '';
  document.querySelector('#reviewer-failed-step').value = item.reviewer_failed_step ?? '';
  document.querySelector('#reviewer-notes').value = item.reviewer_notes ?? '';
  formDirty = false;
  message.textContent = item.provenance_status === 'excluded_legacy_or_untrusted_review_hidden'
    ? '存在已隔离的旧版或来源不合格记录；其标签和说明已隐藏，请独立重新审核。'
    : item.review_status === 'pending' ? '尚未审核' : `当前状态：${item.review_status}`;
  document.querySelector('#previous-case').disabled = currentIndex === 0;
  document.querySelector('#next-case').disabled = currentIndex === cases.length - 1;
}

async function saveReview(status) {
  const reviewerId = reviewerIdInput.value.trim();
  const label = document.querySelector('#reviewer-label').value;
  const failedStep = document.querySelector('#reviewer-failed-step').value;
  if (!reviewerId) {
    message.textContent = '请先填写稳定的审核者编号。';
    reviewerIdInput.focus();
    return;
  }
  if (!reviewerIdPattern.test(reviewerId)) {
    message.textContent = authorQaMode
      ? '作者QA编号必须使用 author- 开头，例如 author-001。'
      : '独立教师编号必须使用 teacher- 开头，例如 teacher-027。';
    reviewerIdInput.focus();
    return;
  }
  if (!attestation.checked) {
    message.textContent = authorQaMode
      ? '作者QA前必须确认雅思阅读教师/教研资质和项目作者身份。'
      : '进入Teacher Gold前必须确认教师资质，并声明未参与案例编写或标签设计。';
    attestation.focus();
    return;
  }
  if (status === 'approved' && !label) {
    message.textContent = '批准案例前必须选择一级标签。';
    document.querySelector('#reviewer-label').focus();
    return;
  }
  if (status === 'approved' && !failedStep) {
    message.textContent = '批准案例前必须选择最先失败的因果步骤。';
    document.querySelector('#reviewer-failed-step').focus();
    return;
  }
  const notes = document.querySelector('#reviewer-notes').value.trim();
  if (notes.length < 8) {
    message.textContent = '所有审核都必须填写至少8个字符的专业判断依据。';
    document.querySelector('#reviewer-notes').focus();
    return;
  }

  setSaving(true);
  try {
    const response = await fetch(saveApi, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blind_id: cases[currentIndex].blind_id,
        expected_revision: cases[currentIndex].review_revision,
        review_status: status,
        reviewer_label: label || null,
        reviewer_failed_step: failedStep || null,
        reviewer_notes: notes,
        reviewer_id: reviewerId,
        reviewer_role: 'ielts_reading_teacher',
        qualification_attested: true,
        independence_attested: !authorQaMode,
        review_track: authorQaMode ? 'author_qa' : 'independent_teacher_gold',
        review_protocol_version: authorQaMode ? 'diagnostic-author-qa-v1' : 'diagnostic-causal-blind-v3'
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.error === 'stale_review_revision') {
        await loadCases();
        throw new Error('该案例已被其他审核会话更新，页面已刷新；请检查最新状态后再操作。');
      }
      throw new Error(payload.error || payload.message);
    }
    cases[currentIndex] = payload.case;
    formDirty = false;
    renderProgress(payload.progress);
    renderPilot(payload.pilot_checkpoint);
    if (status === 'approved') navigateToNextPending();
    else renderCase();
    renderSavedConfirmation(payload.case);
  } catch (error) {
    message.textContent = `保存失败：${error.message}`;
  } finally {
    setSaving(false);
  }
}

function renderSavedConfirmation(savedCase) {
  const caseNumber = cases.findIndex((item) => item.blind_id === savedCase.blind_id) + 1;
  message.textContent = formatReviewSaveConfirmation(savedCase, caseNumber);
}

function configureTrackCopy() {
  reviewerIdInput.placeholder = authorQaMode ? '例如 author-001' : '例如 teacher-027';
  if (!authorQaMode) return;
  document.querySelector('#review-track-kicker').textContent = 'PROJECT AUTHOR QA';
  document.querySelector('#review-track-title').textContent = '先检查样本，再邀请独立教师。';
  document.querySelector('#review-track-intro').textContent = '本轨道用于项目作者发现证据、答案、标签边界和材料质量问题。结果不会进入Teacher Gold，也不会展示给后续独立盲审者。';
  document.querySelector('#progress-approved-label').textContent = '作者QA通过';
  document.querySelector('#reviewer-attestation-copy').textContent = '我确认自己具有雅思阅读教学或正式教研经验，并且是本项目案例或标签设计的参与者；本次结果仅作为作者QA，不进入Teacher Gold。';
}

function navigate(offset) {
  if (formDirty) {
    message.textContent = '当前修改尚未保存。请先点击“批准”“需修订”或“拒绝”保存，再切换案例。';
    return;
  }
  currentIndex = Math.max(0, Math.min(cases.length - 1, currentIndex + offset));
  renderCase();
  document.querySelector('#review-case').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function markFormDirty() {
  formDirty = true;
  message.textContent = '修改尚未保存，请点击下方状态按钮完成保存。';
}

function navigateToNextPending() {
  const needsGoldReview = (item) => authorQaMode
    ? item.review_status !== 'approved'
    : item.review_status === 'pending' || item.qualification_attested !== true;
  const next = cases.findIndex((item, index) => index > currentIndex && needsGoldReview(item));
  const wrapped = cases.findIndex(needsGoldReview);
  currentIndex = next >= 0 ? next : wrapped >= 0 ? wrapped : currentIndex;
  renderCase();
}

function renderProgress(progress) {
  document.querySelector('#progress-reviewed').textContent = `${progress.reviewed} / ${progress.total}`;
  document.querySelector('#progress-approved').textContent = String(
    authorQaMode ? progress.approved : progress.gold_eligible
  );
  document.querySelector('#progress-revision').textContent = String(progress.needs_revision);
}

function renderPilot(pilot) {
  document.querySelector('#pilot-reviewed').textContent = `${pilot.reviewed} / ${pilot.total}`;
  document.querySelector('#pilot-issues').textContent = String(pilot.sample_issues);
  document.querySelector('#pilot-status').textContent = pilot.ready_to_continue ? '来源通过' : pilot.ready_for_sample_audit ? '来源需重审' : '进行中';
}

function setSaving(saving) {
  document.querySelectorAll('.review-save').forEach((button) => { button.disabled = saving; });
}

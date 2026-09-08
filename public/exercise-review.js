const dimensions = [
  ['targets_primary_error', '只训练目标一级错因'],
  ['original_content', '内容原创，未复制原题'],
  ['unique_answer', '只有一个合理答案'],
  ['answer_correct', '标准答案准确'],
  ['difficulty_appropriate', '难度适合阅读5.5–6.5'],
  ['no_answer_leak', '题目与提示未泄露答案']
];
const reviewerId = document.querySelector('#exercise-reviewer-id');
const message = document.querySelector('#exercise-review-message');
const reviewerAttestation = document.querySelector('#exercise-reviewer-attestation');
const exerciseReviewSearchParams = new URLSearchParams(location.search);
const requestedExerciseNumber = Number(exerciseReviewSearchParams.get('case'));
let cases = [];
let currentIndex = 0;
let formDirty = false;

reviewerId.value = localStorage.getItem('reading-lens-exercise-reviewer-id') ?? '';
reviewerId.addEventListener('input', () => localStorage.setItem('reading-lens-exercise-reviewer-id', reviewerId.value.trim()));
renderDimensionFields();
await loadCases();

document.querySelectorAll('.exercise-review-save').forEach((button) => button.addEventListener('click', () => saveReview(button.dataset.status)));
document.querySelector('#exercise-reveal').addEventListener('click', revealGold);
document.querySelector('#previous-exercise-case').addEventListener('click', () => navigate(-1));
document.querySelector('#next-exercise-case').addEventListener('click', () => navigate(1));
document.querySelector('#exercise-blind-form').addEventListener('input', markFormDirty);
document.querySelector('#exercise-blind-form').addEventListener('change', markFormDirty);
document.querySelector('#exercise-review-form').addEventListener('input', markFormDirty);
document.querySelector('#exercise-review-form').addEventListener('change', markFormDirty);
window.addEventListener('beforeunload', (event) => {
  if (!formDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

async function loadCases() {
  try {
    const response = await fetch('/api/exercise-reviews');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'load_failed');
    cases = payload.cases;
    const requestedIndex = Number.isInteger(requestedExerciseNumber) && requestedExerciseNumber >= 1 && requestedExerciseNumber <= cases.length
      ? requestedExerciseNumber - 1 : -1;
    const pending = cases.findIndex((item) => item.review_status === 'pending');
    currentIndex = requestedIndex >= 0 ? requestedIndex : pending >= 0 ? pending : 0;
    renderProgress(payload.progress);
    renderCase();
  } catch {
    message.textContent = '微练习审核数据无法加载，请确认本地服务正在运行。';
  }
}

function renderDimensionFields() {
  const fieldset = document.querySelector('#dimension-fields');
  for (const [key, label] of dimensions) {
    const row = document.createElement('div');
    row.className = 'dimension-row';
    const title = document.createElement('span');
    title.textContent = label;
    const choices = document.createElement('div');
    choices.append(choice(key, 'true', '通过', label), choice(key, 'false', '不通过', label));
    row.append(title, choices);
    fieldset.append(row);
  }
}

function choice(name, value, labelText, dimensionLabel) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'radio'; input.name = name; input.value = value; input.required = true;
  input.setAttribute('aria-label', `${dimensionLabel}：${labelText}`);
  label.append(input, document.createTextNode(labelText));
  return label;
}

function renderCase() {
  const item = cases[currentIndex];
  if (!item) return;
  document.querySelector('#exercise-case-position').textContent = `EXERCISE ${currentIndex + 1} / ${cases.length}`;
  document.querySelector('#exercise-case-title').textContent = `盲审练习 ${String(currentIndex + 1).padStart(2, '0')}`;
  document.querySelector('#exercise-case-stage').textContent = item.stage === 'transfer' ? '无辅助迁移题' : '即时微练习';
  document.querySelector('#exercise-review-passage').textContent = item.passage;
  document.querySelector('#exercise-review-question').textContent = item.question;
  document.querySelector('#exercise-review-answer').textContent = item.answer;
  const options = document.querySelector('#exercise-review-options');
  options.replaceChildren(...item.options.map((option) => { const li = document.createElement('li'); li.textContent = option; return li; }));
  const blindOptions = document.querySelector('#exercise-blind-options');
  blindOptions.replaceChildren(...item.options.map((option, index) => blindChoice(option, index, item.blind_answer)));
  const revealed = Boolean(item.blind_revealed_at);
  document.querySelector('#exercise-blind-form').hidden = revealed;
  document.querySelector('#exercise-review-form').hidden = !revealed;
  document.querySelector('#exercise-gold-meta').hidden = !revealed;
  document.querySelector('#exercise-answer-reveal').hidden = !revealed;
  if (revealed) {
    document.querySelector('#exercise-case-target').textContent = categoryName(item.target_error);
    document.querySelector('#exercise-review-answer').textContent = item.answer;
    const answerMatch = item.blind_answer === item.answer ? '答案一致' : '答案不一致';
    const targetMatch = item.blind_target_error === item.target_error ? '目标错因一致' : '目标错因不一致';
    document.querySelector('#exercise-blind-comparison').textContent = `已锁定：${answerMatch}；${targetMatch}。盲判不可修改。`;
  }
  for (const [key] of dimensions) {
    document.querySelectorAll(`input[name="${key}"]`).forEach((input) => { input.checked = item[key] === (input.value === 'true'); });
  }
  document.querySelector('#exercise-review-notes').value = item.reviewer_notes ?? '';
  formDirty = false;
  message.textContent = item.review_status === 'pending' ? '尚未审核' : `当前状态：${item.review_status}`;
  document.querySelector('#previous-exercise-case').disabled = currentIndex === 0;
  document.querySelector('#next-exercise-case').disabled = currentIndex === cases.length - 1;
}

function blindChoice(option, index, selected) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'radio'; input.name = 'blind_answer'; input.value = option; input.checked = option === selected;
  label.append(input, document.createTextNode(`${index + 1}. ${option}`));
  return label;
}

async function revealGold() {
  const id = reviewerId.value.trim();
  const answer = document.querySelector('input[name="blind_answer"]:checked')?.value;
  const target = document.querySelector('#exercise-blind-target').value;
  if (!id) { message.textContent = '请先填写稳定的审核者编号。'; reviewerId.focus(); return; }
  if (!/^teacher-[a-z0-9][a-z0-9-]{2,49}$/i.test(id)) { message.textContent = '独立教师编号必须使用 teacher- 开头，例如 teacher-027。'; reviewerId.focus(); return; }
  if (!reviewerAttestation.checked) { message.textContent = '请先确认教师资质及未参与练习、答案或标签编写的独立性声明。'; reviewerAttestation.focus(); return; }
  if (!answer || !target) { message.textContent = '必须先独立选择答案和主要训练错因。'; return; }
  document.querySelector('#exercise-reveal').disabled = true;
  try {
    const response = await fetch('/api/exercise-reviews/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blind_id: cases[currentIndex].blind_id, expected_revision: cases[currentIndex].review_revision,
        reviewer_id: id, blind_answer: answer, blind_target_error: target,
        reviewer_role: 'ielts_reading_teacher', qualification_attested: true, independence_attested: true,
        review_track: 'independent_teacher_exercise', review_protocol_version: 'exercise-two-stage-v3'
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.error === 'stale_review_revision') {
        await loadCases();
        throw new Error('该练习已被其他审核会话更新，页面已刷新；请检查最新状态后再操作。');
      }
      throw new Error(payload.error || payload.message);
    }
    cases[currentIndex] = payload.case;
    renderProgress(payload.progress);
    renderCase();
    message.textContent = '盲判已锁定。请对照标准信息完成六维审核。';
  } catch (error) { message.textContent = `揭示失败：${error.message}`; }
  finally { document.querySelector('#exercise-reveal').disabled = false; }
}

async function saveReview(status) {
  const id = reviewerId.value.trim();
  if (!id) { message.textContent = '请先填写稳定的审核者编号。'; reviewerId.focus(); return; }
  const values = {};
  for (const [key] of dimensions) {
    const checked = document.querySelector(`input[name="${key}"]:checked`);
    if (!checked) { message.textContent = '六个维度都必须选择通过或不通过。'; return; }
    values[key] = checked.value === 'true';
  }
  const allPass = Object.values(values).every(Boolean);
  const notes = document.querySelector('#exercise-review-notes').value.trim();
  if (status === 'approved' && !allPass) { message.textContent = '只有六项全部通过才能批准。'; return; }
  if (status !== 'approved' && allPass) { message.textContent = '标记需修订或拒绝时，至少一项必须选择不通过。'; return; }
  if (!allPass && !notes) { message.textContent = '存在不通过项时必须填写具体说明。'; return; }

  setSaving(true);
  try {
    const response = await fetch('/api/exercise-reviews/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blind_id: cases[currentIndex].blind_id, expected_revision: cases[currentIndex].review_revision, review_status: status, reviewer_id: id, reviewer_notes: notes, ...values })
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.error === 'stale_review_revision') {
        await loadCases();
        throw new Error('该练习已被其他审核会话更新，页面已刷新；请检查最新状态后再操作。');
      }
      throw new Error(payload.error || payload.message);
    }
    cases[currentIndex] = payload.case;
    renderProgress(payload.progress);
    if (status === 'approved') navigateToNextPending(); else renderCase();
    message.textContent = '审核已保存。';
  } catch (error) {
    message.textContent = `保存失败：${error.message}`;
  } finally { setSaving(false); }
}

function navigate(offset) {
  if (formDirty) {
    message.textContent = '当前判断尚未保存。第一阶段请先锁定盲判；第二阶段请先保存六维审核，再切换练习。';
    return;
  }
  currentIndex = Math.max(0, Math.min(cases.length - 1, currentIndex + offset));
  renderCase();
  document.querySelector('#exercise-review-case').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function markFormDirty() {
  formDirty = true;
  message.textContent = document.querySelector('#exercise-blind-form').hidden
    ? '六维判断尚未保存，请先选择审核结论。'
    : '盲答或训练错因尚未锁定，请先点击“锁定判断并揭示标准信息”。';
}

function navigateToNextPending() {
  const next = cases.findIndex((item, index) => index > currentIndex && item.review_status === 'pending');
  const wrapped = cases.findIndex((item) => item.review_status === 'pending');
  currentIndex = next >= 0 ? next : wrapped >= 0 ? wrapped : currentIndex;
  renderCase();
}

function renderProgress(progress) {
  document.querySelector('#exercise-progress-reviewed').textContent = `${progress.reviewed_complete} / ${progress.total}`;
  document.querySelector('#exercise-progress-blinded').textContent = `${progress.blinded_complete} / ${progress.total}`;
  document.querySelector('#exercise-progress-approved').textContent = String(progress.gold_eligible);
  document.querySelector('#exercise-progress-revision').textContent = String(progress.needs_revision);
}

function setSaving(saving) {
  document.querySelectorAll('.exercise-review-save').forEach((button) => { button.disabled = saving; });
}

function categoryName(value) {
  return { location: '定位错误', paraphrase: '同义替换错误', sentence_comprehension: '句子理解错误', question_strategy: '题型策略错误', over_inference: '推理越界' }[value] ?? value;
}

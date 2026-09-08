const passage = document.querySelector('#passage');
const evidence = document.querySelector('#evidence');
const evidenceStatus = document.querySelector('#evidence-status');
const captureButton = document.querySelector('#capture-evidence');
const form = document.querySelector('#diagnostic-form');
const submitButton = document.querySelector('#submit-button');
const resultSection = document.querySelector('#result-section');
const exerciseSection = document.querySelector('#exercise-section');
const nextDiagnosticButton = document.querySelector('#new-diagnostic');
const researchSessionId = activateResearchSession();
const portfolioPreview = new URLSearchParams(location.search).get('portfolio_preview') === '1';
const stateStorageId = portfolioPreview ? 'rs_portfolio_preview_v1' : researchSessionId;
const workflowNamespace = portfolioPreview ? 'portfolio-preview-v1' : researchSessionId ?? 'demo';
if (portfolioPreview) {
  clearState(stateStorageId);
  clearWorkflowDraft(localStorage, workflowNamespace);
}
let currentExercise = null;
let learnerState = loadState(stateStorageId);
let currentDiagnosis = null;
let evidenceTimerStartedAt = performance.now();
let exerciseHintsUsed = 0;
let exerciseAttempts = 0;
let pendingNextExercise = null;
let diagnosticLocked = false;
let workflowDraft = loadWorkflowDraft(localStorage, workflowNamespace);
const DEMO_QUESTIONS = await loadDemoQuestions();
let sample = getDemoQuestion(workflowDraft.question_id);
workflowDraft.question_id = sample.id;
renderQuestion(sample);

captureButton.addEventListener('click', () => {
  const selection = window.getSelection();
  const selectedText = selection?.toString().replace(/\s+/g, ' ').trim() ?? '';
  const insidePassage = selection && selection.rangeCount > 0 && passage.contains(selection.getRangeAt(0).commonAncestorContainer);

  if (!selectedText || !insidePassage) {
    evidenceStatus.textContent = '请先在左侧原文中划选一段文字。';
    return;
  }

  evidence.value = selectedText;
  evidenceStatus.textContent = `已选择 ${selectedText.length} 个字符，提交时会再次验证。`;
  saveFormDraft();
});

evidence.addEventListener('input', () => {
  const existsInPassage = sample.passage.replace(/\s+/g, ' ').includes(evidence.value.replace(/\s+/g, ' ').trim());
  evidenceStatus.textContent = !evidence.value.trim()
    ? '尚未选择证据。手动粘贴的文字也会接受原文匹配校验。'
    : existsInPassage
      ? '证据文字可在原文中找到，提交时服务端会再次验证。'
      : '当前文字无法在原文中精确找到，请重新划选或复制。';
  saveFormDraft();
});

form.addEventListener('input', saveFormDraft);
form.addEventListener('change', saveFormDraft);
nextDiagnosticButton.addEventListener('click', startNextDiagnostic);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (diagnosticLocked) return;
  resultSection.hidden = true;

  if (!evidence.value.trim()) {
    evidenceStatus.textContent = '必须先选择证据，系统不会仅根据答案猜测错因。';
    evidence.focus();
    return;
  }

  const data = new FormData(form);
  const payload = {
    question_id: sample.id,
    user_answer: data.get('answer'),
    user_evidence: { quote: evidence.value.trim() },
    reasoning_process: data.get('reasoning')?.trim(),
    previous_error_history: learnerState.recent_errors.map((item) => item.category)
  };
  const attempt = registerDiagnosticAttempt(workflowDraft);
  workflowDraft = attempt.draft;
  if (attempt.first_answer_submission) {
    learnerState = addEvent(learnerState, 'answer_submitted', { question_type: sample.question_type });
  }
  saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
  saveAndRenderState();

  submitButton.disabled = true;
  submitButton.textContent = '正在验证证据';

  try {
    const response = await fetch('/api/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok && result.status !== 'evidence_validation_failed') throw new Error('diagnosis_request_failed');
    if (isTerminalDiagnosticStatus(result.status)) {
      const accepted = registerAcceptedEvidence(workflowDraft);
      workflowDraft = accepted.draft;
      if (accepted.record_submission) {
        learnerState = addEvent(learnerState, 'evidence_submitted', {
          character_count: evidence.value.trim().length,
          method: sample.passage.includes(evidence.value.trim()) ? 'passage_text' : 'unverified_text',
          diagnostic_attempt_number: workflowDraft.diagnostic_attempts
        });
      }
      if (accepted.record_time) learnerState = addEvidenceTime(learnerState, (performance.now() - evidenceTimerStartedAt) / 1000);
      saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
      saveAndRenderState();
    } else if (result.status === 'evidence_validation_failed') {
      learnerState = addEvent(learnerState, 'evidence_validation_failed', {
        character_count: evidence.value.trim().length,
        diagnostic_attempt_number: workflowDraft.diagnostic_attempts
      });
      saveAndRenderState();
    }
    currentDiagnosis = result;
    renderResult(result, payload);
  } catch {
    renderError('诊断服务暂时不可用。你的输入仍保留在页面中，可以稍后重试。');
  } finally {
    setDiagnosticFormLocked(diagnosticLocked);
  }
});

document.querySelectorAll('.diagnosis-vote').forEach((button) => {
  button.addEventListener('click', () => {
    if (!currentDiagnosis || currentDiagnosis.status !== 'diagnosed') return;
    const vote = button.dataset.vote;
    learnerState = addEvent(learnerState, vote === 'accepted' ? 'diagnosis_accepted' : 'diagnosis_rejected', {
      primary_error: currentDiagnosis.primary_error,
      confidence: currentDiagnosis.confidence,
      provider: currentDiagnosis.provider,
      prompt_version: currentDiagnosis.prompt_version,
      prompt_hash: currentDiagnosis.prompt_hash,
      model_version: currentDiagnosis.model_version,
      response_time_ms: currentDiagnosis.response_time_ms,
      model_cost_usd: currentDiagnosis.model_cost_usd
    });
    saveAndRenderState();
    document.querySelectorAll('.diagnosis-vote').forEach((voteButton) => { voteButton.disabled = true; });
    document.querySelector('#diagnosis-vote-message').textContent = vote === 'accepted'
      ? '已记录认可结果。'
      : '已记录不认可结果，后续应进入教师复核样本池。';
  });
});

function renderResult(result, payload, options = {}) {
  const record = options.record !== false;
  const scroll = options.scroll !== false;
  const renderInitialExercise = options.renderInitialExercise !== false;
  resultSection.hidden = false;
  nextDiagnosticButton.hidden = true;
  const error = document.querySelector('#result-error');
  const content = document.querySelector('#result-content');
  setDiagnosticFormLocked(isTerminalDiagnosticStatus(result.status));

  if (!['diagnosed', 'correct'].includes(result.status)) {
    content.hidden = true;
    error.hidden = false;
    error.textContent = diagnosticFailureMessage(result);
    if (result.status === 'abstained' && record) {
      learnerState = addEvent(learnerState, 'diagnosis_completed', diagnosisTelemetry(result, { primary_error: null, answer_result: result.answer_result }));
      learnerState = addEvent(learnerState, 'diagnosis_viewed', { diagnosis_status: 'abstained' });
      saveAndRenderState();
    }
  } else {
    error.hidden = true;
    content.hidden = false;
    document.querySelector('#user-evidence-result').textContent = payload.user_evidence.quote;
    document.querySelector('#standard-evidence-result').textContent = result.standard_evidence?.quote
      ?? payload.standard_evidence?.quote ?? '标准证据暂时不可用。';
    document.querySelector('#confidence-badge').textContent = `置信度 ${Math.round(result.confidence * 100)}%`;
    renderAnswerResult(result);
    if (result.status === 'correct') {
      document.querySelector('#diagnosis-copy').hidden = true;
      document.querySelector('#correct-copy').hidden = false;
      if (record) {
        learnerState = addEvent(learnerState, 'diagnosis_completed', diagnosisTelemetry(result, { answer_result: 'correct', primary_error: null }));
        learnerState = addEvent(learnerState, 'diagnosis_viewed', { answer_result: 'correct' });
        saveAndRenderState();
      }
      exerciseSection.hidden = true;
      document.querySelector('#diagnosis-feedback').hidden = true;
      if (record) persistDiagnosis(result, payload);
      setNextDiagnosticAvailability();
      if (scroll) resultSection.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    document.querySelector('#diagnosis-copy').hidden = false;
    document.querySelector('#correct-copy').hidden = true;
    document.querySelector('#diagnosis-feedback').hidden = false;
    document.querySelectorAll('.diagnosis-vote').forEach((voteButton) => { voteButton.disabled = false; });
    document.querySelector('#diagnosis-vote-message').textContent = '';
    document.querySelector('#diagnosis-language').textContent = result.confidence_language;
    document.querySelector('#primary-error').textContent = categoryName(result.primary_error);
    document.querySelector('#feedback-where').textContent = result.feedback?.where ?? '当前信息不足。';
    document.querySelector('#feedback-why').textContent = result.feedback?.why ?? '当前信息不足。';
    document.querySelector('#feedback-fix').textContent = result.feedback?.fix ?? '建议教师确认。';
    renderSpecificFeedback(result.feedback?.specific);
    renderTrace(result.decision_trace);
    if (record) {
      learnerState = addDiagnosis(learnerState, result);
      learnerState = addEvent(learnerState, 'diagnosis_completed', diagnosisTelemetry(result, { primary_error: result.primary_error, answer_result: result.answer_result }));
      learnerState = addEvent(learnerState, 'diagnosis_viewed', { primary_error: result.primary_error });
      saveAndRenderState();
    }
    if (record) persistDiagnosis(result, payload);
    if (result.exercise && renderInitialExercise) renderExercise(result.exercise, { recordEvent: record, scroll });
  }

  if (record && result.status === 'abstained') persistDiagnosis(result, payload);
  setNextDiagnosticAvailability();
  if (scroll) resultSection.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function renderSpecificFeedback(specific) {
  const container = document.querySelector('#specific-feedback');
  container.hidden = !specific;
  if (!specific) return;
  document.querySelector('#specific-question-expression').textContent = specific.question_expression;
  document.querySelector('#specific-passage-expression').textContent = specific.passage_expression;
  document.querySelector('#specific-explanation').textContent = specific.explanation;
  document.querySelector('#specific-action').textContent = specific.action;
}

function diagnosticFailureMessage(result) {
  const messages = {
    user_quote_not_in_passage: '这段证据无法在原文中找到。请重新划选，或粘贴原文中的完整句子后再次提交。',
    missing_user_evidence: '必须先提交一段来自原文的证据，系统才会开始诊断。',
    quote_not_in_passage: '标准证据无法在原文中定位，本题暂时不能诊断，建议教师检查题目数据。',
    missing_standard_evidence: '本题缺少标准证据，暂时不能诊断，建议教师检查题目数据。'
  };
  return messages[result.reason]
    ?? result.reason
    ?? '当前信息不足，无法进行确定性诊断。建议补充信息或请教师确认。';
}

function renderAnswerResult(result) {
  const container = document.querySelector('#answer-result');
  const value = document.querySelector('#answer-result-value');
  document.querySelector('#answer-result-label').textContent = '作答结果';
  container.dataset.result = result.answer_result;
  value.textContent = result.answer_result === 'correct'
    ? result.lucky_correct ? '答案正确，但证据或推理存在问题' : '答案正确'
    : result.answer_result === 'incorrect' ? '答案错误' : '暂时无法判断';
}

document.querySelector('#exercise-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentExercise) return;
  const answer = new FormData(event.currentTarget).get('exercise-answer');
  if (!answer) return;
  const button = document.querySelector('#exercise-submit');
  const idleButtonText = button.textContent;
  const submittedExerciseId = currentExercise.id;
  let requestAccepted = false;
  exerciseAttempts += 1;
  button.disabled = true;
  button.textContent = '正在核验答案';
  try {
    const response = await fetch('/api/exercise/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise_id: currentExercise.id, answer })
    });
    const result = await response.json();
    if (!response.ok || !validExerciseCheckResponse(result, submittedExerciseId)) throw new Error('exercise_check_response_invalid');
    requestAccepted = true;
    const feedback = document.querySelector('#exercise-feedback');
    feedback.hidden = false;
    feedback.textContent = result.feedback;
    learnerState = addExerciseResult(learnerState, result, exerciseHintsUsed, exerciseAttempts);
    learnerState = addEvent(learnerState, result.stage === 'transfer' ? 'transfer_completed' : 'micro_exercise_completed', {
      correct: result.correct, target_error: result.target_error, attempt_number: exerciseAttempts, hints_used: exerciseHintsUsed
    });
    saveAndRenderState();
    if (result.next_exercise) {
      pendingNextExercise = result.next_exercise;
      persistExercise(feedback.textContent);
      button.textContent = '进入迁移题';
      button.disabled = false;
      button.type = 'button';
      button.onclick = () => {
        button.type = 'submit';
        button.onclick = null;
        pendingNextExercise = null;
        renderExercise(result.next_exercise);
      };
      return;
    }
    if (result.stage === 'immediate' && !result.correct) {
      persistExercise(feedback.textContent);
      button.textContent = '再次提交';
      button.disabled = false;
      return;
    }
    if (result.stage === 'transfer') {
      workflowDraft.path_completed = true;
      setNextDiagnosticAvailability();
    }
    button.textContent = result.correct ? '迁移题完成' : '迁移题已记录';
    persistExercise(feedback.textContent);
  } catch {
    exerciseAttempts = rollbackUnverifiedAttempt(exerciseAttempts);
    const feedback = document.querySelector('#exercise-feedback');
    feedback.hidden = false;
    feedback.textContent = '练习核验暂时不可用，请稍后重试。';
    button.disabled = false;
    button.textContent = idleButtonText;
  } finally {
    if (requestAccepted && !button.onclick && currentExercise?.stage !== 'transfer') button.disabled = false;
  }
});

document.querySelector('#exercise-hint').addEventListener('click', () => {
  if (!currentExercise) return;
  exerciseHintsUsed += 1;
  const feedback = document.querySelector('#exercise-feedback');
  feedback.hidden = false;
  feedback.textContent = exerciseHint(currentExercise.target_error);
  document.querySelector('#exercise-hint').disabled = true;
  learnerState = addEvent(learnerState, 'exercise_hint_used', {
    exercise_id: currentExercise.id, target_error: currentExercise.target_error, stage: currentExercise.stage
  });
  saveAndRenderState();
  persistExercise(feedback.textContent);
});

document.querySelector('#clear-demo').addEventListener('click', () => {
  learnerState = clearState(stateStorageId);
  clearWorkflowDraft(localStorage, workflowNamespace);
  location.reload();
});

function renderExercise(exercise, renderOptions = {}) {
  currentExercise = exercise;
  pendingNextExercise = null;
  if (renderOptions.resetProgress !== false) {
    exerciseHintsUsed = 0;
    exerciseAttempts = 0;
  }
  exerciseSection.hidden = false;
  document.querySelector('#exercise-stage').textContent = exercise.stage === 'transfer' ? 'TRANSFER CHECK' : 'TARGETED PRACTICE';
  document.querySelector('#exercise-title').textContent = exercise.stage === 'transfer' ? '无辅助迁移题' : '针对性微练习';
  document.querySelector('#exercise-target').textContent = categoryName(exercise.target_error);
  document.querySelector('#exercise-passage').textContent = exercise.passage;
  document.querySelector('#exercise-question').textContent = exercise.question;
  document.querySelector('#exercise-feedback').hidden = true;
  const options = document.querySelector('#exercise-options');
  options.replaceChildren();
  exercise.options.forEach((option, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    const span = document.createElement('span');
    input.type = 'radio'; input.name = 'exercise-answer'; input.value = option; input.required = true;
    input.id = `exercise-option-${index}`;
    span.textContent = option;
    label.append(input, span);
    options.append(label);
  });
  const button = document.querySelector('#exercise-submit');
  button.type = 'submit'; button.onclick = null; button.disabled = false;
  button.textContent = exercise.stage === 'transfer' ? '提交迁移题答案' : '提交练习答案';
  const hintButton = document.querySelector('#exercise-hint');
  hintButton.hidden = exercise.stage === 'transfer';
  hintButton.disabled = false;
  if (renderOptions.recordEvent !== false) {
    learnerState = addEvent(learnerState, exercise.stage === 'transfer' ? 'transfer_started' : 'micro_exercise_started', { target_error: exercise.target_error });
    saveAndRenderState();
  }
  persistExercise('');
  if (renderOptions.scroll !== false) exerciseSection.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function saveFormDraft() {
  const data = new FormData(form);
  workflowDraft.form = {
    answer: String(data.get('answer') ?? ''),
    evidence: evidence.value,
    reasoning: String(data.get('reasoning') ?? '')
  };
  workflowDraft.question_id = sample.id;
  saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
}

function persistDiagnosis(result, payload) {
  saveFormDraft();
  workflowDraft.diagnosis = { result, payload };
  workflowDraft.exercise = null;
  workflowDraft.path_completed = ['correct', 'abstained'].includes(result.status);
  saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
}

function persistExercise(feedback = '') {
  if (!currentExercise) return;
  workflowDraft.exercise = {
    current: currentExercise,
    attempts: exerciseAttempts,
    hints_used: exerciseHintsUsed,
    feedback,
    pending_next: pendingNextExercise
  };
  saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
}

function restoreWorkflow() {
  const answer = workflowDraft.form.answer;
  const answerInput = answer ? [...form.querySelectorAll('input[name="answer"]')].find((input) => input.value === answer) : null;
  if (answerInput) answerInput.checked = true;
  evidence.value = workflowDraft.form.evidence;
  form.elements.reasoning.value = workflowDraft.form.reasoning;
  if (evidence.value) evidence.dispatchEvent(new Event('input'));
  saveAndRenderState();
  if (!workflowDraft.diagnosis) {
    return;
  }
  currentDiagnosis = workflowDraft.diagnosis.result;
  renderResult(currentDiagnosis, workflowDraft.diagnosis.payload, { record: false, scroll: false, renderInitialExercise: false });
  if (!workflowDraft.exercise) return;
  const savedExercise = structuredClone(workflowDraft.exercise);
  exerciseAttempts = Math.max(0, savedExercise.attempts);
  exerciseHintsUsed = Math.max(0, savedExercise.hints_used);
  renderExercise(savedExercise.current, { recordEvent: false, resetProgress: false, scroll: false });
  const feedback = document.querySelector('#exercise-feedback');
  if (savedExercise.feedback) {
    feedback.hidden = false;
    feedback.textContent = savedExercise.feedback;
  }
  if (exerciseHintsUsed > 0) document.querySelector('#exercise-hint').disabled = true;
  pendingNextExercise = savedExercise.pending_next ?? null;
  if (pendingNextExercise) {
    const button = document.querySelector('#exercise-submit');
    button.type = 'button';
    button.textContent = '进入迁移题';
    button.onclick = () => {
      button.type = 'submit';
      button.onclick = null;
      const next = pendingNextExercise;
      pendingNextExercise = null;
      renderExercise(next);
    };
  }
  if (workflowDraft.path_completed) {
    const button = document.querySelector('#exercise-submit');
    button.type = 'button';
    button.disabled = true;
    button.onclick = null;
    button.textContent = '迁移题完成';
  }
  persistExercise(feedback.hidden ? '' : feedback.textContent);
  setNextDiagnosticAvailability();
}

function renderQuestion(question) {
  passage.textContent = question.passage;
  document.querySelector('#passage-title').textContent = question.title;
  document.querySelector('#question-prompt').textContent = question.question;
  const index = DEMO_QUESTIONS.findIndex((item) => item.id === question.id);
  document.querySelector('#question-number').textContent = `QUESTION ${index + 1} OF ${DEMO_QUESTIONS.length}`;
}

async function loadDemoQuestions() {
  try {
    const response = await fetch('/api/demo-questions');
    if (!response.ok) throw new Error('question_request_failed');
    const body = await response.json();
    if (!Array.isArray(body.questions) || !body.questions.length) throw new Error('question_payload_invalid');
    return body.questions;
  } catch {
    evidenceStatus.textContent = '题目服务暂时不可用。当前页面只能保留已显示内容，诊断可能无法提交。';
    return [{
      id: 'demo_fox_001', title: document.querySelector('#passage-title').textContent,
      passage: passage.textContent.trim(), question_type: 'TRUE_FALSE_NOT_GIVEN',
      question: document.querySelector('#question-prompt').textContent,
      data_origin: 'original_project_content'
    }];
  }
}

function getDemoQuestion(id) {
  return structuredClone(DEMO_QUESTIONS.find((item) => item.id === id) ?? DEMO_QUESTIONS[0]);
}

function nextDemoQuestionId(id) {
  const index = DEMO_QUESTIONS.findIndex((item) => item.id === id);
  return DEMO_QUESTIONS[(index + 1 + DEMO_QUESTIONS.length) % DEMO_QUESTIONS.length].id;
}

function startNextDiagnostic() {
  const nextId = nextDemoQuestionId(sample.id);
  sample = getDemoQuestion(nextId);
  workflowDraft = emptyWorkflowDraft(nextId);
  workflowDraft.started = true;
  currentDiagnosis = null;
  currentExercise = null;
  pendingNextExercise = null;
  exerciseAttempts = 0;
  exerciseHintsUsed = 0;
  form.reset();
  setDiagnosticFormLocked(false);
  evidence.value = '';
  evidenceStatus.textContent = '尚未选择证据。手动粘贴的文字也会接受原文匹配校验。';
  resultSection.hidden = true;
  exerciseSection.hidden = true;
  nextDiagnosticButton.hidden = true;
  renderQuestion(sample);
  evidenceTimerStartedAt = performance.now();
  learnerState = addEvent(learnerState, 'question_started', { question_id: sample.id });
  saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
  saveAndRenderState();
  document.querySelector('.workspace').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function setNextDiagnosticAvailability() {
  nextDiagnosticButton.hidden = workflowDraft.path_completed !== true;
}

function setDiagnosticFormLocked(locked) {
  diagnosticLocked = locked;
  form.querySelectorAll('input, textarea').forEach((control) => { control.disabled = locked; });
  captureButton.disabled = locked;
  submitButton.disabled = locked;
  submitButton.textContent = locked ? '本轮诊断已完成' : '验证证据并诊断';
}

function exerciseHint(category) {
  return {
    location: '方法提示：先复述题干要找的信息，再逐句检查哪一句直接回答它。',
    paraphrase: '方法提示：不要只找原词，先比较两个表达的核心含义是否相同。',
    sentence_comprehension: '方法提示：先圈出转折、否定或范围词，再判断句子真正保留了什么信息。',
    question_strategy: '方法提示：区分“原文明确相反”和“原文没有说明”，不要用常识补全。',
    over_inference: '方法提示：只保留原文能够直接支持的结论，检查是否擅自加入因果或绝对化表达。'
  }[category] ?? '方法提示：回到原文，只使用能够直接验证的信息。';
}

function diagnosisTelemetry(result, properties = {}) {
  return {
    ...properties,
    diagnosis_status: result.status,
    confidence: result.confidence,
    provider: result.provider,
    prompt_version: result.prompt_version,
    prompt_hash: result.prompt_hash,
    model_version: result.model_version,
    response_time_ms: result.response_time_ms,
    model_cost_usd: result.model_cost_usd
  };
}

function saveAndRenderState() {
  saveState(learnerState, stateStorageId);
  const diagnosisCount = Object.values(learnerState.error_counts).reduce((sum, count) => sum + count, 0);
  const transfer = learnerState.transfer_results;
  const transferAccuracy = transfer.length ? Math.round(transfer.filter((item) => item.correct).length / transfer.length * 100) : 0;
  document.querySelector('#report-diagnoses').textContent = String(diagnosisCount);
  document.querySelector('#report-practice').textContent = String(learnerState.micro_exercise_results.length);
  document.querySelector('#report-transfer').textContent = `${transferAccuracy}%`;
  document.querySelector('#report-recurring').textContent = learnerState.recurring_errors.length ? learnerState.recurring_errors.map(categoryName).join('、') : '暂无';
}

function renderError(message) {
  resultSection.hidden = false;
  document.querySelector('#result-content').hidden = true;
  const error = document.querySelector('#result-error');
  error.hidden = false;
  error.textContent = message;
}

function renderTrace(trace) {
  const labels = {
    evidence_location: '证据定位',
    semantic_mapping: '同义替换',
    sentence_understanding: '句子理解',
    question_rule: '题型规则',
    reasoning_boundary: '推理边界'
  };
  const states = { pass: '通过', fail: '发现问题', not_assessed: '后续步骤未评估' };
  const container = document.querySelector('#decision-trace');
  container.replaceChildren();
  for (const [key, value] of Object.entries(trace)) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = labels[key] ?? key;
    detail.textContent = states[value] ?? value;
    container.append(term, detail);
  }
}

function categoryName(value) {
  return {
    location: '定位错误',
    paraphrase: '同义替换错误',
    sentence_comprehension: '句子理解错误',
    question_strategy: '题型策略错误',
    over_inference: '推理越界'
  }[value] ?? '需要教师确认';
}

restoreWorkflow();
if (!workflowDraft.started) {
  workflowDraft.started = true;
  learnerState = addEvent(learnerState, 'question_started', { question_id: sample.id });
  saveWorkflowDraft(workflowDraft, localStorage, workflowNamespace);
  saveAndRenderState();
}

import { activateResearchSession, addDiagnosis, addEvent, addEvidenceTime, addExerciseResult, clearState, loadState, saveState } from './learner-store.js';
import { clearWorkflowDraft, emptyWorkflowDraft, isTerminalDiagnosticStatus, loadWorkflowDraft, registerAcceptedEvidence, registerDiagnosticAttempt, saveWorkflowDraft } from './workflow-store.js';
import { rollbackUnverifiedAttempt, validExerciseCheckResponse } from './exercise-response.js';

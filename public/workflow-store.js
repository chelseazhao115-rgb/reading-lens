const WORKFLOW_KEY = 'reading-lens-workflow-v1';

export function emptyWorkflowDraft(questionId = 'demo_fox_001') {
  return {
    schema_version: 3,
    question_id: questionId,
    started: false,
    path_completed: false,
    diagnostic_attempts: 0,
    answer_submission_recorded: false,
    evidence_submission_recorded: false,
    evidence_time_recorded: false,
    form: { answer: '', evidence: '', reasoning: '' },
    diagnosis: null,
    exercise: null
  };
}

export function loadWorkflowDraft(storage = globalThis.localStorage, namespace = 'demo') {
  if (!storage) return emptyWorkflowDraft();
  try {
    const value = JSON.parse(storage.getItem(workflowStorageKey(namespace)));
    if (!value || ![1, 2, 3].includes(value.schema_version)) return emptyWorkflowDraft();
    return {
      ...emptyWorkflowDraft(),
      question_id: clean(value.question_id) || 'demo_fox_001',
      started: value.started === true,
      path_completed: value.path_completed === true,
      diagnostic_attempts: Math.max(0, Number.isFinite(value.diagnostic_attempts) ? Math.floor(value.diagnostic_attempts) : 0),
      answer_submission_recorded: value.answer_submission_recorded === true,
      evidence_submission_recorded: value.evidence_submission_recorded === true,
      evidence_time_recorded: value.evidence_time_recorded === true,
      form: {
        answer: clean(value.form?.answer),
        evidence: clean(value.form?.evidence),
        reasoning: clean(value.form?.reasoning)
      },
      diagnosis: validDiagnosisDraft(value.diagnosis) ? structuredClone(value.diagnosis) : null,
      exercise: validExerciseDraft(value.exercise) ? structuredClone(value.exercise) : null
    };
  } catch {
    return emptyWorkflowDraft();
  }
}

export function saveWorkflowDraft(draft, storage = globalThis.localStorage, namespace = 'demo') {
  if (!storage) return;
  storage.setItem(workflowStorageKey(namespace), JSON.stringify({ ...draft, schema_version: 3 }));
}

export function clearWorkflowDraft(storage = globalThis.localStorage, namespace = 'demo') {
  storage?.removeItem(workflowStorageKey(namespace));
}

export function workflowStorageKey(namespace = 'demo') {
  const value = String(namespace ?? 'demo');
  return /^rs_[a-z0-9-]{8,64}$/i.test(value) ? `${WORKFLOW_KEY}:session:${value}` : WORKFLOW_KEY;
}

export function isTerminalDiagnosticStatus(status) {
  return ['diagnosed', 'correct', 'abstained'].includes(status);
}

export function registerDiagnosticAttempt(draft) {
  const firstAnswerSubmission = draft.answer_submission_recorded !== true;
  return {
    first_answer_submission: firstAnswerSubmission,
    draft: {
      ...draft,
      diagnostic_attempts: Math.max(0, Number(draft.diagnostic_attempts) || 0) + 1,
      answer_submission_recorded: true
    }
  };
}

export function registerAcceptedEvidence(draft) {
  const shouldRecordSubmission = draft.evidence_submission_recorded !== true;
  const shouldRecordTime = draft.evidence_time_recorded !== true;
  return {
    record_submission: shouldRecordSubmission,
    record_time: shouldRecordTime,
    draft: { ...draft, evidence_submission_recorded: true, evidence_time_recorded: true }
  };
}

function validDiagnosisDraft(value) {
  return value && typeof value === 'object'
    && value.result && typeof value.result === 'object'
    && value.payload && typeof value.payload === 'object'
    && ['diagnosed', 'correct', 'abstained'].includes(value.result.status);
}

function validExerciseDraft(value) {
  return value && typeof value === 'object'
    && value.current && typeof value.current === 'object'
    && typeof value.current.id === 'string'
    && ['immediate', 'transfer'].includes(value.current.stage)
    && Array.isArray(value.current.options)
    && Number.isFinite(value.attempts)
    && Number.isFinite(value.hints_used);
}

function clean(value) {
  return typeof value === 'string' ? value.slice(0, 10000) : '';
}

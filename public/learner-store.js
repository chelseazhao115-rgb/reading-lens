const STORAGE_KEY = 'reading-lens-learner-state-v1';
const RESEARCH_SESSION_KEY = 'reading-lens-active-research-session-v1';
const categories = ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference'];

export function emptyState() {
  return {
    schema_version: 1,
    data_source: 'demo',
    error_counts: Object.fromEntries(categories.map((category) => [category, 0])),
    recent_errors: [], recurring_errors: [], micro_exercise_results: [], transfer_results: [],
    evidence_times_seconds: [], average_evidence_time: null, help_dependency: null, events: []
  };
}

export function loadState(researchSessionId = activeResearchSession(), storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(stateStorageKey(researchSessionId)));
    return value?.schema_version === 1 ? { ...emptyState(), ...value } : emptyState();
  } catch { return emptyState(); }
}

export function funnelFromEvents(events = []) {
  const count = (name) => events.filter((item) => item.event === name).length;
  const started = count('question_started');
  const submitted = count('answer_submitted');
  const evidenceSubmitted = count('evidence_submitted');
  const diagnosed = count('diagnosis_completed');
  const viewed = count('diagnosis_viewed');
  const practiceStarted = count('micro_exercise_started');
  const practiceCompleted = count('micro_exercise_completed');
  const transferCompleted = count('transfer_completed');
  const accepted = count('diagnosis_accepted');
  const rejected = count('diagnosis_rejected');
  return {
    question_started: started, answer_submitted: submitted, evidence_submitted: evidenceSubmitted,
    diagnosis_completed: diagnosed, diagnosis_viewed: viewed, micro_exercise_started: practiceStarted,
    micro_exercise_completed: practiceCompleted, transfer_completed: transferCompleted,
    diagnosis_accepted: accepted, diagnosis_rejected: rejected,
    rates: {
      diagnosis_completion: rate(diagnosed, submitted),
      evidence_submission: rate(evidenceSubmitted, started),
      micro_exercise_start: rate(practiceStarted, viewed),
      micro_exercise_completion: rate(practiceCompleted, practiceStarted),
      transfer_completion: rate(transferCompleted, practiceCompleted),
      diagnosis_acceptance: rate(accepted, accepted + rejected)
    }
  };
}

export function productMetricsFromState(state = emptyState(), now = new Date()) {
  const diagnoses = (state.events ?? [])
    .filter((item) => item.event === 'diagnosis_completed' && categories.includes(item.properties?.primary_error))
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const seen = new Set();
  let recurringOccurrences = 0;
  for (const item of diagnoses) {
    const category = item.properties.primary_error;
    if (seen.has(category)) recurringOccurrences += 1;
    seen.add(category);
  }
  const transfer = state.transfer_results ?? [];
  return {
    transfer_accuracy: transfer.length ? rate(transfer.filter((item) => item.correct).length, transfer.length) : null,
    recurring_error_rate: diagnoses.length ? rate(recurringOccurrences, diagnoses.length) : null,
    seven_day_repeat_usage: sevenDayRepeatUsage(state.events ?? [], now)
  };
}

export function sevenDayRepeatUsage(events = [], now = new Date()) {
  const starts = events
    .filter((item) => item.event === 'question_started' && Number.isFinite(new Date(item.occurred_at).getTime()))
    .map((item) => new Date(item.occurred_at))
    .sort((a, b) => a - b);
  if (!starts.length) return null;
  const first = starts[0];
  const ageDays = (new Date(now) - first) / 86400000;
  if (ageDays < 7) return null;
  return starts.some((date, index) => index > 0 && (date - first) / 86400000 >= 7) ? 1 : 0;
}

export function saveState(state, researchSessionId = activeResearchSession(), storage = globalThis.localStorage) {
  storage?.setItem(stateStorageKey(researchSessionId), JSON.stringify(state));
}

export function clearState(researchSessionId = activeResearchSession(), storage = globalThis.localStorage) {
  storage?.removeItem(stateStorageKey(researchSessionId));
  return emptyState();
}

export function stateStorageKey(researchSessionId = null) {
  return validResearchSessionId(researchSessionId) ? `${STORAGE_KEY}:session:${researchSessionId}` : STORAGE_KEY;
}

export function addEvent(state, event, properties = {}) {
  const next = structuredClone(state);
  const researchSessionId = activeResearchSession();
  next.events.push({
    event,
    occurred_at: new Date().toISOString(),
    properties: researchSessionId ? { ...properties, research_session_id: researchSessionId } : properties
  });
  next.events = next.events.slice(-500);
  return next;
}

export function activateResearchSession(search = globalThis.location?.search ?? '', storage = globalThis.sessionStorage) {
  if (!storage) return null;
  const value = new URLSearchParams(search).get('research_session') ?? '';
  if (/^rs_[a-z0-9-]{8,64}$/i.test(value)) {
    storage.setItem(RESEARCH_SESSION_KEY, value);
    return value;
  }
  storage.removeItem(RESEARCH_SESSION_KEY);
  return null;
}

export function activeResearchSession(storage = globalThis.sessionStorage) {
  if (!storage) return null;
  const value = storage.getItem(RESEARCH_SESSION_KEY) ?? '';
  return /^rs_[a-z0-9-]{8,64}$/i.test(value) ? value : null;
}

function validResearchSessionId(value) {
  return /^rs_[a-z0-9-]{8,64}$/i.test(String(value ?? ''));
}

export function addDiagnosis(state, result) {
  const next = structuredClone(state);
  if (!categories.includes(result.primary_error)) return next;
  next.error_counts[result.primary_error] += 1;
  next.recent_errors.unshift({ category: result.primary_error, occurred_at: new Date().toISOString() });
  next.recent_errors = next.recent_errors.slice(0, 20);
  next.recurring_errors = categories.filter((category) => next.error_counts[category] >= 2);
  return next;
}

export function addExerciseResult(state, result, hintsUsed = 0, attemptNumber = 1) {
  const next = structuredClone(state);
  const record = {
    exercise_id: result.exercise_id, target_error: result.target_error, correct: result.correct,
    attempt_number: Math.max(1, Number(attemptNumber) || 1), hints_used: Math.max(0, Number(hintsUsed) || 0),
    occurred_at: new Date().toISOString()
  };
  if (result.stage === 'transfer') next.transfer_results.push(record);
  else next.micro_exercise_results.push(record);
  const all = [...next.micro_exercise_results, ...next.transfer_results];
  next.help_dependency = all.length ? Math.round(all.filter((item) => item.hints_used > 0).length / all.length * 1000) / 1000 : null;
  return next;
}

export function addEvidenceTime(state, seconds) {
  const next = structuredClone(state);
  const duration = Number(seconds);
  if (!Number.isFinite(duration) || duration < 0) return next;
  next.evidence_times_seconds.push(Math.round(duration * 1000) / 1000);
  next.evidence_times_seconds = next.evidence_times_seconds.slice(-50);
  next.average_evidence_time = Math.round(next.evidence_times_seconds.reduce((sum, value) => sum + value, 0) / next.evidence_times_seconds.length * 1000) / 1000;
  return next;
}

function rate(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 1000 : null;
}

import { PRIMARY_ERRORS } from './taxonomy.js';

export function createLearnerState() {
  return {
    schema_version: 1,
    error_counts: Object.fromEntries(PRIMARY_ERRORS.map((label) => [label, 0])),
    recent_errors: [],
    recurring_errors: [],
    micro_exercise_results: [],
    transfer_results: [],
    evidence_times_seconds: [],
    average_evidence_time: null,
    help_dependency: null,
    events: []
  };
}

export function applyDiagnosis(state, diagnosis, occurredAt = new Date().toISOString()) {
  const next = cloneState(state);
  if (diagnosis.status !== 'diagnosed' || !PRIMARY_ERRORS.includes(diagnosis.primary_error)) return next;
  next.error_counts[diagnosis.primary_error] += 1;
  next.recent_errors.unshift({ category: diagnosis.primary_error, occurred_at: occurredAt });
  next.recent_errors = next.recent_errors.slice(0, 20);
  next.recurring_errors = PRIMARY_ERRORS.filter((category) => next.error_counts[category] >= 2);
  return next;
}

export function applyExerciseResult(state, result, hintsUsed = 0, occurredAt = new Date().toISOString()) {
  const next = cloneState(state);
  const record = {
    exercise_id: result.exercise_id,
    target_error: result.target_error,
    correct: result.correct,
    attempt_number: Math.max(1, Number(result.attempt_number) || 1),
    hints_used: Math.max(0, Number(hintsUsed) || 0),
    occurred_at: occurredAt
  };
  if (result.stage === 'transfer') next.transfer_results.push(record);
  else next.micro_exercise_results.push(record);
  const all = [...next.micro_exercise_results, ...next.transfer_results];
  next.help_dependency = all.length ? round(all.reduce((sum, item) => sum + Number(item.hints_used > 0), 0) / all.length) : null;
  return next;
}

export function applyEvidenceTime(state, seconds) {
  const next = cloneState(state);
  const duration = Number(seconds);
  if (!Number.isFinite(duration) || duration < 0) return next;
  next.evidence_times_seconds.push(round(duration));
  next.evidence_times_seconds = next.evidence_times_seconds.slice(-50);
  next.average_evidence_time = round(next.evidence_times_seconds.reduce((sum, value) => sum + value, 0) / next.evidence_times_seconds.length);
  return next;
}

export function recordEvent(state, eventName, properties = {}, occurredAt = new Date().toISOString()) {
  const next = cloneState(state);
  next.events.push({ event: eventName, occurred_at: occurredAt, properties });
  next.events = next.events.slice(-500);
  return next;
}

function cloneState(state) {
  return structuredClone(state ?? createLearnerState());
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

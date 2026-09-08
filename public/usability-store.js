const STORAGE_KEY = 'reading-lens-usability-study-v1';
const AUDIT_KEY = 'reading-lens-usability-audit-v1';
const TARGET_BANDS = new Set(['5.5', '6.0', '6.5']);
const REQUIRED_SESSION_EVENTS = ['question_started', 'answer_submitted', 'evidence_submitted', 'diagnosis_completed', 'diagnosis_viewed'];
const BLOCKER_CODES = new Set([
  'start_clarity', 'answer_input', 'evidence_selection', 'reasoning_input', 'diagnosis_comprehension',
  'exercise_retry', 'transfer', 'technical'
]);
const STUDY_ROUNDS = new Set(['baseline', 'post_fix_retest']);

export function validateStudyRecord(record) {
  const errors = [];
  if (!record?.participant_id || !/^[A-Za-z0-9_-]{2,24}$/.test(record.participant_id)) errors.push('invalid_participant_id');
  if (record?.data_source !== 'real_user_research') errors.push('invalid_data_source');
  if (record?.consent_confirmed !== true) errors.push('consent_required');
  if (!TARGET_BANDS.has(record?.reading_band)) errors.push('outside_target_band');
  if (record?.has_ielts_experience !== true) errors.push('ielts_experience_required');
  if (record?.accuracy_plateau !== true) errors.push('accuracy_plateau_required');
  if (!/^rs_[a-z0-9-]{8,64}$/i.test(record?.research_session_id ?? '')) errors.push('invalid_research_session_id');
  if (record?.telemetry_verified !== true || !record?.telemetry?.valid) errors.push('verified_product_telemetry_required');
  if (record?.telemetry?.research_session_id !== record?.research_session_id) errors.push('telemetry_session_mismatch');
  for (const field of ['unassisted_completion', 'evidence_selection_success', 'diagnosis_understood']) {
    if (typeof record?.[field] !== 'boolean') errors.push(`${field}_required`);
  }
  const studyRound = record?.study_round ?? 'baseline';
  if (!STUDY_ROUNDS.has(studyRound)) errors.push('invalid_study_round');
  const instructionalFields = ['specific_error_understood', 'next_action_understood', 'practice_relevance_understood'];
  if (studyRound === 'post_fix_retest') {
    for (const field of instructionalFields) if (typeof record?.[field] !== 'boolean') errors.push(`${field}_required`);
  } else {
    for (const field of instructionalFields) if (record?.[field] != null && typeof record[field] !== 'boolean') errors.push(`${field}_invalid`);
  }
  for (const field of ['completion_time_seconds', 'diagnosis_comprehension_time_seconds']) {
    if (!Number.isFinite(Number(record?.[field])) || Number(record[field]) <= 0) errors.push(`${field}_invalid`);
  }
  if (record?.telemetry?.valid && Number(record.completion_time_seconds) !== Number(record.telemetry.completion_time_seconds)) errors.push('completion_time_must_match_telemetry');
  if (record?.telemetry?.valid && record.evidence_selection_success !== record.telemetry.evidence_selection_success) errors.push('evidence_success_must_match_telemetry');
  if (record?.unassisted_completion === true && record?.telemetry?.path_completion_verified !== true) errors.push('unassisted_completion_requires_verified_path');
  if (!Array.isArray(record?.blocker_codes) || record.blocker_codes.some((code) => !BLOCKER_CODES.has(code))) errors.push('invalid_blocker_codes');
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(record?.observer_notes ?? '') || /\b1[3-9]\d{9}\b/.test(record?.observer_notes ?? '')) errors.push('observer_notes_contains_prohibited_identifier');
  if (!record?.completed_at || Number.isNaN(Date.parse(record.completed_at))) errors.push('invalid_completed_at');
  return { valid: errors.length === 0, errors };
}

export function deriveSessionTelemetry(events = [], researchSessionId, observedAt = new Date().toISOString()) {
  if (!/^rs_[a-z0-9-]{8,64}$/i.test(researchSessionId ?? '')) {
    return { valid: false, research_session_id: researchSessionId ?? null, missing_events: [...REQUIRED_SESSION_EVENTS] };
  }
  const sessionEvents = events
    .filter((item) => item?.properties?.research_session_id === researchSessionId && Number.isFinite(Date.parse(item.occurred_at)))
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  const chain = [];
  let cursor = -1;
  for (const name of REQUIRED_SESSION_EVENTS) {
    const index = sessionEvents.findIndex((item, itemIndex) => itemIndex > cursor && item.event === name);
    if (index >= 0) { chain.push(sessionEvents[index]); cursor = index; }
  }
  const present = new Set(chain.map((item) => item.event));
  const missingEvents = REQUIRED_SESSION_EVENTS.filter((name) => !present.has(name));
  const startedEvent = chain.find((item) => item.event === 'question_started');
  if (!startedEvent) return {
    valid: false, research_session_id: researchSessionId, event_count: sessionEvents.length, missing_events: missingEvents
  };
  if (missingEvents.length) {
    const observedTime = Number.isFinite(Date.parse(observedAt)) ? observedAt : startedEvent.occurred_at;
    return {
      valid: true,
      core_event_chain_complete: false,
      research_session_id: researchSessionId,
      event_count: sessionEvents.length,
      required_event_chain: [...REQUIRED_SESSION_EVENTS],
      missing_events: missingEvents,
      started_at: startedEvent.occurred_at,
      completed_at: observedTime,
      completion_time_seconds: Math.max(1, Math.round((Date.parse(observedTime) - Date.parse(startedEvent.occurred_at)) / 1000)),
      evidence_selection_success: sessionEvents.some((item) => item.event === 'evidence_submitted' && item.properties?.method === 'passage_text'),
      diagnosis_status: null,
      path_completion_verified: false,
      transfer_completed: false
    };
  }
  const diagnosisEvent = chain.find((item) => item.event === 'diagnosis_completed');
  const diagnosisStatus = diagnosisEvent?.properties?.diagnosis_status ?? 'unknown_terminal';
  const transferEvent = sessionEvents.find((item) => item.event === 'transfer_completed');
  const pathCompletionVerified = diagnosisStatus !== 'diagnosed' || Boolean(transferEvent);
  const startedAt = chain[0].occurred_at;
  const completedAt = pathCompletionVerified && transferEvent ? transferEvent.occurred_at : chain.at(-1).occurred_at;
  const completionSeconds = Math.max(1, Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000));
  const evidenceEvent = chain.find((item) => item.event === 'evidence_submitted');
  return {
    valid: true,
    core_event_chain_complete: true,
    research_session_id: researchSessionId,
    event_count: sessionEvents.length,
    required_event_chain: [...REQUIRED_SESSION_EVENTS],
    started_at: startedAt,
    completed_at: completedAt,
    completion_time_seconds: completionSeconds,
    evidence_selection_success: evidenceEvent?.properties?.method === 'passage_text',
    diagnosis_status: diagnosisStatus,
    path_completion_verified: pathCompletionVerified,
    transfer_completed: Boolean(transferEvent)
  };
}

export function summarizeStudyRecords(records = [], minimumSample = 5, minimumInstructionalSample = 3) {
  const structurallyValid = records.filter((record) => validateStudyRecord(record).valid);
  const sessionCounts = structurallyValid.reduce((counts, record) => {
    counts.set(record.research_session_id, (counts.get(record.research_session_id) ?? 0) + 1);
    return counts;
  }, new Map());
  const duplicateSessionRecords = structurallyValid.filter((record) => sessionCounts.get(record.research_session_id) > 1).length;
  const eligible = structurallyValid.filter((record) => sessionCounts.get(record.research_session_id) === 1);
  const claimReady = eligible.length >= minimumSample;
  const blockers = eligible.flatMap((record) => record.blocker_codes);
  const blockerCounts = blockers.reduce((counts, code) => ({ ...counts, [code]: (counts[code] ?? 0) + 1 }), {});
  const postFixRetest = eligible.filter((record) => record.study_round === 'post_fix_retest');
  const instructionalReady = postFixRetest.length >= minimumInstructionalSample;
  return {
    data_source: 'real_user_research',
    total_records: records.length,
    structurally_valid_records: structurallyValid.length,
    duplicate_session_records: duplicateSessionRecords,
    eligible_records: eligible.length,
    minimum_sample: minimumSample,
    claim_ready: claimReady,
    post_fix_retest_records: postFixRetest.length,
    minimum_instructional_sample: minimumInstructionalSample,
    instructional_value_ready: instructionalReady,
    instructional_value_metrics: instructionalReady ? {
      sample_size: postFixRetest.length,
      specific_error_understanding_rate: rate(postFixRetest.filter((item) => item.specific_error_understood).length, postFixRetest.length),
      next_action_understanding_rate: rate(postFixRetest.filter((item) => item.next_action_understood).length, postFixRetest.length),
      practice_relevance_understanding_rate: rate(postFixRetest.filter((item) => item.practice_relevance_understood).length, postFixRetest.length)
    } : null,
    metrics: claimReady ? {
      unassisted_completion_rate: rate(eligible.filter((item) => item.unassisted_completion).length, eligible.length),
      evidence_selection_success_rate: rate(eligible.filter((item) => item.evidence_selection_success).length, eligible.length),
      diagnosis_comprehension_rate: rate(eligible.filter((item) => item.diagnosis_understood).length, eligible.length),
      median_completion_time_seconds: median(eligible.map((item) => Number(item.completion_time_seconds))),
      median_diagnosis_comprehension_time_seconds: median(eligible.map((item) => Number(item.diagnosis_comprehension_time_seconds))),
      blocker_frequency: Object.fromEntries(Object.entries(blockerCounts).sort((a, b) => b[1] - a[1]))
    } : null,
    limitation: duplicateSessionRecords > 0
      ? `${duplicateSessionRecords} structurally valid records reuse a research session and are excluded. At least ${minimumSample} unique eligible sessions are required.`
      : claimReady
        ? 'Exploratory usability evidence from a small target-user sample; not evidence of score improvement.'
        : `At least ${minimumSample} eligible, consented sessions are required before reporting aggregate usability metrics.`
  };
}

export function validateStudyAddition(records, record) {
  const validation = validateStudyRecord(record);
  if (!validation.valid) return validation;
  if (records.some((item) => item.participant_id === record.participant_id)) return { valid: false, errors: ['duplicate_participant_id'] };
  if (records.some((item) => item.research_session_id === record.research_session_id)) return { valid: false, errors: ['duplicate_research_session_id'] };
  return { valid: true, errors: [] };
}

export function loadStudyRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function loadStudyAudit() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUDIT_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveStudyRecord(record) {
  const records = loadStudyRecords();
  const validation = validateStudyAddition(records, record);
  if (!validation.valid) return validation;
  const stored = { ...structuredClone(record), revision: 1 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...records, stored]));
  appendAudit({ action: 'created', participant_id: stored.participant_id, occurred_at: new Date().toISOString(), to_revision: 1 });
  return { valid: true, errors: [] };
}

export function mergeStudyPayload(existingRecords, payload, occurredAt = new Date().toISOString()) {
  const errors = [];
  if (![2, 3].includes(payload?.schema_version)) errors.push('unsupported_import_schema');
  if (payload?.data_source !== 'real_user_research') errors.push('invalid_import_data_source');
  if (payload?.direct_identifiers_prohibited !== true) errors.push('identifier_prohibition_missing');
  if (!payload?.exported_at || Number.isNaN(Date.parse(payload.exported_at))) errors.push('invalid_import_timestamp');
  if (!Array.isArray(payload?.records) || payload.records.length > 500) errors.push('invalid_import_records');
  if (errors.length) return { valid: false, errors };

  const incoming = payload.records.map((record) => structuredClone(record));
  const participantIds = new Set();
  const sessionIds = new Set();
  for (const record of incoming) {
    const validation = validateStudyRecord(record);
    if (!validation.valid) errors.push(...validation.errors.map((error) => `${record?.participant_id ?? 'unknown'}:${error}`));
    if (participantIds.has(record?.participant_id)) errors.push(`duplicate_import_participant:${record.participant_id}`);
    if (sessionIds.has(record?.research_session_id)) errors.push(`duplicate_import_session:${record.research_session_id}`);
    participantIds.add(record?.participant_id);
    sessionIds.add(record?.research_session_id);
  }
  if (errors.length) return { valid: false, errors: [...new Set(errors)] };

  const additions = [];
  let skipped = 0;
  for (const record of incoming) {
    const sameParticipant = existingRecords.find((item) => item.participant_id === record.participant_id);
    const sameSession = existingRecords.find((item) => item.research_session_id === record.research_session_id);
    if (sameParticipant || sameSession) {
      if (sameParticipant && sameSession === sameParticipant && JSON.stringify(sameParticipant) === JSON.stringify(record)) {
        skipped += 1;
        continue;
      }
      errors.push(sameParticipant ? `import_participant_conflict:${record.participant_id}` : `import_session_conflict:${record.research_session_id}`);
      continue;
    }
    additions.push(record);
  }
  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    errors: [],
    records: [...structuredClone(existingRecords), ...additions],
    imported: additions.length,
    skipped,
    audit_entries: additions.map((record) => ({
      action: 'imported', participant_id: record.participant_id, occurred_at: occurredAt,
      source_schema_version: payload.schema_version, to_revision: Math.max(1, Number(record.revision) || 1)
    }))
  };
}

export function importStudyPayload(payload) {
  const result = mergeStudyPayload(loadStudyRecords(), payload);
  if (!result.valid) return result;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result.records));
  for (const entry of result.audit_entries) appendAudit(entry);
  return { valid: true, errors: [], imported: result.imported, skipped: result.skipped };
}

export function correctStudyRecord(participantId, replacement, reason) {
  const mutation = applyStudyCorrection(loadStudyRecords(), participantId, replacement, reason);
  if (!mutation.valid) return mutation;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mutation.records));
  appendAudit(mutation.audit_entry);
  return { valid: true, errors: [] };
}

export function withdrawStudyRecord(participantId, reason) {
  const mutation = applyStudyWithdrawal(loadStudyRecords(), participantId, reason);
  if (!mutation.valid) return mutation;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mutation.records));
  appendAudit(mutation.audit_entry);
  return { valid: true, errors: [] };
}

export function applyStudyCorrection(records, participantId, replacement, reason, occurredAt = new Date().toISOString()) {
  const index = records.findIndex((item) => item.participant_id === participantId);
  if (index < 0) return { valid: false, errors: ['record_not_found'] };
  if (replacement?.participant_id !== participantId) return { valid: false, errors: ['participant_id_cannot_change'] };
  if (!validReason(reason)) return { valid: false, errors: ['correction_reason_required'] };
  const original = records[index];
  if (replacement?.research_session_id !== original.research_session_id) return { valid: false, errors: ['research_session_id_cannot_change'] };
  const corrected = {
    ...structuredClone(replacement),
    completed_at: original.completed_at,
    revision: Math.max(1, Number(original.revision) || 1) + 1,
    corrected_at: occurredAt
  };
  const validation = validateStudyRecord(corrected);
  if (!validation.valid) return validation;
  const next = structuredClone(records);
  next[index] = corrected;
  return {
    valid: true,
    errors: [],
    records: next,
    audit_entry: {
      action: 'corrected', participant_id: participantId, occurred_at: occurredAt,
      reason: reason.trim(), from_revision: Math.max(1, Number(original.revision) || 1), to_revision: corrected.revision
    }
  };
}

export function applyStudyWithdrawal(records, participantId, reason, occurredAt = new Date().toISOString()) {
  const item = records.find((record) => record.participant_id === participantId);
  if (!item) return { valid: false, errors: ['record_not_found'] };
  if (!validReason(reason)) return { valid: false, errors: ['withdrawal_reason_required'] };
  return {
    valid: true,
    errors: [],
    records: records.filter((record) => record.participant_id !== participantId).map((record) => structuredClone(record)),
    audit_entry: {
      action: 'withdrawn', participant_id: participantId, occurred_at: occurredAt,
      reason: reason.trim(), from_revision: Math.max(1, Number(item.revision) || 1)
    }
  };
}

export function exportStudyPayload(records = loadStudyRecords(), audit = loadStudyAudit()) {
  return {
    schema_version: 3,
    data_source: 'real_user_research',
    exported_at: new Date().toISOString(),
    direct_identifiers_prohibited: true,
    direct_identifiers_verified: false,
    records,
    audit,
    summary: summarizeStudyRecords(records)
  };
}

function appendAudit(entry) {
  const audit = loadStudyAudit();
  localStorage.setItem(AUDIT_KEY, JSON.stringify([...audit, entry].slice(-500)));
}

function validReason(reason) {
  return typeof reason === 'string' && reason.trim().length >= 3 && reason.trim().length <= 200;
}

function rate(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 1000 : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2 * 1000) / 1000;
}

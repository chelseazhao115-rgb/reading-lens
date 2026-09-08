import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStudyCorrection, applyStudyWithdrawal, deriveSessionTelemetry, exportStudyPayload, mergeStudyPayload, summarizeStudyRecords, validateStudyAddition, validateStudyRecord
} from '../public/usability-store.js';

function record(id, overrides = {}) {
  const sessionId = `rs_${id.toLowerCase()}12345678`;
  const completion = overrides.completion_time_seconds ?? 180;
  const evidenceSuccess = overrides.evidence_selection_success ?? true;
  const telemetry = overrides.telemetry ?? {
    valid: true, core_event_chain_complete: true, research_session_id: sessionId, event_count: 5,
    required_event_chain: ['question_started', 'answer_submitted', 'evidence_submitted', 'diagnosis_completed', 'diagnosis_viewed'],
    started_at: '2026-08-22T00:00:00Z', completed_at: '2026-08-22T00:03:00Z',
    completion_time_seconds: completion, evidence_selection_success: evidenceSuccess, diagnosis_status: 'diagnosed',
    path_completion_verified: true, transfer_completed: true
  };
  return {
    participant_id: id,
    research_session_id: sessionId,
    telemetry_verified: true,
    telemetry,
    consent_confirmed: true,
    reading_band: '6.0',
    has_ielts_experience: true,
    accuracy_plateau: true,
    unassisted_completion: true,
    evidence_selection_success: true,
    diagnosis_understood: true,
    completion_time_seconds: 180,
    diagnosis_comprehension_time_seconds: 25,
    blocker_codes: [],
    observer_notes: '',
    completed_at: '2026-08-22T00:00:00Z',
    data_source: 'real_user_research',
    ...overrides
  };
}

function sessionEvents(sessionId) {
  return ['question_started', 'answer_submitted', 'evidence_submitted', 'diagnosis_completed', 'diagnosis_viewed'].map((event, index) => ({
    event,
    occurred_at: new Date(Date.parse('2026-08-22T00:00:00Z') + index * 1000).toISOString(),
    properties: { research_session_id: sessionId, ...(event === 'evidence_submitted' ? { method: 'passage_text' } : {}), ...(event === 'diagnosis_completed' ? { diagnosis_status: 'abstained' } : {}) }
  }));
}

test('session telemetry requires an ordered same-session product event chain', () => {
  const sessionId = 'rs_abcdef123456';
  const events = [...sessionEvents('rs_other123456'), ...sessionEvents(sessionId)];
  const result = deriveSessionTelemetry(events, sessionId);
  assert.equal(result.valid, true);
  assert.equal(result.event_count, 5);
  assert.equal(result.completion_time_seconds, 4);
  assert.equal(result.evidence_selection_success, true);
  assert.equal(result.diagnosis_status, 'abstained');
  assert.equal(result.path_completion_verified, true);
  const missing = deriveSessionTelemetry(events.filter((item) => !(item.properties.research_session_id === sessionId && item.event === 'diagnosis_viewed')), sessionId, '2026-08-22T00:00:08Z');
  assert.equal(missing.valid, true);
  assert.equal(missing.core_event_chain_complete, false);
  assert.deepEqual(missing.missing_events, ['diagnosis_viewed']);
  assert.equal(missing.completion_time_seconds, 8);
});

test('diagnosed session requires transfer completion before unassisted path can be claimed', () => {
  const sessionId = 'rs_diagnosed12345';
  const events = sessionEvents(sessionId).map((item) => item.event === 'diagnosis_completed'
    ? { ...item, properties: { ...item.properties, diagnosis_status: 'diagnosed' } } : item);
  const partial = deriveSessionTelemetry(events, sessionId);
  assert.equal(partial.valid, true);
  assert.equal(partial.path_completion_verified, false);
  const completed = deriveSessionTelemetry([...events, {
    event: 'transfer_completed', occurred_at: '2026-08-22T00:00:10Z', properties: { research_session_id: sessionId, correct: false }
  }], sessionId);
  assert.equal(completed.path_completion_verified, true);
  assert.equal(completed.completion_time_seconds, 10);
  assert.match(validateStudyRecord(record('P099', { telemetry: partial, research_session_id: sessionId })).errors.join(','), /unassisted_completion_requires_verified_path/);
});

test('usability record requires consent and target-user eligibility', () => {
  assert.equal(validateStudyRecord(record('P001')).valid, true);
  assert.deepEqual(validateStudyRecord(record('P002', { consent_confirmed: false })).errors, ['consent_required']);
  assert.match(validateStudyRecord(record('P003', { reading_band: '7.5' })).errors[0], /outside_target_band/);
});

test('usability metrics remain null below five eligible sessions', () => {
  const summary = summarizeStudyRecords([record('P001'), record('P002')]);
  assert.equal(summary.data_source, 'real_user_research');
  assert.equal(summary.claim_ready, false);
  assert.equal(summary.metrics, null);
});

test('five sessions produce exploratory rates and medians without score claims', () => {
  const records = [
    record('P001', { completion_time_seconds: 100 }),
    record('P002', { completion_time_seconds: 120, unassisted_completion: false, blocker_codes: ['evidence_selection'] }),
    record('P003', { completion_time_seconds: 140 }),
    record('P004', { completion_time_seconds: 160, diagnosis_understood: false, blocker_codes: ['diagnosis_comprehension'] }),
    record('P005', { completion_time_seconds: 180 })
  ];
  const summary = summarizeStudyRecords(records);
  assert.equal(summary.claim_ready, true);
  assert.equal(summary.metrics.unassisted_completion_rate, 0.8);
  assert.equal(summary.metrics.diagnosis_comprehension_rate, 0.8);
  assert.equal(summary.metrics.median_completion_time_seconds, 140);
  assert.match(summary.limitation, /not evidence of score improvement/);
});

test('post-fix teaching-value metrics stay separate from baseline and require three new users', () => {
  const baseline = [record('P001'), record('P002'), record('P003'), record('P004'), record('P005')];
  const twoRetests = [
    record('P006', { study_round: 'post_fix_retest', specific_error_understood: true, next_action_understood: true, practice_relevance_understood: false }),
    record('P007', { study_round: 'post_fix_retest', specific_error_understood: true, next_action_understood: false, practice_relevance_understood: true })
  ];
  const partial = summarizeStudyRecords([...baseline, ...twoRetests]);
  assert.equal(partial.claim_ready, true);
  assert.equal(partial.post_fix_retest_records, 2);
  assert.equal(partial.instructional_value_metrics, null);
  const complete = summarizeStudyRecords([...baseline, ...twoRetests,
    record('P008', { study_round: 'post_fix_retest', specific_error_understood: false, next_action_understood: true, practice_relevance_understood: true })
  ]);
  assert.deepEqual(complete.instructional_value_metrics, {
    sample_size: 3,
    specific_error_understanding_rate: 0.667,
    next_action_understanding_rate: 0.667,
    practice_relevance_understanding_rate: 0.667
  });
});

test('post-fix records require all three structured teaching-value observations', () => {
  const result = validateStudyRecord(record('P009', { study_round: 'post_fix_retest' }));
  assert.match(result.errors.join(','), /specific_error_understood_required/);
  assert.match(result.errors.join(','), /next_action_understood_required/);
  assert.match(result.errors.join(','), /practice_relevance_understood_required/);
});

test('one product event session cannot be counted as multiple participants', () => {
  const first = record('P006');
  const reused = record('P007', {
    research_session_id: first.research_session_id,
    telemetry: { ...first.telemetry, research_session_id: first.research_session_id }
  });
  assert.deepEqual(validateStudyAddition([first], reused).errors, ['duplicate_research_session_id']);
  const padded = [first, reused, record('P008'), record('P009'), record('P010')];
  const summary = summarizeStudyRecords(padded, 4);
  assert.equal(summary.structurally_valid_records, 5);
  assert.equal(summary.duplicate_session_records, 2);
  assert.equal(summary.eligible_records, 3);
  assert.equal(summary.claim_ready, false);
  assert.equal(summary.metrics, null);
  assert.match(summary.limitation, /reuse a research session and are excluded/);
});

test('export payload labels real user research without claiming automated identity verification', () => {
  const payload = exportStudyPayload([record('P001')]);
  assert.equal(payload.data_source, 'real_user_research');
  assert.equal(payload.direct_identifiers_prohibited, true);
  assert.equal(payload.direct_identifiers_verified, false);
  assert.equal(payload.schema_version, 3);
  assert.equal(payload.summary.metrics, null);
});

test('v2 export can be restored without trusting its saved summary', () => {
  const payload = exportStudyPayload([record('P040'), record('P041')], []);
  payload.schema_version = 2;
  payload.summary = { claim_ready: true, metrics: { unassisted_completion_rate: 999 } };
  const result = mergeStudyPayload([], payload, '2026-08-31T12:00:00Z');
  assert.equal(result.valid, true);
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 0);
  assert.equal(summarizeStudyRecords(result.records).claim_ready, false);
  assert.deepEqual(result.audit_entries.map((item) => item.action), ['imported', 'imported']);
});

test('import skips byte-identical records but rejects conflicting identities atomically', () => {
  const existing = [record('P042')];
  const identical = exportStudyPayload([structuredClone(existing[0])], []);
  const skipped = mergeStudyPayload(existing, identical);
  assert.equal(skipped.valid, true);
  assert.equal(skipped.imported, 0);
  assert.equal(skipped.skipped, 1);
  const conflicting = exportStudyPayload([record('P042', { observer_notes: '不同记录' })], []);
  const rejected = mergeStudyPayload(existing, conflicting);
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join(','), /import_participant_conflict/);
  assert.equal('records' in rejected, false);
});

test('import rejects duplicate sessions inside a payload and unsupported schemas', () => {
  const first = record('P043');
  const second = record('P044', { research_session_id: first.research_session_id, telemetry: { ...first.telemetry } });
  const duplicate = mergeStudyPayload([], exportStudyPayload([first, second], []));
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors.join(','), /duplicate_import_session/);
  const unsupported = exportStudyPayload([], []);
  unsupported.schema_version = 99;
  assert.deepEqual(mergeStudyPayload([], unsupported).errors, ['unsupported_import_schema']);
});

test('obvious phone numbers and email addresses are rejected from observer notes', () => {
  assert.match(validateStudyRecord(record('P010', { observer_notes: '联系邮箱 student@example.com' })).errors[0], /prohibited_identifier/);
  assert.match(validateStudyRecord(record('P011', { observer_notes: '手机号 13812345678' })).errors[0], /prohibited_identifier/);
});

test('correction preserves participant identity and session time while incrementing revision', () => {
  const original = record('P020', { revision: 1, unassisted_completion: false });
  const replacement = record('P020', { unassisted_completion: true, completed_at: '2099-01-01T00:00:00Z' });
  const result = applyStudyCorrection([original], 'P020', replacement, '研究者误录', '2026-08-23T00:00:00Z');
  assert.equal(result.valid, true);
  assert.equal(result.records[0].revision, 2);
  assert.equal(result.records[0].completed_at, original.completed_at);
  assert.equal(result.records[0].unassisted_completion, true);
  assert.deepEqual(result.audit_entry, {
    action: 'corrected', participant_id: 'P020', occurred_at: '2026-08-23T00:00:00Z',
    reason: '研究者误录', from_revision: 1, to_revision: 2
  });
});

test('correction cannot change participant id and requires a reason', () => {
  const original = record('P021');
  assert.deepEqual(applyStudyCorrection([original], 'P021', record('P999'), '有效原因').errors, ['participant_id_cannot_change']);
  assert.deepEqual(applyStudyCorrection([original], 'P021', original, '').errors, ['correction_reason_required']);
  assert.deepEqual(applyStudyCorrection([original], 'P021', { ...original, research_session_id: 'rs_changed123456' }, '有效原因').errors, ['research_session_id_cannot_change']);
});

test('withdrawal removes only the named record and audit excludes response content', () => {
  const records = [record('P030'), record('P031')];
  const result = applyStudyWithdrawal(records, 'P030', '参与者要求撤回', '2026-08-23T00:00:00Z');
  assert.equal(result.valid, true);
  assert.deepEqual(result.records.map((item) => item.participant_id), ['P031']);
  assert.deepEqual(Object.keys(result.audit_entry).sort(), ['action', 'from_revision', 'occurred_at', 'participant_id', 'reason']);
  assert.equal(JSON.stringify(result.audit_entry).includes('observer_notes'), false);
});

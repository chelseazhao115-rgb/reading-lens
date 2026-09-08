import test from 'node:test';
import assert from 'node:assert/strict';
import { clearWorkflowDraft, emptyWorkflowDraft, isTerminalDiagnosticStatus, loadWorkflowDraft, registerAcceptedEvidence, registerDiagnosticAttempt, saveWorkflowDraft } from '../public/workflow-store.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key)
  };
}

test('workflow draft preserves form, diagnosis and transfer handoff across reload', () => {
  const storage = memoryStorage();
  const draft = emptyWorkflowDraft();
  draft.started = true;
  draft.form = { answer: 'FALSE', evidence: 'Exact passage quote', reasoning: 'I compared the contrast.' };
  draft.diagnosis = { result: { status: 'diagnosed', primary_error: 'location' }, payload: { question: 'Q' } };
  draft.exercise = {
    current: { id: 'location_immediate_01', stage: 'immediate', options: ['A', 'B'] },
    attempts: 1, hints_used: 1, feedback: '回答正确。',
    pending_next: { id: 'location_transfer_01', stage: 'transfer', options: ['A', 'B'] }
  };
  saveWorkflowDraft(draft, storage);
  assert.deepEqual(loadWorkflowDraft(storage), draft);
});

test('workflow draft fails closed for corrupt or incompatible persisted state', () => {
  const storage = memoryStorage({ 'reading-lens-workflow-v1': '{broken' });
  assert.deepEqual(loadWorkflowDraft(storage), emptyWorkflowDraft());
  storage.setItem('reading-lens-workflow-v1', JSON.stringify({ schema_version: 99, started: true }));
  assert.deepEqual(loadWorkflowDraft(storage), emptyWorkflowDraft());
});

test('clear workflow removes only the workflow draft', () => {
  const storage = memoryStorage({ 'reading-lens-workflow-v1': '{}', other: 'keep' });
  clearWorkflowDraft(storage);
  assert.equal(storage.getItem('reading-lens-workflow-v1'), null);
  assert.equal(storage.getItem('other'), 'keep');
});

test('workflow drafts are isolated by anonymous research session', () => {
  const storage = memoryStorage();
  const first = emptyWorkflowDraft();
  first.form.answer = 'TRUE';
  const second = emptyWorkflowDraft();
  second.form.answer = 'FALSE';
  saveWorkflowDraft(first, storage, 'rs_first12345678');
  saveWorkflowDraft(second, storage, 'rs_second1234567');
  assert.equal(loadWorkflowDraft(storage, 'rs_first12345678').form.answer, 'TRUE');
  assert.equal(loadWorkflowDraft(storage, 'rs_second1234567').form.answer, 'FALSE');
  assert.equal(loadWorkflowDraft(storage).form.answer, '');
});

test('schema v1 workflow migrates without deleting form or diagnosis state', () => {
  const legacy = {
    schema_version: 1, started: true,
    form: { answer: 'FALSE', evidence: 'Exact quote', reasoning: 'Legacy reasoning text.' },
    diagnosis: { result: { status: 'correct' }, payload: { question: 'Legacy question' } }, exercise: null
  };
  const storage = memoryStorage({ 'reading-lens-workflow-v1': JSON.stringify(legacy) });
  const migrated = loadWorkflowDraft(storage);
  assert.equal(migrated.schema_version, 3);
  assert.equal(migrated.question_id, 'demo_fox_001');
  assert.equal(migrated.form.evidence, 'Exact quote');
  assert.equal(migrated.diagnosis.result.status, 'correct');
});

test('diagnostic retries record one answer and one accepted evidence duration', () => {
  const initial = emptyWorkflowDraft();
  const first = registerDiagnosticAttempt(initial);
  assert.equal(first.first_answer_submission, true);
  assert.equal(first.draft.diagnostic_attempts, 1);
  const retry = registerDiagnosticAttempt(first.draft);
  assert.equal(retry.first_answer_submission, false);
  assert.equal(retry.draft.diagnostic_attempts, 2);
  const accepted = registerAcceptedEvidence(retry.draft);
  assert.equal(accepted.record_submission, true);
  assert.equal(accepted.record_time, true);
  const duplicate = registerAcceptedEvidence(accepted.draft);
  assert.equal(duplicate.record_submission, false);
  assert.equal(duplicate.record_time, false);
});

test('diagnostic retry de-duplication survives a page reload', () => {
  const storage = memoryStorage();
  const first = registerDiagnosticAttempt(emptyWorkflowDraft());
  saveWorkflowDraft(first.draft, storage, 'rs_retry12345678');
  const restored = loadWorkflowDraft(storage, 'rs_retry12345678');
  const retry = registerDiagnosticAttempt(restored);
  assert.equal(retry.first_answer_submission, false);
  assert.equal(retry.draft.diagnostic_attempts, 2);
  const accepted = registerAcceptedEvidence(retry.draft);
  saveWorkflowDraft(accepted.draft, storage, 'rs_retry12345678');
  const acceptedAfterReload = registerAcceptedEvidence(loadWorkflowDraft(storage, 'rs_retry12345678'));
  assert.equal(acceptedAfterReload.record_submission, false);
  assert.equal(acceptedAfterReload.record_time, false);
});

test('only completed diagnostic outcomes lock the current question', () => {
  assert.equal(isTerminalDiagnosticStatus('diagnosed'), true);
  assert.equal(isTerminalDiagnosticStatus('correct'), true);
  assert.equal(isTerminalDiagnosticStatus('abstained'), true);
  assert.equal(isTerminalDiagnosticStatus('evidence_validation_failed'), false);
  assert.equal(isTerminalDiagnosticStatus('provider_failure'), false);
});

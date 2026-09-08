import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateResearchSession, activeResearchSession, addEvent, emptyState, loadState, saveState, stateStorageKey
} from '../public/learner-store.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('valid research session is activated while invalid URL clears it', () => {
  const storage = memoryStorage();
  assert.equal(activateResearchSession('?research_session=rs_abcdef123456', storage), 'rs_abcdef123456');
  assert.equal(activeResearchSession(storage), 'rs_abcdef123456');
  assert.equal(activateResearchSession('?research_session=invalid', storage), null);
  assert.equal(activeResearchSession(storage), null);
});

test('active research session is attached to a product event', () => {
  const storage = memoryStorage();
  activateResearchSession('?research_session=rs_abcdef123456', storage);
  const original = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
  try {
    const next = addEvent(emptyState(), 'question_started');
    assert.equal(next.events[0].properties.research_session_id, 'rs_abcdef123456');
  } finally {
    Object.defineProperty(globalThis, 'sessionStorage', { value: original, configurable: true });
  }
});

test('learner state is isolated between demo and anonymous research sessions', () => {
  const storage = memoryStorage();
  const demo = emptyState();
  demo.error_counts.location = 2;
  const first = emptyState();
  first.error_counts.paraphrase = 1;
  const second = emptyState();
  second.error_counts.over_inference = 1;
  saveState(demo, null, storage);
  saveState(first, 'rs_first12345678', storage);
  saveState(second, 'rs_second1234567', storage);
  assert.equal(loadState(null, storage).error_counts.location, 2);
  assert.equal(loadState('rs_first12345678', storage).error_counts.paraphrase, 1);
  assert.equal(loadState('rs_first12345678', storage).error_counts.over_inference, 0);
  assert.equal(loadState('rs_second1234567', storage).error_counts.over_inference, 1);
  assert.notEqual(stateStorageKey('rs_first12345678'), stateStorageKey('rs_second1234567'));
});

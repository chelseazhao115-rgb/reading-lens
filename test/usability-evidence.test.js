import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateUsabilitySummaryArtifact } from '../src/usability-evidence.js';

const artifact = JSON.parse(fs.readFileSync(new URL('../evidence/usability-pilot-001-summary.json', import.meta.url), 'utf8'));

test('sanitized usability artifact is valid and contains no participant-level data', () => {
  assert.deepEqual(validateUsabilitySummaryArtifact(artifact), { valid: true, errors: [] });
  const serialized = JSON.stringify(artifact);
  for (const key of ['records', 'audit', 'participant_id', 'research_session_id', 'observer_notes']) {
    assert.equal(serialized.includes(`\"${key}\"`), false);
  }
  assert.equal(artifact.sample.eligible_records, 5);
  assert.equal(artifact.metrics.diagnosis_comprehension.rate, 0.8);
  assert.equal(artifact.post_fix_retest.eligible_records, 3);
  assert.equal(artifact.post_fix_retest.instructional_value_metrics.specific_error_understanding_rate, 1);
});

test('usability artifact rejects inconsistent rates and participant-level fields', () => {
  const tampered = structuredClone(artifact);
  tampered.metrics.diagnosis_comprehension.rate = 1;
  tampered.records = [];
  const validation = validateUsabilitySummaryArtifact(tampered);
  assert.match(validation.errors.join(','), /diagnosis_comprehension_rate_mismatch/);
  assert.match(validation.errors.join(','), /prohibited_key_records/);
});

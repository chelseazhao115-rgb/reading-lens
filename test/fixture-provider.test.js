import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFixtureProvider, validateFixture } from '../evals/fixture-provider.js';
import { DIAGNOSTIC_PROMPT_HASH } from '../src/prompts/diagnostic-prompt.js';

const ids = ['case-a'];
const output = {
  status: 'abstained', primary_error: 'insufficient_information', confidence: 0.5,
  reason: 'More information is required.'
};

test('prompt pack contains every challenge input without gold labels', () => {
  const lines = fs.readFileSync(new URL('../evals/provider-prompt-pack.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
  const manifest = lines[0];
  assert.equal(manifest.gold_labels_included, false);
  assert.equal(lines.length, manifest.total + 1);
  for (const item of lines.slice(1)) {
    assert.equal(item.record_type, 'case');
    assert.equal('gold_primary_error' in item, false);
    const userPayload = JSON.parse(item.request.messages.find((message) => message.role === 'user').content);
    assert.equal('gold_primary_error' in userPayload.input, false);
    assert.equal('expected' in item, false);
    assert.equal(item.request.prompt_hash, manifest.prompt_hash);
  }
});

test('fixture validation rejects missing duplicate unknown and invalid telemetry', () => {
  const fixture = {
    metadata: { provider_id: 'offline-model', prompt_version: 'p1', prompt_hash: DIAGNOSTIC_PROMPT_HASH, model_version: 'm1' },
    results: [
      { id: 'case-a', output, latency_ms: -1, cost_usd: 0 },
      { id: 'case-a', output, latency_ms: 1, cost_usd: 0 },
      { id: 'case-b', output, latency_ms: 1, cost_usd: 0 }
    ]
  };
  const result = validateFixture(fixture, ids);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('duplicate_case:case-a'));
  assert.ok(result.errors.includes('unknown_case:case-b'));
  assert.ok(result.errors.includes('invalid_latency:case-a'));
});

test('fixture provider replays output with recorded cost and latency', async () => {
  const fixture = {
    metadata: { provider_id: 'offline-model', prompt_version: 'p1', prompt_hash: DIAGNOSTIC_PROMPT_HASH, model_version: 'm1' },
    results: [{ id: 'case-a', output, latency_ms: 450, cost_usd: 0.002 }]
  };
  const provider = createFixtureProvider(fixture, ids);
  const result = await provider.diagnose({ id: 'case-a' });
  assert.equal(provider.id, 'offline-model');
  assert.equal(provider.promptHash, DIAGNOSTIC_PROMPT_HASH);
  assert.equal(result.model_cost_usd, 0.002);
  assert.equal(result.benchmark_recorded_latency_ms, 450);
});

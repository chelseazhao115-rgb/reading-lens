import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDeepSeekResponsesProvider, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION, tokenCost } from '../src/providers/openai-compatible-responses-provider.js';
import { runProviderBenchmark } from '../evals/provider-benchmark.js';

const input = { id: 'x', passage: 'A useful sentence.', question_type: 'TRUE_FALSE_NOT_GIVEN', question: 'It is useful.', correct_answer: 'TRUE', user_answer: 'FALSE', standard_evidence: { quote: 'A useful sentence.' }, user_evidence: { quote: 'A useful sentence.' }, reasoning_process: 'I misunderstood what the sentence said in this example.', gold_primary_error: 'sentence_comprehension' };
const output = { status: 'diagnosed', primary_error: 'sentence_comprehension', secondary_error: null, confidence: 0.8, reason: 'Misread sentence.', evidence: { standard_quote_valid: true }, decision_trace: { evidence_location: 'pass', semantic_mapping: 'pass', sentence_understanding: 'fail', question_rule: 'not_assessed', reasoning_boundary: 'not_assessed' } };

test('DeepSeek reuses compatible Responses schema and records usage cost without exposing key', async () => {
  let request;
  const provider = createDeepSeekResponsesProvider({ apiKey: 'secret-test-key', fetchImpl: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }], usage: { input_tokens: 1000, output_tokens: 100 } }) };
  }});
  const result = await provider.diagnose(input);
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, 'https://api.deepseek.com/responses');
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.reasoning.effort, 'none');
  assert.equal(body.max_output_tokens, 800);
  assert.equal(result.model_cost_usd, tokenCost(1000, 100, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION));
  assert.equal(JSON.stringify(result).includes('secret-test-key'), false);
});

test('DeepSeek adapter retries one transient failure and never includes the key in an error', async () => {
  let calls = 0;
  const provider = createDeepSeekResponsesProvider({ apiKey: 'secret-test-key', fetchImpl: async () => {
    calls += 1;
    if (calls === 1) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ output_text: JSON.stringify(output), usage: { input_tokens: 1, output_tokens: 1 } }) };
  }});
  const result = await provider.diagnose(input);
  assert.equal(calls, 2);
  assert.equal(result.primary_error, 'sentence_comprehension');
  assert.equal(JSON.stringify(result).includes('secret-test-key'), false);
});

test('DeepSeek adapter retries invalid structured output and accumulates both call costs', async () => {
  let calls = 0;
  const bodies = [];
  const provider = createDeepSeekResponsesProvider({ apiKey: 'secret-test-key', fetchImpl: async (_url, init) => {
    calls += 1;
    bodies.push(JSON.parse(init.body));
    const value = calls === 1 ? { ...output, status: ['diagnosed'], confidence: 'high' } : output;
    return { ok: true, json: async () => ({ output_text: JSON.stringify(value), usage: { input_tokens: 100, output_tokens: 50 } }) };
  }});
  const result = await provider.diagnose(input);
  assert.equal(calls, 2);
  assert.equal(result.primary_error, 'sentence_comprehension');
  assert.equal(result.model_cost_usd, tokenCost(200, 100, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION));
  assert.equal(bodies[0].input.length, 2);
  assert.equal(bodies[1].input.length, 3);
  assert.match(bodies[1].input[2].content, /invalid_status, invalid_confidence/);
  assert.match(bodies[1].input[2].content, /Do not change the diagnosis merely to avoid validation/);
});

test('DeepSeek repair retry names a causal trace error without changing the requested diagnosis', async () => {
  let calls = 0;
  const bodies = [];
  const invalidTrace = { ...output, decision_trace: { ...output.decision_trace, question_rule: 'pass' } };
  const provider = createDeepSeekResponsesProvider({ apiKey: 'secret-test-key', fetchImpl: async (_url, init) => {
    calls += 1;
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ output_text: JSON.stringify(calls === 1 ? invalidTrace : output), usage: { input_tokens: 50, output_tokens: 25 } }) };
  }});
  const result = await provider.diagnose(input);
  assert.equal(calls, 2);
  assert.equal(result.primary_error, 'sentence_comprehension');
  assert.match(bodies[1].input[2].content, /decision_trace_causal_order_invalid/);
  assert.match(bodies[1].input[2].content, /Do not change the diagnosis merely to avoid validation/);
});

test('DeepSeek retries malformed output_text JSON with a bounded repair instruction', async () => {
  let calls = 0;
  const bodies = [];
  const provider = createDeepSeekResponsesProvider({ apiKey: 'secret-test-key', fetchImpl: async (_url, init) => {
    calls += 1;
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({
      output_text: calls === 1 ? '{"status":' : JSON.stringify(output),
      usage: { input_tokens: 80, output_tokens: 30 }
    }) };
  }});
  const result = await provider.diagnose(input);
  assert.equal(calls, 2);
  assert.equal(result.primary_error, 'sentence_comprehension');
  assert.match(bodies[1].input[2].content, /provider_output_json_invalid/);
  assert.equal(result.model_cost_usd, tokenCost(160, 60, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION));
});

test('DeepSeek exposes an allowlisted failure code after malformed JSON exhausts retries', async () => {
  const provider = createDeepSeekResponsesProvider({ apiKey: 'secret-test-key', fetchImpl: async () => ({
    ok: true,
    json: async () => ({ output_text: '{invalid', usage: { input_tokens: 20, output_tokens: 10 } })
  }) });
  await assert.rejects(() => provider.diagnose(input), (error) => {
    assert.equal(error.code, 'provider_output_json_invalid');
    assert.equal(error.model_cost_usd, tokenCost(40, 20, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION));
    assert.doesNotMatch(error.message, /secret-test-key/);
    return true;
  });
});

test('worst-case reservation includes every configured retry attempt', () => {
  const once = createDeepSeekResponsesProvider({ apiKey: 'x', maximumAttempts: 1, fetchImpl: async () => {} });
  const twice = createDeepSeekResponsesProvider({ apiKey: 'x', maximumAttempts: 2, fetchImpl: async () => {} });
  assert.ok(twice.estimateMaximumCostUsd(input) > once.estimateMaximumCostUsd(input) * 2);
});

test('v3 eight-case paid plan fits the one-cent hard cap with explicit 600-token outputs', () => {
  const cases = JSON.parse(fs.readFileSync(new URL('../evals/boundary-challenge.json', import.meta.url), 'utf8'));
  const provider = createDeepSeekResponsesProvider({ apiKey: 'budget-estimate-only', maxOutputTokens: 600, fetchImpl: async () => {} });
  const estimates = cases.map((item) => provider.estimateMaximumCostUsd(item));
  const smoke = estimates[0];
  const remaining = estimates.slice(1).reduce((sum, value) => sum + value, 0);
  assert.ok(smoke <= 0.0013);
  assert.ok(remaining <= 0.0087);
  assert.ok(smoke + remaining <= 0.01);
});

test('benchmark stops before a call whose worst-case reservation exceeds budget', async () => {
  let calls = 0;
  const provider = { id: 'paid', promptVersion: 'v', modelVersion: 'm', estimateMaximumCostUsd: () => 0.1, diagnose: async () => { calls += 1; return output; } };
  await assert.rejects(() => runProviderBenchmark(provider, [input], { maximumTotalCostUsd: 0.05 }), { code: 'provider_budget_guard' });
  assert.equal(calls, 0);
});

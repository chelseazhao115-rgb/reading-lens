import fs from 'node:fs';
import { ruleProvider } from '../src/providers/rule-provider.js';
import { runProviderBenchmark } from './provider-benchmark.js';
import { createFixtureProvider } from './fixture-provider.js';
import path from 'node:path';
import { createDeepSeekResponsesProvider } from '../src/providers/openai-compatible-responses-provider.js';

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, value = 'true'] = item.replace(/^--/, '').split('=');
  return [key, value];
}));
const providerName = args.provider ?? 'rule';
if (!['rule', 'fixture', 'deepseek'].includes(providerName)) throw new Error(`Unknown provider "${providerName}".`);
const maximumTotalCostUsd = Number(args['max-cost-usd'] ?? 0);
if (!Number.isFinite(maximumTotalCostUsd) || maximumTotalCostUsd < 0) throw new Error('max-cost-usd must be a non-negative number');
const maximumP95LatencyMs = Number(args['max-p95-ms'] ?? 5000);
if (!Number.isFinite(maximumP95LatencyMs) || maximumP95LatencyMs <= 0) throw new Error('max-p95-ms must be a positive number');
const maxOutputTokens = Number(args['max-output-tokens'] ?? 800);
if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 300 || maxOutputTokens > 2000) throw new Error('max-output-tokens must be an integer from 300 to 2000');

const allCases = JSON.parse(fs.readFileSync(new URL('./boundary-challenge.json', import.meta.url), 'utf8'));
const start = Number(args.start ?? 0);
const limit = Number(args.limit ?? allCases.length);
if (!Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit < 1) throw new Error('start and limit must be valid integers');
const cases = allCases.slice(start, start + limit);
let provider = ruleProvider;
let candidateRole = 'reference';
if (providerName === 'fixture') {
  if (!args.fixture) throw new Error('--fixture is required for fixture provider');
  const fixturePath = path.resolve(args.fixture);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  provider = createFixtureProvider(fixture, cases.map((item) => item.id));
  candidateRole = 'candidate';
}
if (providerName === 'deepseek') {
  if (!(maximumTotalCostUsd > 0)) throw new Error('DeepSeek evaluation requires an explicit positive --max-cost-usd cap');
  provider = createDeepSeekResponsesProvider({ apiKey: process.env.DEEPSEEK_API_KEY, model: args.model, maxOutputTokens });
  candidateRole = 'candidate';
  if (start > 0) {
    const smokeName = args.smoke ?? 'deepseek-smoke.json';
    if (!/^[a-zA-Z0-9._-]+\.json$/.test(smokeName)) throw new Error('smoke must be a safe JSON filename');
    const smokePath = new URL(`./results/${smokeName}`, import.meta.url);
    if (!fs.existsSync(smokePath)) throw new Error('Run and pass the one-case DeepSeek smoke test before remaining cases.');
    const smoke = JSON.parse(fs.readFileSync(smokePath, 'utf8'));
    if (smoke.provider?.model_version !== provider.modelVersion || smoke.provider?.prompt_hash !== provider.promptHash
      || smoke.provider?.prompt_version !== provider.promptVersion || smoke.dataset?.total !== 1
      || smoke.metrics?.output_guard_failure_rate !== 0 || smoke.cases?.[0]?.status === 'abstained') {
      throw new Error('Stored DeepSeek smoke test did not pass the model/output checks.');
    }
  }
}
const result = await runProviderBenchmark(provider, cases, { maximumTotalCostUsd, maximumP95LatencyMs, candidateRole });
const outputName = args.output ?? (providerName === 'deepseek' && start === 0 && limit === 1 ? 'deepseek-smoke.json' : 'provider-latest.json');
if (!/^[a-zA-Z0-9._-]+\.json$/.test(outputName)) throw new Error('output must be a safe JSON filename');
const outputPath = new URL(`./results/${outputName}`, import.meta.url);
fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

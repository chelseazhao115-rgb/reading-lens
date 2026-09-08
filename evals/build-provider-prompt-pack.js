import fs from 'node:fs';
import { buildDiagnosticPrompt, DIAGNOSTIC_PROMPT_HASH, DIAGNOSTIC_PROMPT_VERSION } from '../src/prompts/diagnostic-prompt.js';

const cases = JSON.parse(fs.readFileSync(new URL('./boundary-challenge.json', import.meta.url), 'utf8'));
const manifest = {
  record_type: 'manifest',
  pack_version: 'provider-prompt-pack-v1',
  prompt_version: DIAGNOSTIC_PROMPT_VERSION,
  prompt_hash: DIAGNOSTIC_PROMPT_HASH,
  data_origin: 'synthetic_adversarial_project_authored',
  total: cases.length,
  schema_path: 'docs/provider-output-contract.json',
  gold_labels_included: false
};
const rows = cases.map((sample) => ({
  record_type: 'case',
  custom_id: sample.id,
  request: buildDiagnosticPrompt(sample)
}));
const output = [manifest, ...rows].map((row) => JSON.stringify(row)).join('\n') + '\n';
fs.writeFileSync(new URL('./provider-prompt-pack.jsonl', import.meta.url), output);
console.log(JSON.stringify({ output: 'evals/provider-prompt-pack.jsonl', total: rows.length, gold_labels_included: false }, null, 2));

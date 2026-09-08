import { createHash } from 'node:crypto';
import { DEEPSEEK_BASE_URL, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION, DEFAULT_DEEPSEEK_MODEL, tokenCost } from './providers/openai-compatible-responses-provider.js';

export const VOCABULARY_PROMPT_VERSION = 'vocabulary-context-v1';
const SYSTEM_PROMPT = `You are the vocabulary enrichment component of Reading Lens for IELTS learners. Explain only the selected English word or phrase as it is used in the supplied sentence. Do not invent pronunciation, grammar, or meaning. Use concise learner-friendly language. Return only the requested JSON structure.`;
export const VOCABULARY_PROMPT_HASH = createHash('sha256').update(SYSTEM_PROMPT).digest('hex');
export const VOCABULARY_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['headword','part_of_speech','ipa','contextual_meaning_zh','simple_definition_en','usage_note'],
  properties: Object.fromEntries(['headword','part_of_speech','ipa','contextual_meaning_zh','simple_definition_en','usage_note'].map((key) => [key, { type: 'string' }]))
});

export function validateVocabularyRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('input_must_be_object');
  const term = clean(value.term); const sentence = clean(value.sentence); const context = clean(value.context);
  if (!term || !sentence) return invalid('missing_required_fields');
  if (term.length > 120) return invalid('term_too_long');
  if (sentence.length > 1000 || context.length > 1600) return invalid('context_too_long');
  if (!sentence.toLocaleLowerCase('en').includes(term.toLocaleLowerCase('en'))) return invalid('term_not_in_sentence');
  return { valid: true, value: { term, sentence, context } };
}

export function validateVocabularyOutput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('output_must_be_object');
  const allowed = Object.keys(VOCABULARY_SCHEMA.properties);
  if (Object.keys(value).some((key) => !allowed.includes(key))) return invalid('unknown_output_field');
  const result = Object.fromEntries(allowed.map((key) => [key, clean(value[key])]));
  if (allowed.some((key) => !result[key]) || Object.values(result).some((field) => field.length > 500)) return invalid('invalid_output_field');
  return { valid: true, value: result };
}

export function createVocabularyEnricher(options = {}) {
  const apiKey = options.apiKey; const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const model = options.model ?? DEFAULT_DEEPSEEK_MODEL; const timeoutMs = options.timeoutMs ?? 10000;
  const maxOutputTokens = options.maxOutputTokens ?? 320; const maxCostUsd = options.maxCostUsd ?? 0.0005;
  return {
    available: Boolean(apiKey),
    async enrich(input) {
      if (!apiKey) throw coded('vocabulary_provider_unavailable');
      const request = validateVocabularyRequest(input); if (!request.valid) throw coded(request.error);
      const prompt = JSON.stringify(request.value);
      const estimated = tokenCost(Math.ceil((SYSTEM_PROMPT.length + prompt.length) / 2), maxOutputTokens, DEEPSEEK_FLASH_PRICE_USD_PER_MILLION);
      if (estimated > maxCostUsd) throw coded('vocabulary_budget_exceeded');
      const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${DEEPSEEK_BASE_URL}/responses`, {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input: [{ role:'system', content:SYSTEM_PROMPT }, { role:'user', content:prompt }], reasoning:{ effort:'none' }, max_output_tokens:maxOutputTokens, text:{ format:{ type:'json_schema', name:'reading_lens_vocabulary', schema:VOCABULARY_SCHEMA } } })
        });
        if (!response.ok) throw coded('vocabulary_provider_http_error');
        const payload = await response.json(); const raw = extractOutputText(payload);
        let parsed; try { parsed = JSON.parse(raw); } catch { throw coded('vocabulary_output_json_invalid'); }
        const validation = validateVocabularyOutput(parsed); if (!validation.valid) throw coded('vocabulary_output_contract_failed');
        const cost = tokenCost(Number(payload.usage?.input_tokens ?? 0), Number(payload.usage?.output_tokens ?? 0), DEEPSEEK_FLASH_PRICE_USD_PER_MILLION);
        if (cost > maxCostUsd) throw coded('vocabulary_observed_budget_exceeded');
        return { ...validation.value, provider:'deepseek-responses', model_version:model, prompt_version:VOCABULARY_PROMPT_VERSION, prompt_hash:VOCABULARY_PROMPT_HASH, model_cost_usd:cost };
      } catch (error) {
        if (error?.name === 'AbortError') throw coded('vocabulary_provider_timeout');
        if (error?.code) throw error;
        throw coded('vocabulary_provider_failed');
      } finally { clearTimeout(timer); }
    }
  };
}

function extractOutputText(payload) { if (typeof payload?.output_text === 'string') return payload.output_text; for (const item of payload?.output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text') return content.text; return ''; }
function clean(value) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''; }
function invalid(error) { return { valid:false, error }; }
function coded(code) { return Object.assign(new Error(code), { code }); }

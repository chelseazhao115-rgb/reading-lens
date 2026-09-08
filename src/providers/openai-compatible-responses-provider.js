import { buildDiagnosticPrompt, buildDiagnosticRepairMessage, DIAGNOSTIC_PROMPT_HASH, DIAGNOSTIC_PROMPT_VERSION, MAX_DIAGNOSTIC_REPAIR_MESSAGE_CHARS } from '../prompts/diagnostic-prompt.js';
import { validateProviderOutput } from '../provider-output.js';

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_FLASH_PRICE_USD_PER_MILLION = Object.freeze({ input_cache_miss: 0.14, output: 0.28 });
export const DEFAULT_MAX_OUTPUT_TOKENS = 800;

const traceState = { type: 'string', enum: ['pass', 'fail', 'not_assessed'] };
export const DIAGNOSTIC_RESPONSE_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['status', 'primary_error', 'secondary_error', 'confidence', 'reason', 'evidence', 'decision_trace'],
  properties: {
    status: { type: 'string', enum: ['diagnosed', 'correct', 'abstained'] },
    primary_error: { enum: ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference', 'insufficient_information', 'ambiguous_question', 'data_error', null] },
    secondary_error: { enum: ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference', null] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
    evidence: { type: 'object', additionalProperties: false, required: ['standard_quote_valid'], properties: { standard_quote_valid: { type: 'boolean', const: true } } },
    decision_trace: {
      type: 'object', additionalProperties: false,
      required: ['evidence_location', 'semantic_mapping', 'sentence_understanding', 'question_rule', 'reasoning_boundary'],
      properties: { evidence_location: traceState, semantic_mapping: traceState, sentence_understanding: traceState, question_rule: traceState, reasoning_boundary: traceState }
    }
  }
});

export function createOpenAICompatibleResponsesProvider(options) {
  const { apiKey, baseUrl, model, prices, providerId, fetchImpl = globalThis.fetch } = options;
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const maximumAttempts = options.maximumAttempts ?? 2;
  if (!apiKey) throw new Error(`${options.apiKeyEnvironmentVariable ?? 'API key'} is required; never paste it into chat or commit it.`);
  if (!baseUrl?.startsWith('https://')) throw new Error('Provider baseUrl must use HTTPS.');
  return {
    id: providerId, promptVersion: DIAGNOSTIC_PROMPT_VERSION, promptHash: DIAGNOSTIC_PROMPT_HASH, modelVersion: model,
    estimateMaximumCostUsd(input) {
      const chars = buildDiagnosticPrompt(input).messages.reduce((sum, message) => sum + message.content.length, 0);
      const firstAttempt = tokenCost(Math.ceil(chars / 2), maxOutputTokens, prices);
      const repairAttempt = tokenCost(Math.ceil((chars + MAX_DIAGNOSTIC_REPAIR_MESSAGE_CHARS) / 2), maxOutputTokens, prices);
      return firstAttempt + Math.max(0, maximumAttempts - 1) * repairAttempt;
    },
    async diagnose(input, { signal } = {}) {
      const prompt = buildDiagnosticPrompt(input);
      let lastError;
      let accumulatedCostUsd = 0;
      let lastValidationErrors = null;
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        try {
          const messages = attempt > 1 && lastValidationErrors
            ? [...prompt.messages, { role: 'system', content: buildDiagnosticRepairMessage(lastValidationErrors) }]
            : prompt.messages;
          const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/responses`, {
            method: 'POST', signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model, input: messages, reasoning: { effort: 'none' }, max_output_tokens: maxOutputTokens,
              text: { format: { type: 'json_schema', name: 'reading_lens_diagnosis', schema: DIAGNOSTIC_RESPONSE_SCHEMA } }
            })
          });
          if (!response.ok) {
            const error = Object.assign(new Error(`Provider returned HTTP ${response.status}`), { code: 'provider_http_error', retryable: response.status === 429 || response.status >= 500 });
            throw error;
          }
          let payload;
          try {
            payload = await response.json();
          } catch {
            throw Object.assign(new Error('Provider response body was not valid JSON'), {
              code: 'provider_response_json_invalid', retryable: true
            });
          }
          const responseCostUsd = tokenCost(Number(payload.usage?.input_tokens ?? 0), Number(payload.usage?.output_tokens ?? 0), prices);
          accumulatedCostUsd += responseCostUsd;
          const text = extractOutputText(payload);
          if (!text) throw Object.assign(new Error('Provider response contained no output_text'), { code: 'provider_empty_output', retryable: true });
          let value;
          try {
            value = JSON.parse(text);
          } catch {
            lastValidationErrors = ['provider_output_json_invalid'];
            throw Object.assign(new Error('Provider output_text was not valid JSON'), {
              code: 'provider_output_json_invalid', retryable: true,
              validationErrors: lastValidationErrors
            });
          }
          const validation = validateProviderOutput(value);
          if (!validation.valid) {
            lastValidationErrors = validation.errors;
            throw Object.assign(new Error('Provider response failed the local output contract'), {
              code: 'provider_structured_output_invalid', retryable: true, validationErrors: validation.errors
            });
          }
          return { ...value, model_cost_usd: accumulatedCostUsd };
        } catch (error) {
          lastError = error;
          error.model_cost_usd = accumulatedCostUsd;
          if (signal?.aborted || !error.retryable || attempt === maximumAttempts) throw error;
        }
      }
      throw lastError;
    }
  };
}

export function createDeepSeekResponsesProvider(options = {}) {
  const model = options.model ?? DEFAULT_DEEPSEEK_MODEL;
  if (model !== DEFAULT_DEEPSEEK_MODEL) throw new Error(`Unsupported priced DeepSeek model: ${model}`);
  return createOpenAICompatibleResponsesProvider({
    ...options, model, baseUrl: DEEPSEEK_BASE_URL, providerId: 'deepseek-responses',
    apiKeyEnvironmentVariable: 'DEEPSEEK_API_KEY', prices: DEEPSEEK_FLASH_PRICE_USD_PER_MILLION
  });
}

export function tokenCost(inputTokens, outputTokens, prices) {
  return (inputTokens * prices.input_cache_miss + outputTokens * prices.output) / 1_000_000;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  for (const item of payload.output ?? []) for (const content of item.content ?? []) if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
  return null;
}

import { createHash } from 'node:crypto';

const LIMITS = Object.freeze({
  source_url: 2048,
  question_number: 24,
  question_type: 80,
  passage: 30000,
  question: 3000,
  answer: 1000,
  evidence: 5000,
  reasoning_process: 3000,
  adapter_version: 80
});

export function canonicalizeExternalDiagnosticInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('input_must_be_object');
  if (value.source !== 'idictation') return invalid('unsupported_source');

  const sourceUrl = cleanString(value.source_url);
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { return invalid('invalid_source_url'); }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'www.idictation.cn' || !parsedUrl.pathname.startsWith('/ielts/read-result/read-jy/')) {
    return invalid('unsupported_source_url');
  }

  const fields = {
    question_number: cleanString(value.question_number),
    question_type: cleanString(value.question_type),
    passage: cleanString(value.passage),
    question: cleanString(value.question),
    user_answer: cleanString(value.user_answer),
    correct_answer: cleanString(value.correct_answer),
    user_evidence: cleanString(value.user_evidence),
    standard_evidence: cleanString(value.standard_evidence),
    reasoning_process: cleanString(value.reasoning_process),
    adapter_version: cleanString(value.adapter_version)
  };
  const missing = Object.entries(fields).filter(([, field]) => !field).map(([key]) => key);
  if (missing.length) return invalid('missing_required_fields', { missing_fields: missing });

  const lengths = {
    source_url: sourceUrl.length,
    question_number: fields.question_number.length,
    question_type: fields.question_type.length,
    passage: fields.passage.length,
    question: fields.question.length,
    answer: Math.max(fields.user_answer.length, fields.correct_answer.length),
    evidence: Math.max(fields.user_evidence.length, fields.standard_evidence.length),
    reasoning_process: fields.reasoning_process.length,
    adapter_version: fields.adapter_version.length
  };
  const oversized = Object.entries(lengths).find(([key, length]) => length > LIMITS[key]);
  if (oversized) return invalid('field_too_long', { field: oversized[0], max_length: LIMITS[oversized[0]] });

  const options = normalizeOptions(value.options);
  if (!options.valid) return options;
  const contentHash = createHash('sha256').update(JSON.stringify({
    passage: fields.passage, question: fields.question, options: options.value,
    correct_answer: fields.correct_answer, standard_evidence: fields.standard_evidence
  })).digest('hex');

  return {
    valid: true,
    input: {
      id: `idictation-${contentHash.slice(0, 16)}-${fields.question_number}`,
      question_id: `external-${contentHash.slice(0, 16)}`,
      passage: fields.passage,
      question_type: fields.question_type,
      question: fields.question,
      options: options.value,
      user_answer: fields.user_answer,
      correct_answer: fields.correct_answer,
      user_evidence: { quote: fields.user_evidence },
      standard_evidence: { quote: fields.standard_evidence },
      reasoning_process: fields.reasoning_process,
      previous_error_history: Array.isArray(value.previous_error_history)
        ? value.previous_error_history.filter((item) => typeof item === 'string').slice(-20) : []
    },
    provenance: {
      source: 'idictation',
      source_origin: parsedUrl.origin,
      question_number: fields.question_number,
      adapter_version: fields.adapter_version,
      content_hash: contentHash
    }
  };
}

function normalizeOptions(value) {
  if (value === undefined || value === null) return { valid: true, value: [] };
  if (!Array.isArray(value) || value.length > 20) return invalid('invalid_options');
  const options = value.map(cleanString);
  if (options.some((item) => !item || item.length > 1000)) return invalid('invalid_options');
  return { valid: true, value: options };
}

function cleanString(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function invalid(error, extra = {}) {
  return { valid: false, error, ...extra };
}

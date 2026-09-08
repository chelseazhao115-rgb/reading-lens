const STORAGE_KEY = 'reading-lens-portfolio-review-v1';
const AUDIT_KEY = 'reading-lens-portfolio-review-audit-v1';
export const PORTFOLIO_CONCEPTS = Object.freeze([
  'user_problem',
  'why_answer_explanation_insufficient',
  'why_evidence_reasoning',
  'taxonomy',
  'agent_workflow',
  'model_evaluation',
  'failure_boundary',
  'safety_fallback',
  'learning_validation'
]);
const ELIGIBLE_ROLES = Object.freeze(['recruiter', 'product_interviewer', 'ai_education_practitioner']);

export function validatePortfolioReview(record) {
  const errors = [];
  if (!/^[A-Za-z0-9_-]{2,24}$/.test(record?.reviewer_id ?? '')) errors.push('invalid_reviewer_id');
  if (!ELIGIBLE_ROLES.includes(record?.reviewer_role)) errors.push('ineligible_reviewer_role');
  if (record?.consent_confirmed !== true) errors.push('consent_required');
  if (record?.first_exposure !== true) errors.push('first_exposure_required');
  if (record?.recall_without_case !== true) errors.push('blind_recall_required');
  if (record?.prompting_used !== false) errors.push('prompting_invalidates_recall');
  if (!Number.isFinite(record?.reading_time_seconds) || record.reading_time_seconds < 30 || record.reading_time_seconds > 900) errors.push('invalid_reading_time');
  if (!record?.concepts || PORTFOLIO_CONCEPTS.some((key) => typeof record.concepts[key] !== 'boolean')) errors.push('all_concepts_must_be_scored');
  if (!Number.isFinite(Date.parse(record?.completed_at))) errors.push('invalid_completed_at');
  if (record?.data_source !== 'real_portfolio_comprehension_research') errors.push('invalid_data_source');
  if (containsDirectIdentifier(record?.observer_notes)) errors.push('observer_notes_prohibited_identifier');
  return { valid: errors.length === 0, errors };
}

export function summarizePortfolioReviews(records = []) {
  const eligible = records.filter((record) => validatePortfolioReview(record).valid);
  const minimumSample = 5;
  if (eligible.length < minimumSample) return {
    data_source: 'real_portfolio_comprehension_research', minimum_sample: minimumSample,
    eligible_records: eligible.length, claim_ready: false, metrics: null,
    limitation: 'Fewer than five eligible first-exposure reviewers; comprehension claims remain N/A.'
  };
  const scored = eligible.map((record) => ({
    recalled: PORTFOLIO_CONCEPTS.filter((key) => record.concepts[key]).length,
    within_window: record.reading_time_seconds >= 180 && record.reading_time_seconds <= 300
  }));
  return {
    data_source: 'real_portfolio_comprehension_research', minimum_sample: minimumSample,
    eligible_records: eligible.length, claim_ready: true,
    metrics: {
      within_three_to_five_minutes_rate: rate(scored.filter((item) => item.within_window).length, scored.length),
      all_nine_recall_rate: rate(scored.filter((item) => item.recalled === PORTFOLIO_CONCEPTS.length).length, scored.length),
      eight_or_more_recall_rate: rate(scored.filter((item) => item.recalled >= 8).length, scored.length),
      median_concepts_recalled: median(scored.map((item) => item.recalled)),
      concept_recall_rates: Object.fromEntries(PORTFOLIO_CONCEPTS.map((key) => [key, rate(eligible.filter((item) => item.concepts[key]).length, eligible.length)]))
    },
    limitation: 'Exploratory comprehension evidence only; it does not prove hiring outcomes or product learning impact.'
  };
}

export function loadPortfolioReviews(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(STORAGE_KEY));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function savePortfolioReview(record, storage = globalThis.localStorage) {
  const validation = validatePortfolioReview(record);
  if (!validation.valid) return validation;
  const records = loadPortfolioReviews(storage);
  if (records.some((item) => item.reviewer_id === record.reviewer_id)) return { valid: false, errors: ['duplicate_reviewer_id'] };
  storage?.setItem(STORAGE_KEY, JSON.stringify([...records, { ...structuredClone(record), revision: 1 }]));
  return { valid: true, errors: [] };
}

export function applyPortfolioWithdrawal(records, reviewerId, reason, occurredAt = new Date().toISOString()) {
  const record = records.find((item) => item.reviewer_id === reviewerId);
  if (!record) return { valid: false, errors: ['record_not_found'] };
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 200) return { valid: false, errors: ['withdrawal_reason_required'] };
  return {
    valid: true, errors: [], records: records.filter((item) => item.reviewer_id !== reviewerId).map((item) => structuredClone(item)),
    audit_entry: { action: 'withdrawn', reviewer_id: reviewerId, occurred_at: occurredAt, reason: reason.trim() }
  };
}

export function withdrawPortfolioReview(reviewerId, reason, storage = globalThis.localStorage) {
  const mutation = applyPortfolioWithdrawal(loadPortfolioReviews(storage), reviewerId, reason);
  if (!mutation.valid) return mutation;
  storage?.setItem(STORAGE_KEY, JSON.stringify(mutation.records));
  const audit = loadPortfolioAudit(storage);
  storage?.setItem(AUDIT_KEY, JSON.stringify([...audit, mutation.audit_entry].slice(-200)));
  return { valid: true, errors: [] };
}

export function loadPortfolioAudit(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(AUDIT_KEY));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function exportPortfolioReviews(records = loadPortfolioReviews(), audit = loadPortfolioAudit()) {
  return {
    schema_version: 1, data_source: 'real_portfolio_comprehension_research', exported_at: new Date().toISOString(),
    direct_identifiers_prohibited: true, records, audit, summary: summarizePortfolioReviews(records)
  };
}

function containsDirectIdentifier(value = '') {
  const text = String(value);
  return /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) || /(?:\+?86[- ]?)?1[3-9]\d{9}/.test(text);
}

function rate(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 1000 : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2 * 1000) / 1000;
}

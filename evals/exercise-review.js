import { isIndependentExerciseTeacherReview } from '../src/review-store.js';

export const EXERCISE_REVIEW_FIELDS = [
  'targets_primary_error', 'original_content', 'unique_answer', 'answer_correct', 'difficulty_appropriate', 'no_answer_leak'
];

export function validateExerciseReviews(items, expectedCount = 10) {
  const errors = [];
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (!['pending', 'approved', 'needs_revision', 'rejected'].includes(item.review_status)) errors.push(`${item.id}: invalid review status`);
    if (!['immediate', 'transfer'].includes(item.stage)) errors.push(`${item.id}: invalid stage`);
    if (!item.passage || !item.question || !Array.isArray(item.options) || !item.options.includes(item.answer)) errors.push(`${item.id}: invalid exercise content`);
    if (![null, ...item.options].includes(item.blind_answer)) errors.push(`${item.id}: invalid blind answer`);
    if (![null, 'location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference'].includes(item.blind_target_error)) errors.push(`${item.id}: invalid blind target error`);
    if (item.blind_revealed_at !== null && Number.isNaN(Date.parse(item.blind_revealed_at))) errors.push(`${item.id}: invalid blind reveal time`);
    if (typeof item.independence_attested !== 'boolean') errors.push(`${item.id}: independence_attested must be boolean`);
    for (const field of EXERCISE_REVIEW_FIELDS) {
      if (![true, false, null].includes(item[field])) errors.push(`${item.id}: ${field} must be true, false or null`);
    }
  }
  if (items.length !== expectedCount) errors.push(`expected ${expectedCount} exercises, received ${items.length}`);
  return { valid: errors.length === 0, count: items.length, errors };
}

export function eligibleExerciseReviews(items) {
  return items.filter((item) =>
    item.review_status === 'approved'
    && EXERCISE_REVIEW_FIELDS.every((field) => item[field] === true)
    && typeof item.reviewer_id === 'string'
    && item.reviewer_id.trim()
    && typeof item.reviewed_at === 'string'
    && !Number.isNaN(Date.parse(item.reviewed_at))
    && typeof item.blind_revealed_at === 'string'
    && !Number.isNaN(Date.parse(item.blind_revealed_at))
    && isIndependentExerciseTeacherReview(item)
  );
}

export function exerciseReviewSummary(items) {
  const eligible = eligibleExerciseReviews(items);
  const completed = items.filter((item) =>
    item.review_status !== 'pending'
    && EXERCISE_REVIEW_FIELDS.every((field) => typeof item[field] === 'boolean')
    && typeof item.reviewer_id === 'string'
    && item.reviewer_id.trim()
    && typeof item.reviewed_at === 'string'
    && !Number.isNaN(Date.parse(item.reviewed_at))
    && isIndependentExerciseTeacherReview(item)
  );
  const blinded = items.filter((item) => item.blind_revealed_at && item.blind_answer && item.blind_target_error && isIndependentExerciseTeacherReview(item));
  return {
    total: items.length,
    pending: items.filter((item) => item.review_status === 'pending').length,
    approved: items.filter((item) => item.review_status === 'approved').length,
    needs_revision: items.filter((item) => item.review_status === 'needs_revision').length,
    rejected: items.filter((item) => item.review_status === 'rejected').length,
    reviewed_complete: completed.length,
    blinded_complete: blinded.length,
    gold_eligible: eligible.length,
    teacher_validity: items.length && completed.length === items.length ? eligible.length / completed.length : null,
    blind_answer_agreement: items.length && completed.length === items.length
      ? completed.filter((item) => item.blind_answer === item.answer).length / completed.length : null,
    blind_target_agreement: items.length && completed.length === items.length
      ? completed.filter((item) => item.blind_target_error === item.target_error).length / completed.length : null
  };
}

export function validateExerciseReviewIntegrity(items, seeds) {
  const errors = [];
  const seedById = new Map(seeds.map((item) => [item.id, item]));
  for (const item of items) {
    const seed = seedById.get(item.id);
    if (!seed) { errors.push(`${item.id}: unknown exercise`); continue; }
    for (const field of ['target_error', 'stage', 'passage', 'question', 'answer', 'data_origin']) {
      if (item[field] !== seed[field]) errors.push(`${item.id}: ${field} was modified`);
    }
    if (JSON.stringify(item.options) !== JSON.stringify(seed.options)) errors.push(`${item.id}: options were modified`);
  }
  return { valid: errors.length === 0, errors };
}

export function toExerciseReviewCsv(items) {
  const fields = [
    'id', 'target_error', 'stage', 'passage', 'question', 'options', 'answer', 'data_origin', 'review_status',
    'blind_answer', 'blind_target_error', 'blind_revealed_at',
    ...EXERCISE_REVIEW_FIELDS, 'reviewer_notes', 'reviewer_id', 'reviewer_role', 'qualification_attested', 'independence_attested', 'review_track', 'review_protocol_version', 'reviewed_at'
  ];
  const rows = items.map((item) => ({ ...item, options: JSON.stringify(item.options) }));
  return `${fields.join(',')}\n${rows.map((row) => fields.map((field) => csv(row[field])).join(',')).join('\n')}\n`;
}

function csv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

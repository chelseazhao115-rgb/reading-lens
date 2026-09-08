import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExerciseReviewItems } from '../src/exercises.js';
import { parseRows } from './import-review-csv.js';
import { exerciseReviewSummary, validateExerciseReviewIntegrity, validateExerciseReviews } from './exercise-review.js';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? new URL('./exercise-review-pack.csv', import.meta.url);
  const rows = parseRows(fs.readFileSync(file, 'utf8').trim());
  const headers = rows[0] ?? [];
  const records = rows.slice(1).filter((row) => row.some(Boolean)).map((row) => parseRecord(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
  const validation = validateExerciseReviews(records);
  const integrity = validateExerciseReviewIntegrity(records, getExerciseReviewItems());
  if (!validation.valid || !integrity.valid) {
    console.error(JSON.stringify({ validation, integrity, message: 'Import rejected; exercise content cannot be changed during review.' }, null, 2));
    process.exitCode = 1;
  } else {
    fs.writeFileSync(new URL('./exercise-reviewed.json', import.meta.url), `${JSON.stringify(records, null, 2)}\n`);
    console.log(JSON.stringify({ imported: records.length, review: exerciseReviewSummary(records) }, null, 2));
  }
}

export function parseExerciseReviewCsv(input) {
  const rows = parseRows(input.trim());
  const headers = rows[0] ?? [];
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => parseRecord(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))));
}

function parseRecord(flat) {
  return {
    id: flat.id, target_error: flat.target_error, stage: flat.stage, passage: flat.passage, question: flat.question,
    options: JSON.parse(flat.options || '[]'), answer: flat.answer, data_origin: flat.data_origin,
    review_status: flat.review_status || 'pending',
    blind_answer: flat.blind_answer || null, blind_target_error: flat.blind_target_error || null,
    blind_revealed_at: flat.blind_revealed_at || null,
    targets_primary_error: booleanOrNull(flat.targets_primary_error), original_content: booleanOrNull(flat.original_content),
    unique_answer: booleanOrNull(flat.unique_answer), answer_correct: booleanOrNull(flat.answer_correct),
    difficulty_appropriate: booleanOrNull(flat.difficulty_appropriate), no_answer_leak: booleanOrNull(flat.no_answer_leak),
    reviewer_notes: flat.reviewer_notes || '', reviewer_id: flat.reviewer_id || null,
    reviewer_role: flat.reviewer_role || null, qualification_attested: String(flat.qualification_attested).toLowerCase() === 'true',
    independence_attested: String(flat.independence_attested).toLowerCase() === 'true', review_track: flat.review_track || null,
    review_protocol_version: flat.review_protocol_version || null,
    reviewed_at: flat.reviewed_at || null
  };
}

function booleanOrNull(value) {
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  return null;
}

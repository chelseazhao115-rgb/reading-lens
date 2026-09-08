import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_DIAGNOSES } from '../src/taxonomy.js';
import { loadFrozenReviewPack, reviewSummary, validatePredictionSnapshotIntegrity, validateReviewCandidates } from './review-pack.js';

const reviewSeeds = loadFrozenReviewPack();
const reviewSeedById = new Map(reviewSeeds.map((item) => [item.id, item]));

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ?? new URL('./review-pack.csv', import.meta.url);
  const csv = fs.readFileSync(file, 'utf8');
  const records = parseReviewCsv(csv);
  const validation = validateReviewCandidates(records);
  const integrity = validatePredictionSnapshotIntegrity(records, reviewSeeds);

  if (!validation.valid || validation.count !== 50 || !integrity.valid) {
    console.error(JSON.stringify({ validation, integrity, message: 'Import rejected; review pack must contain the same 50 cases and trusted prediction snapshots.' }, null, 2));
    process.exitCode = 1;
  } else {
    const invalidReviewedLabels = records.filter((item) => item.reviewer_label && !ALL_DIAGNOSES.includes(item.reviewer_label));
    if (invalidReviewedLabels.length) {
      console.error(JSON.stringify({ message: 'Import rejected; invalid reviewer labels.', ids: invalidReviewedLabels.map((item) => item.id) }, null, 2));
      process.exitCode = 1;
    } else {
      fs.writeFileSync(new URL('./reviewed.json', import.meta.url), `${JSON.stringify(records, null, 2)}\n`);
      console.log(JSON.stringify({ imported: records.length, review: reviewSummary(records) }, null, 2));
    }
  }
}

export function parseReviewCsv(input) {
  const rows = parseRows(input.trim());
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).filter((row) => row.some((value) => value !== '')).map((row) => {
    const flat = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
    const seed = reviewSeedById.get(flat.id) ?? {};
    return {
      id: flat.id,
      data_origin: 'synthetic_project_authored',
      review_status: flat.review_status || 'pending',
      reviewer_label: flat.reviewer_label || null,
      reviewer_failed_step: flat.reviewer_failed_step || null,
      reviewer_notes: flat.reviewer_notes || '',
      reviewer_id: flat.reviewer_id || null,
      reviewer_role: flat.reviewer_role || null,
      qualification_attested: String(flat.qualification_attested).toLowerCase() === 'true',
      independence_attested: String(flat.independence_attested).toLowerCase() === 'true',
      review_track: flat.review_track || null,
      review_protocol_version: flat.review_protocol_version || null,
      reviewed_at: flat.reviewed_at || null,
      proposed_primary_error: seed.proposed_primary_error,
      predicted_primary_error: seed.predicted_primary_error,
      predicted_confidence: seed.predicted_confidence,
      prediction_status: seed.prediction_status,
      prediction_requires_teacher_review: seed.prediction_requires_teacher_review,
      prediction_provider: seed.prediction_provider,
      prediction_prompt_version: seed.prediction_prompt_version,
      prediction_model_version: seed.prediction_model_version,
      question_type: flat.question_type,
      passage: flat.passage,
      question: flat.question,
      correct_answer: flat.correct_answer,
      user_answer: flat.user_answer,
      standard_evidence: { quote: flat.standard_evidence },
      user_evidence: { quote: flat.user_evidence },
      reasoning_process: flat.reasoning_process
    };
  });
}

export function parseRows(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(field); field = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += character;
  }
  row.push(field); rows.push(row);
  return rows;
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDiagnosticService } from './src/diagnostic-service.js';
import { ruleProvider } from './src/providers/rule-provider.js';
import { checkExercise, getExerciseReviewItems, getExerciseSet, publicExerciseCheckResult } from './src/exercises.js';
import { feedbackFor } from './src/feedback.js';
import { loadFrozenReviewPack, validatePredictionSnapshotIntegrity, validateReviewCandidates } from './evals/review-pack.js';
import { applyAuthorQaReview, applyTeacherReview, authorQaPilotCheckpoint, authorQaProgress, blindReviewId, orderedReviewCases, pilotReviewCheckpoint, publicAuthorQaCase, publicReviewCase, reviewProgress } from './src/review-store.js';
import { applyExerciseBlindResponse, applyExerciseTeacherReview, blindExerciseReviewId, exerciseReviewProgress, publicExerciseReview } from './src/exercise-review-store.js';
import { validateExerciseReviewIntegrity, validateExerciseReviews } from './evals/exercise-review.js';
import { pathnameFromRequestUrl } from './src/http-routing.js';
import { publicDemoQuestions } from './src/demo-questions.js';
import { canonicalizeDemoDiagnosticInput } from './src/question-input.js';
import { canonicalizeExternalDiagnosticInput } from './src/external-question-input.js';
import { validateUsabilitySummaryArtifact } from './src/usability-evidence.js';
import { buildDeepSeekCandidateEvidence } from './src/provider-candidate-evidence.js';
import { createVocabularyEnricher, validateVocabularyRequest } from './src/vocabulary-enrichment.js';
import { extractPdfText, MAX_PDF_BYTES, validateImportedDiagnosticInput, validatePdfUpload } from './src/pdf-import.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT || 4173);
const diagnosticService = createDiagnosticService(ruleProvider);
const vocabularyEnricher = createVocabularyEnricher({ apiKey: process.env.DEEPSEEK_API_KEY });
const reviewedPath = path.join(root, 'evals', 'reviewed.json');
const exerciseReviewedPath = path.join(root, 'evals', 'exercise-reviewed.json');
const reviewSeeds = loadFrozenReviewPack();
const evalResultsPath = path.join(root, 'evals', 'results', 'latest.json');
const usabilitySummaryPath = path.join(root, 'evidence', 'usability-pilot-001-summary.json');
const deepSeekSmokePath = path.join(root, 'evals', 'results', 'deepseek-smoke.json');
const deepSeekRemainingPath = path.join(root, 'evals', 'results', 'deepseek-remaining.json');
const deepSeekV3SmokePath = path.join(root, 'evals', 'results', 'deepseek-v3-smoke.json');
const deepSeekV3RemainingPath = path.join(root, 'evals', 'results', 'deepseek-v3-remaining.json');

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }
  const requestPath = pathnameFromRequestUrl(request.url);
  if (request.method === 'GET' && requestPath === '/api/health') {
    sendJson(response, 200, { status:'ok', service:'reading-lens-local', vocabulary_enrichment:vocabularyEnricher.available?'available':'not_configured' });
    return;
  }
  if (request.method === 'GET' && requestPath === '/api/demo-questions') {
    sendJson(response, 200, { data_origin: 'original_project_content', questions: publicDemoQuestions() });
    return;
  }
  if (request.method === 'POST' && requestPath === '/api/diagnose') {
    try {
      const diagnosisStartedAt = performance.now();
      const clientInput = await readJson(request);
      const canonical = canonicalizeDemoDiagnosticInput(clientInput);
      if (!canonical.valid) {
        sendJson(response, 400, { status: 'request_error', error: canonical.error });
        return;
      }
      const result = await diagnosticService.diagnose(canonical.input);
      const exerciseSet = result.status === 'diagnosed' && result.primary_error ? getExerciseSet(result.primary_error) : null;
      sendJson(response, result.status === 'evidence_validation_failed' ? 422 : 200, {
        ...result,
        question_id: canonical.question.id,
        standard_evidence: ['diagnosed', 'correct'].includes(result.status) ? canonical.question.standard_evidence : null,
        feedback: result.status === 'diagnosed' && result.primary_error
          ? feedbackFor(result.primary_error, canonical.question.diagnostic_support) : null,
        exercise: exerciseSet?.immediate ?? null,
        response_time_ms: Math.round((performance.now() - diagnosisStartedAt) * 100) / 100,
        model_cost_usd: null
      });
    } catch (error) {
      sendJson(response, 400, {
        status: 'request_error',
        message: error instanceof Error ? error.message : 'Invalid request'
      });
    }
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/external-diagnose') {
    try {
      const diagnosisStartedAt = performance.now();
      const canonical = canonicalizeExternalDiagnosticInput(await readJson(request));
      if (!canonical.valid) {
        sendJson(response, 400, { status: 'request_error', error: canonical.error, missing_fields: canonical.missing_fields, field: canonical.field });
        return;
      }
      const result = await diagnosticService.diagnose(canonical.input);
      const exerciseSet = result.status === 'diagnosed' && result.primary_error ? getExerciseSet(result.primary_error) : null;
      sendJson(response, result.status === 'evidence_validation_failed' ? 422 : 200, {
        ...result,
        question_id: canonical.input.question_id,
        standard_evidence: ['diagnosed', 'correct'].includes(result.status) ? canonical.input.standard_evidence : null,
        feedback: result.status === 'diagnosed' && result.primary_error ? feedbackFor(result.primary_error) : null,
        exercise: exerciseSet?.immediate ?? null,
        provenance: canonical.provenance,
        response_time_ms: Math.round((performance.now() - diagnosisStartedAt) * 100) / 100,
        model_cost_usd: null
      });
    } catch (error) {
      sendJson(response, 400, { status: 'request_error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/pdf/extract') {
    try {
      const buffer=await readBuffer(request,MAX_PDF_BYTES);
      const validation=validatePdfUpload(buffer,request.headers['content-type']);
      if(!validation.valid){sendJson(response,validation.error==='pdf_too_large'?413:400,{status:'pdf_import_error',error:validation.error});return;}
      const extracted=await extractPdfText(buffer);
      if(!extracted.valid){sendJson(response,422,{status:'pdf_import_error',error:extracted.error,page_count:extracted.page_count});return;}
      sendJson(response,200,{status:'extracted',...extracted.value,retention:'memory_only'});
    }catch(error){sendJson(response,error?.code==='request_too_large'?413:400,{status:'pdf_import_error',error:error?.code??'pdf_upload_failed'});}
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/imported-diagnose') {
    try{
      const canonical=validateImportedDiagnosticInput(await readJson(request));
      if(!canonical.valid){sendJson(response,400,{status:'request_error',error:canonical.error,missing_fields:canonical.missing_fields});return;}
      const result=await diagnosticService.diagnose(canonical.input);const exerciseSet=result.status==='diagnosed'&&result.primary_error?getExerciseSet(result.primary_error):null;
      sendJson(response,result.status==='evidence_validation_failed'?422:200,{...result,question_id:canonical.input.question_id,standard_evidence:['diagnosed','correct'].includes(result.status)?canonical.input.standard_evidence:null,feedback:result.status==='diagnosed'&&result.primary_error?feedbackFor(result.primary_error):null,exercise:exerciseSet?.immediate??null,provenance:canonical.provenance,model_cost_usd:null});
    }catch(error){sendJson(response,400,{status:'request_error',message:error instanceof Error?error.message:'Invalid request'});}
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/exercise/check') {
    try {
      const input = await readJson(request);
      const result = checkExercise(input.exercise_id, input.answer);
      if (!result.valid) {
        sendJson(response, 404, result);
        return;
      }
      const set = getExerciseSet(result.target_error);
      sendJson(response, 200, {
        ...publicExerciseCheckResult(result),
        next_exercise: result.stage === 'immediate' && result.correct ? set?.transfer ?? null : null
      });
    } catch (error) {
      sendJson(response, 400, { status: 'request_error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/vocabulary/enrich') {
    try {
      const requestInput = validateVocabularyRequest(await readJson(request));
      if (!requestInput.valid) { sendJson(response, 400, { status:'request_error', error:requestInput.error }); return; }
      if (!vocabularyEnricher.available) { sendJson(response, 503, { status:'enrichment_unavailable', error:'vocabulary_provider_unavailable' }); return; }
      const enriched = await vocabularyEnricher.enrich(requestInput.value);
      sendJson(response, 200, { status:'enriched', enrichment:enriched });
    } catch (error) {
      const safeCode = /^vocabulary_[a-z_]+$/.test(error?.code ?? '') ? error.code : 'vocabulary_provider_failed';
      sendJson(response, safeCode === 'vocabulary_budget_exceeded' ? 429 : 502, { status:'enrichment_failed', error:safeCode });
    }
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/reviews') {
    const records = loadReviewRecords();
    const ordered = orderedReviewCases(records);
    sendJson(response, 200, {
      cases: ordered.map((item, index) => publicReviewCase(item, blindReviewId(index))),
      progress: reviewProgress(records),
      pilot_checkpoint: pilotReviewCheckpoint(records),
      labels: ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference', 'insufficient_information', 'ambiguous_question', 'data_error'],
      blind_review: true
    });
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/reviews/save') {
    try {
      const input = await readJson(request);
      const records = loadReviewRecords();
      const ordered = orderedReviewCases(records);
      const orderedIndex = ordered.findIndex((item, index) => blindReviewId(index) === input.blind_id);
      const index = orderedIndex < 0 ? -1 : records.findIndex((item) => item.id === ordered[orderedIndex].id);
      const applied = applyTeacherReview(records[index], input);
      if (!applied.valid) {
        sendJson(response, applied.status, { status: 'review_error', error: applied.error });
        return;
      }
      records[index] = applied.value;
      saveReviewRecords(records);
      sendJson(response, 200, {
        status: 'saved', case: publicReviewCase(applied.value, input.blind_id), progress: reviewProgress(records),
        pilot_checkpoint: pilotReviewCheckpoint(records)
      });
    } catch (error) {
      sendJson(response, 400, { status: 'request_error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/author-reviews') {
    const records = loadReviewRecords();
    const ordered = orderedReviewCases(records);
    sendJson(response, 200, {
      cases: ordered.map((item, index) => publicAuthorQaCase(item, blindReviewId(index))),
      progress: authorQaProgress(records),
      pilot_checkpoint: authorQaPilotCheckpoint(records),
      labels: ['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference', 'insufficient_information', 'ambiguous_question', 'data_error'],
      review_track: 'author_qa',
      blind_review: false
    });
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/author-reviews/save') {
    try {
      const input = await readJson(request);
      const records = loadReviewRecords();
      const ordered = orderedReviewCases(records);
      const orderedIndex = ordered.findIndex((item, index) => blindReviewId(index) === input.blind_id);
      const index = orderedIndex < 0 ? -1 : records.findIndex((item) => item.id === ordered[orderedIndex].id);
      const applied = applyAuthorQaReview(records[index], input);
      if (!applied.valid) {
        sendJson(response, applied.status, { status: 'review_error', error: applied.error });
        return;
      }
      records[index] = applied.value;
      saveReviewRecords(records);
      sendJson(response, 200, {
        status: 'saved', case: publicAuthorQaCase(applied.value, input.blind_id), progress: authorQaProgress(records),
        pilot_checkpoint: authorQaPilotCheckpoint(records)
      });
    } catch (error) {
      sendJson(response, 400, { status: 'request_error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/exercise-reviews') {
    const records = loadExerciseReviewRecords();
    sendJson(response, 200, {
      cases: records.map((item, index) => publicExerciseReview(item, blindExerciseReviewId(index))),
      progress: exerciseReviewProgress(records),
      dimensions: ['targets_primary_error', 'original_content', 'unique_answer', 'answer_correct', 'difficulty_appropriate', 'no_answer_leak']
    });
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/exercise-reviews/save') {
    try {
      const input = await readJson(request);
      const records = loadExerciseReviewRecords();
      const index = records.findIndex((item, itemIndex) => blindExerciseReviewId(itemIndex) === input.blind_id);
      const applied = applyExerciseTeacherReview(records[index], input);
      if (!applied.valid) {
        sendJson(response, applied.status, { status: 'exercise_review_error', error: applied.error });
        return;
      }
      records[index] = applied.value;
      saveExerciseReviewRecords(records);
      sendJson(response, 200, { status: 'saved', case: publicExerciseReview(applied.value, input.blind_id), progress: exerciseReviewProgress(records) });
    } catch (error) {
      sendJson(response, 400, { status: 'request_error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  if (request.method === 'POST' && requestPath === '/api/exercise-reviews/reveal') {
    try {
      const input = await readJson(request);
      const records = loadExerciseReviewRecords();
      const index = records.findIndex((item, itemIndex) => blindExerciseReviewId(itemIndex) === input.blind_id);
      const applied = applyExerciseBlindResponse(records[index], input);
      if (!applied.valid) {
        sendJson(response, applied.status, { status: 'exercise_blind_error', error: applied.error });
        return;
      }
      records[index] = applied.value;
      saveExerciseReviewRecords(records);
      sendJson(response, 200, { status: 'revealed', case: publicExerciseReview(applied.value, input.blind_id), progress: exerciseReviewProgress(records) });
    } catch (error) {
      sendJson(response, 400, { status: 'request_error', message: error instanceof Error ? error.message : 'Invalid request' });
    }
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/eval-results') {
    if (!fs.existsSync(evalResultsPath)) {
      sendJson(response, 503, { status: 'eval_unavailable', message: 'Run npm run eval to generate the latest artifact.' });
      return;
    }
    try {
      const result = JSON.parse(fs.readFileSync(evalResultsPath, 'utf8'));
      const candidate = buildDeepSeekCandidateEvidence(
        JSON.parse(fs.readFileSync(deepSeekSmokePath, 'utf8')),
        JSON.parse(fs.readFileSync(deepSeekRemainingPath, 'utf8')),
        JSON.parse(fs.readFileSync(deepSeekV3SmokePath, 'utf8')),
        JSON.parse(fs.readFileSync(deepSeekV3RemainingPath, 'utf8'))
      );
      sendJson(response, 200, {
        data_source: 'eval_artifact', ...result,
        provider_candidate_evidence: candidate.valid ? candidate : { valid: false, errors: candidate.errors }
      });
    } catch {
      sendJson(response, 500, { status: 'eval_invalid', message: 'Latest eval artifact is not valid JSON.' });
    }
    return;
  }

  if (request.method === 'GET' && requestPath === '/api/usability-summary') {
    try {
      const artifact = JSON.parse(fs.readFileSync(usabilitySummaryPath, 'utf8'));
      const validation = validateUsabilitySummaryArtifact(artifact);
      if (!validation.valid) {
        sendJson(response, 500, { status: 'usability_summary_invalid', errors: validation.errors });
        return;
      }
      sendJson(response, 200, artifact);
    } catch {
      sendJson(response, 503, { status: 'usability_summary_unavailable' });
    }
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405).end('Method Not Allowed');
    return;
  }

  const requestedPath = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, safePath);
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404).end('Not Found');
    return;
  }

  const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] ?? 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`IELTS Reading Diagnostic Coach: http://localhost:${port}`));

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy(new Error('Request too large'));
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error('Request body must be valid JSON')); }
    });
    request.on('error', reject);
  });
}

function readBuffer(request,maxBytes){return new Promise((resolve,reject)=>{const chunks=[];let size=0;let failed=false;request.on('data',(chunk)=>{if(failed)return;size+=chunk.length;if(size>maxBytes){failed=true;reject(Object.assign(new Error('Request too large'),{code:'request_too_large'}));return;}chunks.push(chunk);});request.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});request.on('error',(error)=>{if(!failed)reject(error);});});}

function sendJson(response, status, value) {
  response.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function loadReviewRecords() {
  if (!fs.existsSync(reviewedPath)) return structuredClone(reviewSeeds);
  try {
    const records = JSON.parse(fs.readFileSync(reviewedPath, 'utf8'));
    const validation = validateReviewCandidates(records);
    const integrity = validatePredictionSnapshotIntegrity(records, reviewSeeds);
    return validation.valid && validation.count === 50 && integrity.valid ? records : structuredClone(reviewSeeds);
  } catch {
    return structuredClone(reviewSeeds);
  }
}

function saveReviewRecords(records) {
  const validation = validateReviewCandidates(records);
  const integrity = validatePredictionSnapshotIntegrity(records, reviewSeeds);
  if (!validation.valid || validation.count !== 50 || !integrity.valid) throw new Error('Review data failed structural or prediction-snapshot validation');
  const temporaryPath = `${reviewedPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, reviewedPath);
}

function loadExerciseReviewRecords() {
  const seeds = getExerciseReviewItems();
  if (!fs.existsSync(exerciseReviewedPath)) return seeds;
  try {
    const records = JSON.parse(fs.readFileSync(exerciseReviewedPath, 'utf8'));
    const validation = validateExerciseReviews(records);
    const integrity = validateExerciseReviewIntegrity(records, seeds);
    return validation.valid && integrity.valid ? records : seeds;
  } catch {
    return seeds;
  }
}

function saveExerciseReviewRecords(records) {
  const seeds = getExerciseReviewItems();
  const validation = validateExerciseReviews(records);
  const integrity = validateExerciseReviewIntegrity(records, seeds);
  if (!validation.valid || !integrity.valid) throw new Error('Exercise review data failed validation');
  const temporaryPath = `${exerciseReviewedPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, exerciseReviewedPath);
}

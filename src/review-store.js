import { ALL_DIAGNOSES } from './taxonomy.js';
import { hasCurrentReviewRevision, reviewRevision } from './review-revision.js';

const REVIEW_STATUSES = Object.freeze(['approved', 'rejected', 'needs_revision']);
const RESERVED_REVIEWER_IDS = /^(browser-validation|automation|demo|test(?:er)?)(?:[-_].*)?$/i;
const INDEPENDENT_REVIEWER_ID = /^teacher-[a-z0-9][a-z0-9-]{2,49}$/i;
const AUTHOR_QA_ID = /^author-[a-z0-9][a-z0-9-]{2,49}$/i;
const LABEL_TO_STEP = Object.freeze({
  location: 'evidence_location', paraphrase: 'semantic_mapping', sentence_comprehension: 'sentence_understanding',
  question_strategy: 'question_rule', over_inference: 'reasoning_boundary',
  insufficient_information: 'not_applicable', ambiguous_question: 'not_applicable', data_error: 'not_applicable'
});
export const PILOT_REVIEW_IDS = Object.freeze([
  'review_location_01', 'review_paraphrase_01', 'review_sentence_01', 'review_strategy_01', 'review_inference_01',
  'review_insufficient_01', 'review_ambiguous_01', 'review_data_error_01', 'review_paraphrase_02', 'review_strategy_02'
]);

export function blindReviewId(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return `blind-case-${String(index + 1).padStart(3, '0')}`;
}

export function publicReviewCase(item, blindId = null) {
  const teacherAttested = isIndependentTeacherReview(item);
  const hasExcludedReview = item.review_status !== 'pending' && !teacherAttested;
  return {
    blind_id: blindId,
    data_origin: item.data_origin,
    question_type: item.question_type,
    passage: item.passage,
    question: item.question,
    correct_answer: item.correct_answer,
    user_answer: item.user_answer,
    standard_evidence: item.standard_evidence,
    user_evidence: item.user_evidence,
    reasoning_process: item.reasoning_process,
    review_status: teacherAttested ? item.review_status : 'pending',
    reviewer_label: teacherAttested ? item.reviewer_label : null,
    reviewer_failed_step: teacherAttested ? item.reviewer_failed_step : null,
    reviewer_notes: teacherAttested ? item.reviewer_notes : '',
    reviewer_id: teacherAttested ? item.reviewer_id : null,
    reviewer_role: teacherAttested ? item.reviewer_role : null,
    qualification_attested: teacherAttested,
    independence_attested: teacherAttested,
    reviewed_at: teacherAttested ? item.reviewed_at : null,
    provenance_status: teacherAttested ? 'teacher_attested_current_protocol' : hasExcludedReview ? 'excluded_legacy_or_untrusted_review_hidden' : 'unreviewed',
    review_revision: reviewRevision(item, 'diagnostic')
  };
}

export function publicAuthorQaCase(item, blindId = null) {
  const qa = item.author_qa ?? {};
  const valid = isAuthorQaReview(item);
  return {
    blind_id: blindId,
    data_origin: item.data_origin,
    question_type: item.question_type,
    passage: item.passage,
    question: item.question,
    correct_answer: item.correct_answer,
    user_answer: item.user_answer,
    standard_evidence: item.standard_evidence,
    user_evidence: item.user_evidence,
    reasoning_process: item.reasoning_process,
    review_status: valid ? qa.review_status : 'pending',
    reviewer_label: valid ? qa.reviewer_label : null,
    reviewer_failed_step: valid ? qa.reviewer_failed_step : null,
    reviewer_notes: valid ? qa.reviewer_notes : '',
    reviewer_id: valid ? qa.reviewer_id : null,
    reviewer_role: valid ? qa.reviewer_role : null,
    qualification_attested: valid,
    reviewed_at: valid ? qa.reviewed_at : null,
    provenance_status: valid ? 'project_author_qa' : 'unreviewed',
    review_revision: reviewRevision(item, 'author_qa')
  };
}

export function applyTeacherReview(item, review, now = new Date().toISOString()) {
  if (!item) return { valid: false, status: 404, error: 'review_case_not_found' };
  if (!hasCurrentReviewRevision(item, review?.expected_revision, 'diagnostic')) return invalid('stale_review_revision', 409);
  const status = String(review?.review_status ?? '').trim();
  const label = String(review?.reviewer_label ?? '').trim() || null;
  const reviewerId = String(review?.reviewer_id ?? '').trim();
  const notes = String(review?.reviewer_notes ?? '').trim();
  const reviewerRole = String(review?.reviewer_role ?? '').trim();
  const qualificationAttested = review?.qualification_attested === true;
  const independenceAttested = review?.independence_attested === true;
  const reviewTrack = String(review?.review_track ?? '').trim();
  const reviewProtocolVersion = String(review?.review_protocol_version ?? '').trim();
  const reviewerFailedStep = String(review?.reviewer_failed_step ?? '').trim();

  if (!REVIEW_STATUSES.includes(status)) return invalid('invalid_review_status');
  if (!reviewerId) return invalid('reviewer_id_required');
  if (RESERVED_REVIEWER_IDS.test(reviewerId)) return invalid('reserved_reviewer_id_not_allowed');
  if (!INDEPENDENT_REVIEWER_ID.test(reviewerId)) return invalid('independent_teacher_id_required');
  if (reviewerRole !== 'ielts_reading_teacher' || !qualificationAttested) return invalid('ielts_reading_teacher_attestation_required');
  if (reviewTrack !== 'independent_teacher_gold' || !independenceAttested) return invalid('independent_reviewer_attestation_required');
  if (reviewProtocolVersion !== 'diagnostic-causal-blind-v3') return invalid('current_blind_review_protocol_required');
  if (status === 'approved' && !ALL_DIAGNOSES.includes(label)) return invalid('valid_reviewer_label_required_for_approval');
  if (label && !ALL_DIAGNOSES.includes(label)) return invalid('invalid_reviewer_label');
  if (status === 'approved' && reviewerFailedStep !== causalStepForLabel(label)) return invalid('reviewer_failed_step_must_match_label');
  if (notes.length < 8) return invalid(status === 'approved' ? 'reviewer_rationale_required_for_approval' : 'reviewer_notes_required_for_non_approval');

  return {
    valid: true,
    status: 200,
    value: {
      ...item,
      review_status: status,
      reviewer_label: label,
      reviewer_failed_step: reviewerFailedStep,
      reviewer_notes: notes,
      reviewer_id: reviewerId,
      reviewer_role: reviewerRole,
      qualification_attested: qualificationAttested,
      independence_attested: independenceAttested,
      review_track: reviewTrack,
      review_protocol_version: reviewProtocolVersion,
      reviewed_at: now
    }
  };
}

export function applyAuthorQaReview(item, review, now = new Date().toISOString()) {
  if (!item) return { valid: false, status: 404, error: 'review_case_not_found' };
  if (!hasCurrentReviewRevision(item, review?.expected_revision, 'author_qa')) return invalid('stale_review_revision', 409);
  const status = String(review?.review_status ?? '').trim();
  const label = String(review?.reviewer_label ?? '').trim() || null;
  const failedStep = String(review?.reviewer_failed_step ?? '').trim();
  const notes = String(review?.reviewer_notes ?? '').trim();
  const reviewerId = String(review?.reviewer_id ?? '').trim();
  if (!REVIEW_STATUSES.includes(status)) return invalid('invalid_review_status');
  if (!AUTHOR_QA_ID.test(reviewerId) || RESERVED_REVIEWER_IDS.test(reviewerId)) return invalid('valid_author_qa_id_required');
  if (review?.reviewer_role !== 'ielts_reading_teacher' || review?.qualification_attested !== true) return invalid('ielts_reading_teacher_attestation_required');
  if (review?.review_track !== 'author_qa' || review?.review_protocol_version !== 'diagnostic-author-qa-v1') return invalid('author_qa_protocol_required');
  if (status === 'approved' && (!ALL_DIAGNOSES.includes(label) || failedStep !== causalStepForLabel(label))) return invalid('author_qa_label_step_required');
  if (notes.length < 8) return invalid('reviewer_notes_required');
  return {
    valid: true,
    status: 200,
    value: {
      ...item,
      author_qa: {
        review_status: status,
        reviewer_label: label,
        reviewer_failed_step: failedStep || null,
        reviewer_notes: notes,
        reviewer_id: reviewerId,
        reviewer_role: 'ielts_reading_teacher',
        qualification_attested: true,
        review_track: 'author_qa',
        review_protocol_version: 'diagnostic-author-qa-v1',
        reviewed_at: now
      }
    }
  };
}

export function orderedReviewCases(items) {
  const pilotPosition = new Map(PILOT_REVIEW_IDS.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aPilot = pilotPosition.has(a.id);
    const bPilot = pilotPosition.has(b.id);
    if (aPilot && bPilot) return pilotPosition.get(a.id) - pilotPosition.get(b.id);
    if (aPilot) return -1;
    if (bPilot) return 1;
    return items.indexOf(a) - items.indexOf(b);
  });
}

export function pilotReviewCheckpoint(items) {
  const pilot = PILOT_REVIEW_IDS.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const processed = pilot.filter((item) => item.review_status !== 'pending');
  const currentProtocol = processed.filter(isCurrentProtocolReview);
  const teacherAttested = currentProtocol.filter(isTeacherAttestedReview);
  const issues = currentProtocol.filter((item) => ['rejected', 'needs_revision'].includes(item.review_status));
  const provenanceIssues = processed.length - currentProtocol.length;
  return {
    total: PILOT_REVIEW_IDS.length,
    available: pilot.length,
    reviewed: currentProtocol.length,
    approved: currentProtocol.filter((item) => item.review_status === 'approved').length,
    sample_issues: issues.length,
    ready_for_sample_audit: pilot.length === PILOT_REVIEW_IDS.length && currentProtocol.length === PILOT_REVIEW_IDS.length,
    teacher_attested: teacherAttested.length,
    provenance_issues: provenanceIssues,
    ready_to_continue: pilot.length === PILOT_REVIEW_IDS.length && currentProtocol.length === PILOT_REVIEW_IDS.length && issues.length === 0,
    predictions_hidden: true
  };
}

export function reviewProgress(items) {
  const current = items.filter(isCurrentProtocolReview);
  const count = (status) => current.filter((item) => item.review_status === status).length;
  return {
    total: items.length,
    pending: items.length - current.length,
    approved: count('approved'),
    rejected: count('rejected'),
    needs_revision: count('needs_revision'),
    reviewed: current.length,
    gold_eligible: items.filter((item) => item.review_status === 'approved' && isIndependentTeacherReview(item)).length,
    provenance_excluded: items.filter((item) => item.review_status !== 'pending' && !isCurrentProtocolReview(item)).length
  };
}

export function authorQaProgress(items) {
  const reviewed = items.filter(isAuthorQaReview);
  return {
    total: items.length,
    pending: items.length - reviewed.length,
    approved: reviewed.filter((item) => item.author_qa.review_status === 'approved').length,
    rejected: reviewed.filter((item) => item.author_qa.review_status === 'rejected').length,
    needs_revision: reviewed.filter((item) => item.author_qa.review_status === 'needs_revision').length,
    reviewed: reviewed.length,
    gold_eligible: 0,
    provenance_excluded: 0
  };
}

export function authorQaPilotCheckpoint(items) {
  const pilot = PILOT_REVIEW_IDS.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const reviewed = pilot.filter(isAuthorQaReview);
  const issues = reviewed.filter((item) => ['rejected', 'needs_revision'].includes(item.author_qa.review_status));
  return {
    total: PILOT_REVIEW_IDS.length,
    available: pilot.length,
    reviewed: reviewed.length,
    approved: reviewed.filter((item) => item.author_qa.review_status === 'approved').length,
    sample_issues: issues.length,
    ready_for_sample_audit: pilot.length === PILOT_REVIEW_IDS.length && reviewed.length === PILOT_REVIEW_IDS.length,
    teacher_attested: 0,
    provenance_issues: 0,
    ready_to_continue: pilot.length === PILOT_REVIEW_IDS.length && reviewed.length === PILOT_REVIEW_IDS.length && issues.length === 0,
    predictions_hidden: true
  };
}

export function isCurrentProtocolReview(item) {
  return isTeacherQualifiedReviewer(item)
    && item.review_protocol_version === 'diagnostic-causal-blind-v3'
    && item.review_track === 'independent_teacher_gold'
    && item.independence_attested === true
    && REVIEW_STATUSES.includes(item.review_status)
    && typeof item.reviewed_at === 'string'
    && !Number.isNaN(Date.parse(item.reviewed_at))
    && typeof item.reviewer_notes === 'string'
    && item.reviewer_notes.trim().length >= 8;
}

export function isIndependentTeacherReview(item) {
  return isTeacherAttestedReview(item)
    && INDEPENDENT_REVIEWER_ID.test(item.reviewer_id)
    && item.review_track === 'independent_teacher_gold'
    && item.independence_attested === true;
}

export function isAuthorQaReview(item) {
  const qa = item?.author_qa;
  return !!qa
    && isTeacherQualifiedReviewer(qa)
    && AUTHOR_QA_ID.test(qa.reviewer_id)
    && qa.review_track === 'author_qa'
    && qa.review_protocol_version === 'diagnostic-author-qa-v1'
    && REVIEW_STATUSES.includes(qa.review_status)
    && typeof qa.reviewed_at === 'string'
    && !Number.isNaN(Date.parse(qa.reviewed_at))
    && typeof qa.reviewer_notes === 'string'
    && qa.reviewer_notes.trim().length >= 8
    && (qa.review_status !== 'approved'
      || (ALL_DIAGNOSES.includes(qa.reviewer_label) && qa.reviewer_failed_step === causalStepForLabel(qa.reviewer_label)));
}

export function isTeacherAttestedReview(item) {
  return isCurrentProtocolReview(item)
    && item.reviewer_failed_step === causalStepForLabel(item.reviewer_label)
    && ALL_DIAGNOSES.includes(item.reviewer_label);
}

export function causalStepForLabel(label) {
  return LABEL_TO_STEP[label] ?? null;
}

export function isTeacherQualifiedReviewer(item) {
  return typeof item?.reviewer_id === 'string'
    && item.reviewer_id.trim().length > 0
    && !RESERVED_REVIEWER_IDS.test(item.reviewer_id.trim())
    && item.reviewer_role === 'ielts_reading_teacher'
    && item.qualification_attested === true;
}

export function isIndependentExerciseTeacherReview(item) {
  return isTeacherQualifiedReviewer(item)
    && INDEPENDENT_REVIEWER_ID.test(item.reviewer_id.trim())
    && item.independence_attested === true
    && item.review_track === 'independent_teacher_exercise'
    && item.review_protocol_version === 'exercise-two-stage-v3';
}

function invalid(error, status = 400) {
  return { valid: false, status, error };
}

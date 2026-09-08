import { PRIMARY_ERRORS } from './taxonomy.js';
import { isIndependentExerciseTeacherReview, isTeacherQualifiedReviewer } from './review-store.js';
import { EXERCISE_REVIEW_FIELDS, exerciseReviewSummary } from '../evals/exercise-review.js';
import { hasCurrentReviewRevision, reviewRevision } from './review-revision.js';

const REVIEW_STATUSES = new Set(['approved', 'needs_revision', 'rejected']);

export function blindExerciseReviewId(index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return `blind-exercise-${String(index + 1).padStart(3, '0')}`;
}

export function publicExerciseReview(item, blindId = null) {
  const copy = structuredClone(item);
  delete copy.id;
  copy.blind_id = blindId;
  copy.review_revision = reviewRevision(item, 'exercise');
  if (!copy.blind_revealed_at || !isIndependentExerciseTeacherReview(copy)) {
    delete copy.answer;
    delete copy.target_error;
    delete copy.stage;
    copy.blind_answer = null;
    copy.blind_target_error = null;
    copy.blind_revealed_at = null;
    copy.reviewer_id = null;
    copy.reviewer_role = null;
    copy.qualification_attested = false;
    copy.independence_attested = false;
    copy.review_track = null;
  }
  return copy;
}

export function applyExerciseBlindResponse(item, review, now = new Date().toISOString()) {
  if (!item) return invalid(404, 'exercise_review_not_found');
  if (!hasCurrentReviewRevision(item, review?.expected_revision, 'exercise')) return invalid(409, 'stale_review_revision');
  if (item.blind_revealed_at) return invalid(409, 'blind_response_already_locked');
  const reviewerId = String(review?.reviewer_id ?? '').trim();
  const blindAnswer = String(review?.blind_answer ?? '').trim();
  const blindTargetError = String(review?.blind_target_error ?? '').trim();
  if (!reviewerId) return invalid(400, 'reviewer_id_required');
  const provenance = {
    reviewer_id: reviewerId,
    reviewer_role: String(review?.reviewer_role ?? '').trim(),
    qualification_attested: review?.qualification_attested === true,
    independence_attested: review?.independence_attested === true,
    review_track: String(review?.review_track ?? '').trim(),
    review_protocol_version: String(review?.review_protocol_version ?? '').trim()
  };
  if (!isTeacherQualifiedReviewer(provenance)) return invalid(400, 'ielts_reading_teacher_attestation_required');
  if (provenance.review_protocol_version !== 'exercise-two-stage-v3') return invalid(400, 'current_blind_review_protocol_required');
  if (!isIndependentExerciseTeacherReview(provenance)) return invalid(400, 'independent_reviewer_attestation_required');
  if (!item.options.includes(blindAnswer)) return invalid(400, 'blind_answer_must_be_an_option');
  if (!PRIMARY_ERRORS.includes(blindTargetError)) return invalid(400, 'blind_target_error_required');
  return {
    valid: true,
    status: 200,
    value: {
      ...item,
      blind_answer: blindAnswer,
      blind_target_error: blindTargetError,
      blind_revealed_at: now,
      reviewer_id: reviewerId,
      reviewer_role: provenance.reviewer_role,
      qualification_attested: provenance.qualification_attested,
      independence_attested: provenance.independence_attested,
      review_track: provenance.review_track,
      review_protocol_version: 'exercise-two-stage-v3'
    }
  };
}

export function applyExerciseTeacherReview(item, review, now = new Date().toISOString()) {
  if (!item) return invalid(404, 'exercise_review_not_found');
  if (!hasCurrentReviewRevision(item, review?.expected_revision, 'exercise')) return invalid(409, 'stale_review_revision');
  const reviewStatus = String(review?.review_status ?? '').trim();
  const reviewerId = String(review?.reviewer_id ?? '').trim();
  const notes = String(review?.reviewer_notes ?? '').trim();
  if (!REVIEW_STATUSES.has(reviewStatus)) return invalid(400, 'invalid_review_status');
  if (!reviewerId) return invalid(400, 'reviewer_id_required');
  if (!item.blind_revealed_at || !item.blind_answer || !item.blind_target_error) return invalid(400, 'blind_response_required_before_review');
  if (item.reviewer_id !== reviewerId) return invalid(409, 'reviewer_id_must_match_blind_response');
  if (!isIndependentExerciseTeacherReview(item)) return invalid(400, 'current_blind_review_protocol_required');

  const dimensions = Object.fromEntries(EXERCISE_REVIEW_FIELDS.map((field) => [field, review?.[field]]));
  if (EXERCISE_REVIEW_FIELDS.some((field) => typeof dimensions[field] !== 'boolean')) return invalid(400, 'all_six_dimensions_required');
  const allPass = EXERCISE_REVIEW_FIELDS.every((field) => dimensions[field] === true);
  if (reviewStatus === 'approved' && !allPass) return invalid(400, 'approval_requires_all_dimensions_true');
  if (reviewStatus !== 'approved' && allPass) return invalid(400, 'non_approval_requires_failed_dimension');
  if (!allPass && !notes) return invalid(400, 'notes_required_for_failed_dimension');

  return {
    valid: true,
    status: 200,
    value: {
      ...item,
      ...dimensions,
      review_status: reviewStatus,
      reviewer_notes: notes,
      reviewer_id: reviewerId,
      reviewed_at: now
    }
  };
}

export function exerciseReviewProgress(items) {
  return exerciseReviewSummary(items);
}

function invalid(status, error) {
  return { valid: false, status, error };
}

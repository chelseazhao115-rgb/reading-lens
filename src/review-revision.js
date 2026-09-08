import { createHash } from 'node:crypto';

export function reviewRevision(item, kind) {
  if (!item) return null;
  const state = kind === 'exercise'
    ? [item.id, item.review_status, item.blind_revealed_at, item.reviewed_at, item.reviewer_id, item.independence_attested, item.review_track, item.review_protocol_version]
    : kind === 'author_qa'
      ? [item.id, item.author_qa?.review_status, item.author_qa?.reviewed_at, item.author_qa?.reviewer_id, item.author_qa?.review_protocol_version]
    : [item.id, item.review_status, item.reviewed_at, item.reviewer_id, item.review_protocol_version];
  return createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 24);
}

export function hasCurrentReviewRevision(item, expectedRevision, kind) {
  return typeof expectedRevision === 'string' && expectedRevision === reviewRevision(item, kind);
}

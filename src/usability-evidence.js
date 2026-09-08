const RATE_KEYS = ['unassisted_completion', 'evidence_selection_success', 'diagnosis_comprehension'];
const PROHIBITED_KEYS = ['records', 'audit', 'participant_id', 'research_session_id', 'observer_notes'];

export function validateUsabilitySummaryArtifact(artifact) {
  const errors = [];
  if (artifact?.schema_version !== 1) errors.push('unsupported_schema_version');
  if (artifact?.artifact_type !== 'usability_summary') errors.push('invalid_artifact_type');
  if (artifact?.data_source !== 'real_user_research') errors.push('invalid_data_source');
  if (!/^usability-pilot-\d{3}$/.test(artifact?.pilot_id ?? '')) errors.push('invalid_pilot_id');
  if (!/^[A-F0-9]{64}$/.test(artifact?.source_sha256 ?? '')) errors.push('invalid_source_sha256');
  if (artifact?.post_fix_retest?.eligible_records > 0 && !/^[A-F0-9]{64}$/.test(artifact?.post_fix_source_sha256 ?? '')) errors.push('invalid_post_fix_source_sha256');
  if (artifact?.direct_identifiers_included !== false) errors.push('direct_identifiers_must_be_excluded');
  const sampleSize = artifact?.sample?.eligible_records;
  if (!Number.isInteger(sampleSize) || sampleSize < 1) errors.push('invalid_eligible_records');
  if (artifact?.sample?.unique_research_sessions !== sampleSize) errors.push('unique_session_count_mismatch');
  if (!Number.isInteger(artifact?.sample?.duplicate_session_records) || artifact.sample.duplicate_session_records < 0) errors.push('invalid_duplicate_count');
  for (const key of RATE_KEYS) validateRate(artifact?.metrics?.[key], key, sampleSize, errors);
  for (const key of ['median_completion_time_seconds', 'median_diagnosis_comprehension_time_seconds']) {
    if (!Number.isFinite(artifact?.metrics?.[key]) || artifact.metrics[key] <= 0) errors.push(`${key}_invalid`);
  }
  const postFix = artifact?.post_fix_retest;
  if (!Number.isInteger(postFix?.eligible_records) || postFix.eligible_records < 0) errors.push('post_fix_eligible_records_invalid');
  if (!Number.isInteger(postFix?.minimum_sample) || postFix.minimum_sample < 1) errors.push('post_fix_minimum_sample_invalid');
  const teaching = postFix?.instructional_value_metrics;
  if (postFix?.eligible_records >= postFix?.minimum_sample) {
    if (teaching?.sample_size !== postFix.eligible_records) errors.push('post_fix_sample_size_mismatch');
    for (const key of ['specific_error_understanding_rate', 'next_action_understanding_rate', 'practice_relevance_understanding_rate']) {
      if (!Number.isFinite(teaching?.[key]) || teaching[key] < 0 || teaching[key] > 1) errors.push(`${key}_invalid`);
    }
  } else if (teaching !== null) errors.push('post_fix_metrics_must_be_null_below_threshold');
  const serialized = JSON.stringify(artifact);
  for (const key of PROHIBITED_KEYS) if (serialized.includes(`\"${key}\"`)) errors.push(`prohibited_key_${key}`);
  if (typeof artifact?.known_defect_caveat !== 'string' || artifact.known_defect_caveat.length < 40) errors.push('known_defect_caveat_required');
  if (typeof artifact?.limitation !== 'string' || artifact.limitation.length < 40) errors.push('limitation_required');
  return { valid: errors.length === 0, errors };
}

function validateRate(metric, key, sampleSize, errors) {
  if (!Number.isInteger(metric?.numerator) || !Number.isInteger(metric?.denominator) || metric.denominator !== sampleSize) {
    errors.push(`${key}_counts_invalid`);
    return;
  }
  const expected = metric.denominator ? metric.numerator / metric.denominator : null;
  if (metric.numerator < 0 || metric.numerator > metric.denominator || metric.rate !== expected) errors.push(`${key}_rate_mismatch`);
}

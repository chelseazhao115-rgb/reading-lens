export const PRIMARY_ERRORS = Object.freeze([
  'location',
  'paraphrase',
  'sentence_comprehension',
  'question_strategy',
  'over_inference'
]);

export const SPECIAL_STATES = Object.freeze([
  'insufficient_information',
  'ambiguous_question',
  'data_error'
]);

export const ALL_DIAGNOSES = Object.freeze([...PRIMARY_ERRORS, ...SPECIAL_STATES]);


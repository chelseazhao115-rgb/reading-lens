const PRIMARY_ERRORS = new Set(['location', 'paraphrase', 'sentence_comprehension', 'question_strategy', 'over_inference']);

export function validExerciseCheckResponse(result, expectedExerciseId) {
  const baseValid = Boolean(result && typeof result === 'object' && !Array.isArray(result)
    && result.valid === true
    && result.status === 'checked'
    && result.exercise_id === expectedExerciseId
    && PRIMARY_ERRORS.has(result.target_error)
    && ['immediate', 'transfer'].includes(result.stage)
    && typeof result.correct === 'boolean'
    && typeof result.feedback === 'string'
    && result.feedback.trim().length > 0);
  if (!baseValid) return false;
  if (result.stage === 'immediate' && result.correct) {
    return validNextExercise(result.next_exercise, result.target_error);
  }
  return result.next_exercise === null;
}

export function rollbackUnverifiedAttempt(attempts) {
  return Math.max(0, Number.isFinite(attempts) ? attempts - 1 : 0);
}

function validNextExercise(exercise, targetError) {
  return exercise && typeof exercise === 'object' && !Array.isArray(exercise)
    && typeof exercise.id === 'string'
    && exercise.target_error === targetError
    && exercise.stage === 'transfer'
    && typeof exercise.passage === 'string' && exercise.passage.trim().length > 0
    && typeof exercise.question === 'string' && exercise.question.trim().length > 0
    && Array.isArray(exercise.options) && exercise.options.length >= 2
    && exercise.options.every((option) => typeof option === 'string' && option.trim().length > 0)
    && !('answer' in exercise) && !('correct_answer' in exercise);
}

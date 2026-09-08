const EXERCISES = Object.freeze([
  exercise('location_immediate_01', 'location', 'immediate',
    'The city introduced electric buses in 2021. Passenger complaints fell after new route maps were installed in 2023.',
    'Which sentence is the best evidence that clearer information improved the passenger experience?',
    ['The city introduced electric buses in 2021.', 'Passenger complaints fell after new route maps were installed in 2023.'],
    'Passenger complaints fell after new route maps were installed in 2023.'),
  exercise('location_transfer_01', 'location', 'transfer',
    'Some desert plants store water in thick leaves. Their roots spread close to the surface, enabling them to absorb brief rainfall quickly.',
    'Which sentence best explains how the plants collect water from short rain showers?',
    ['Some desert plants store water in thick leaves.', 'Their roots spread close to the surface, enabling them to absorb brief rainfall quickly.'],
    'Their roots spread close to the surface, enabling them to absorb brief rainfall quickly.'),
  exercise('paraphrase_immediate_01', 'paraphrase', 'immediate',
    'The gallery removed the entry fee for visitors under eighteen.',
    'Which statement matches the passage?',
    ['Young visitors could enter without payment.', 'All visitors received a discounted ticket.'],
    'Young visitors could enter without payment.'),
  exercise('paraphrase_transfer_01', 'paraphrase', 'transfer',
    'The device consumes considerably less electricity than the previous model.',
    'Which statement matches the passage?',
    ['The new device is much more energy-efficient.', 'The new device stores more electricity.'],
    'The new device is much more energy-efficient.'),
  exercise('sentence_immediate_01', 'sentence_comprehension', 'immediate',
    'Although the seeds survived the cold, they did not begin to grow until temperatures rose.',
    'Which statement is correct?',
    ['The seeds grew during the cold period.', 'The seeds remained alive but started growing later.'],
    'The seeds remained alive but started growing later.'),
  exercise('sentence_transfer_01', 'sentence_comprehension', 'transfer',
    'The medication reduced the frequency of headaches, but not their intensity.',
    'Which statement is correct?',
    ['Headaches happened less often but were not less severe.', 'The medication made every headache less painful.'],
    'Headaches happened less often but were not less severe.'),
  exercise('strategy_immediate_01', 'question_strategy', 'immediate',
    'The report states that the eastern bridge opens in April. It provides no opening date for the western bridge.',
    'The western bridge will open in May.',
    ['TRUE', 'FALSE', 'NOT GIVEN'],
    'NOT GIVEN'),
  exercise('strategy_transfer_01', 'question_strategy', 'transfer',
    'The study measured adults aged 20 to 45. No participants over 45 were included.',
    'Adults over 45 received worse results.',
    ['TRUE', 'FALSE', 'NOT GIVEN'],
    'NOT GIVEN'),
  exercise('inference_immediate_01', 'over_inference', 'immediate',
    'A school placed more recycling bins in its corridors in September.',
    'Which conclusion is supported by the passage?',
    ['The school added recycling bins.', 'Students recycled more waste after September.'],
    'The school added recycling bins.'),
  exercise('inference_transfer_01', 'over_inference', 'transfer',
    'Researchers found that people who walked more frequently also reported higher wellbeing.',
    'Which conclusion stays within the evidence?',
    ['Frequent walking was associated with higher reported wellbeing.', 'Frequent walking caused every participant to become happier.'],
    'Frequent walking was associated with higher reported wellbeing.')
]);

function exercise(id, targetError, stage, passage, question, options, answer) {
  return { id, target_error: targetError, stage, passage, question, options, answer, data_origin: 'original_project_content' };
}

export function getExerciseSet(primaryError) {
  const immediate = EXERCISES.find((item) => item.target_error === primaryError && item.stage === 'immediate');
  const transfer = EXERCISES.find((item) => item.target_error === primaryError && item.stage === 'transfer');
  if (!immediate || !transfer) return null;
  return { immediate: publicExercise(immediate), transfer: publicExercise(transfer) };
}

export function getPublicExercise(id) {
  const item = EXERCISES.find((exerciseItem) => exerciseItem.id === id);
  return item ? publicExercise(item) : null;
}

export function checkExercise(id, submittedAnswer) {
  const item = EXERCISES.find((exerciseItem) => exerciseItem.id === id);
  if (!item) return { valid: false, status: 'exercise_not_found' };
  const correct = normalize(submittedAnswer) === normalize(item.answer);
  return {
    valid: true,
    status: 'checked',
    exercise_id: item.id,
    target_error: item.target_error,
    stage: item.stage,
    correct,
    correct_answer: item.answer,
    feedback: correct
      ? item.stage === 'transfer'
        ? '迁移题回答正确。系统已记录你在新材料中的无辅助表现。'
        : '回答正确。请继续完成迁移题，确认你能在新材料中独立应用。'
      : item.stage === 'transfer'
        ? '迁移题尚未答对。系统会保留这次无辅助结果，而不是把即时练习正确当作已经掌握。'
        : '这次还没有选中唯一受到原文支持的答案。请回到原文，只使用明确证据。'
  };
}

export function publicExerciseCheckResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return { valid: false, status: 'invalid_exercise_result' };
  const { correct_answer, ...safe } = result;
  return structuredClone(safe);
}

export function validateExerciseBank() {
  const ids = new Set();
  const errors = [];
  for (const item of EXERCISES) {
    if (ids.has(item.id)) errors.push(`${item.id}: duplicate id`);
    ids.add(item.id);
    if (!item.options.includes(item.answer)) errors.push(`${item.id}: answer not in options`);
    if (new Set(item.options.map(normalize)).size !== item.options.length) errors.push(`${item.id}: duplicate options`);
    if (!['immediate', 'transfer'].includes(item.stage)) errors.push(`${item.id}: invalid stage`);
  }
  return { valid: errors.length === 0, count: EXERCISES.length, errors };
}

export function getExerciseReviewItems() {
  return EXERCISES.map((item) => ({
    ...structuredClone(item),
    review_status: 'pending',
    targets_primary_error: null,
    original_content: null,
    unique_answer: null,
    answer_correct: null,
    difficulty_appropriate: null,
    no_answer_leak: null,
    blind_answer: null,
    blind_target_error: null,
    blind_revealed_at: null,
    reviewer_notes: '',
    reviewer_id: null,
    reviewer_role: null,
    qualification_attested: false,
    independence_attested: false,
    review_track: null,
    review_protocol_version: null,
    reviewed_at: null
  }));
}

function publicExercise(item) {
  const { answer, ...safe } = item;
  return structuredClone(safe);
}

function normalize(value = '') {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

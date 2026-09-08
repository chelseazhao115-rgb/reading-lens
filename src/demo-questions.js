export const DEMO_QUESTIONS = Object.freeze([
  question(
    'demo_fox_001', 'Urban foxes and city life',
    'Urban foxes often rest in gardens during daylight. Their main feeding areas, however, are bins behind restaurants after dark. Researchers say the animals choose these sites because discarded food is more predictable than natural prey.',
    'Urban foxes mainly find food in private gardens.', 'FALSE',
    'Their main feeding areas, however, are bins behind restaurants after dark.',
    mapping('mainly find food', 'main feeding areas', '题干用动词短语描述主要觅食地点，原文用名词短语表达同一判断维度。')
  ),
  question(
    'demo_square_002', 'Traffic in the town square',
    'For many years, buses and private cars crossed the central square. The council later prohibited private cars from entering the square between noon and six, while scheduled buses continued to use the route.',
    'Cars were banned from the square for part of the day.', 'TRUE',
    'The council later prohibited private cars from entering the square between noon and six',
    mapping('Cars were banned', 'prohibited private cars from entering', '“be banned”与“prohibit … from entering”都表示禁止进入。')
  ),
  question(
    'demo_insulation_003', 'A building insulation trial',
    'Engineers monitored an office building for twelve months after insulation was installed. The insulation reduced heat loss during winter but did not lower the building’s summer temperature.',
    'The insulation made the building cooler in summer.', 'FALSE',
    'did not lower the building’s summer temperature.',
    mapping('made the building cooler in summer', 'lower the building’s summer temperature', '“make … cooler”对应“lower … temperature”；原文的did not决定两者是否成立。')
  ),
  question(
    'demo_forest_004', 'Two forest surveys',
    'The article describes the northern forest, where researchers counted 46 tree species. It contains no information about the number of species in the southern forest.',
    'The southern forest contains fewer tree species.', 'NOT GIVEN',
    'It contains no information about the number of species in the southern forest.',
    mapping('contains fewer tree species', 'no information about the number of species', '原文没有提供南部森林的数量，不能建立“更少”的比较。')
  ),
  question(
    'demo_fountains_005', 'Water access on campus',
    'The university installed more water fountains across the campus in June. A later report recorded where the fountains were placed but did not measure how much water students drank.',
    'Students drank more water after June.', 'NOT GIVEN',
    'A later report recorded where the fountains were placed but did not measure how much water students drank.',
    mapping('drank more water', 'did not measure how much water students drank', '原文明确说明没有测量饮水量，因此无法判断是否增加。')
  )
]);

export function findDemoQuestion(id) {
  const item = DEMO_QUESTIONS.find((questionItem) => questionItem.id === id);
  return item ? structuredClone(item) : null;
}

export function publicDemoQuestions() {
  return DEMO_QUESTIONS.map(({ correct_answer, standard_evidence, diagnostic_support, ...item }) => structuredClone(item));
}

function question(id, title, passage, prompt, correctAnswer, standardQuote, diagnosticSupport) {
  return Object.freeze({
    id, title, passage, question_type: 'TRUE_FALSE_NOT_GIVEN', question: prompt,
    correct_answer: correctAnswer, standard_evidence: Object.freeze({ quote: standardQuote }),
    diagnostic_support: Object.freeze({
      ...diagnosticSupport,
      answer_rule: Object.freeze(answerRule(correctAnswer))
    }),
    data_origin: 'original_project_content'
  });
}

function answerRule(correctAnswer) {
  const rules = {
    TRUE: { answer: 'TRUE', explanation: '原文提供了足够信息，并且与题干判断一致。' },
    FALSE: { answer: 'FALSE', explanation: '原文提供了足够信息，但与题干判断矛盾。' },
    'NOT GIVEN': { answer: 'NOT GIVEN', explanation: '原文没有提供足够信息判断题干是否成立。' }
  };
  return rules[correctAnswer];
}

function mapping(questionExpression, passageExpression, explanation) {
  return { paraphrase_mapping: Object.freeze({ question_expression: questionExpression, passage_expression: passageExpression, explanation }) };
}

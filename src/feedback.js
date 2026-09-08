const FEEDBACK = Object.freeze({
  location: {
    where: '错误发生在寻找决定性证据的第一步。你选择的句子与主题相关，但没有回答题干中的主要判断。',
    why: '主题词重复只能说明内容相关，不能证明该句支持答案。标准证据需要直接说明题干中的完整判断。',
    fix: '先圈出题干的判断对象和限定词，再寻找能够直接支持或否定完整判断的最小证据句。'
  },
  paraphrase: {
    where: '证据位置正确，但题干与原文之间的语义对应没有被识别。',
    why: '雅思阅读经常用不同词形或表达方式复述同一含义，不能只依赖原词重复。',
    fix: '把题干改写成更简单的含义，再逐项比较原文中的动作、对象、程度和方向是否一致。'
  },
  sentence_comprehension: {
    where: '证据位置正确，但对证据句中的词义、结构或逻辑关系理解有误。',
    why: '否定、转折、指代、比较、范围或程度等细节会改变整句结论。',
    fix: '先找主干，再标记否定、转折和限定词，最后用自己的话复述整句后再判断。'
  },
  question_strategy: {
    where: '原文理解基本正确，但在把证据映射到题型规则时发生了错误。',
    why: '例如Not Given表示原文无法判断，而False表示原文给出了相反信息，两者不能互换。',
    fix: '先判断原文是否提供了足够信息，再判断信息与题干是一致、矛盾还是无法确定。'
  },
  over_inference: {
    where: '错误发生在从证据得出结论的边界。判断中加入了原文没有明确提供的信息。',
    why: '合理、常见或可能发生的事情，不等于原文已经证明的事情。',
    fix: '删掉常识和因果猜测，只保留能够用原文具体词句逐项支持的结论。'
  }
});

export function feedbackFor(primaryError, diagnosticSupport = null) {
  if (!FEEDBACK[primaryError]) return null;
  const feedback = structuredClone(FEEDBACK[primaryError]);
  const mapping = diagnosticSupport?.paraphrase_mapping;
  if (mapping) {
    feedback.specific = {
      question_expression: mapping.question_expression,
      passage_expression: mapping.passage_expression,
      explanation: mapping.explanation,
      action: specificAction(primaryError, mapping, diagnosticSupport?.answer_rule)
    };
  }
  return feedback;
}

function specificAction(primaryError, mapping, answerRule) {
  const question = `“${mapping.question_expression}”`;
  const passage = `“${mapping.passage_expression}”`;
  const actions = {
    location: `先用${question}锁定要判断的完整信息，再寻找直接说明${passage}的决定性句子，不要停在只有主题词相关的句子。`,
    paraphrase: `先把${question}改写成自己的话，再回原文核对${passage}的对象、方向和程度。`,
    sentence_comprehension: `把${passage}中的否定、转折、比较和限定词圈出，再用自己的话复述整句，最后核对${question}。`,
    question_strategy: answerRule
      ? `先判断信息状态：${answerRule.explanation} 所以本题应选${answerRule.answer}；不要只根据是否出现原词选择答案。`
      : `先判断原文信息与${question}是一致、矛盾还是不足，再映射到TRUE、FALSE或NOT GIVEN。`,
    over_inference: `逐项检查${question}能否由${passage}直接支持；不能在原文中指出依据的部分全部删掉。`
  };
  return actions[primaryError];
}

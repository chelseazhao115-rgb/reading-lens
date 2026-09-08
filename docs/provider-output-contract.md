# Diagnostic Provider Output Contract

任何未来语义Provider都位于Input、Evidence和Question三道确定性闸门之后。Provider输出还必须通过`src/provider-output.js`，不能直接进入反馈或练习模块。

## 服务端权威字段

- `answer_result`由`user_answer`与`correct_answer`比较得到，Provider不能覆盖。
- `confidence_language`由最终置信度阈值生成，Provider不能自定义。
- `requires_teacher_review`由状态和最终置信度生成。
- `provider`、`prompt_version`、`prompt_hash`和`model_version`来自Provider配置，不接受模型正文返回。

## 因果链

诊断必须恰好包含五个步骤。主要错因之前的步骤必须为`pass`，错因步骤必须为`fail`，后续步骤必须为`not_assessed`。例如`question_strategy`只能对应：

```json
{
  "evidence_location": "pass",
  "semantic_mapping": "pass",
  "sentence_understanding": "pass",
  "question_rule": "fail",
  "reasoning_boundary": "not_assessed"
}
```

## 置信度

Provider可以提出0至1的原始置信度，但服务端根据证据有效性、判断过程完整性、因果链一致性、竞争类别和历史一致性计算上限，最终值取两者较低值。低于0.60不能返回确定性诊断。

## Fail Closed

非法类别、跳过因果步骤、缺少证据确认、自相矛盾状态、超范围置信度、非结构化输出或Provider异常都会返回：

```json
{
  "status": "abstained",
  "primary_error": "insufficient_information",
  "requires_teacher_review": true,
  "guard_reason_code": "provider_output_validation_failed"
}
```

原始上游错误不会返回给学生。JSON结构参考`docs/provider-output-contract.json`；运行时因果一致性规则比静态Schema更严格。

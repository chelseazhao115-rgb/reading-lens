# Iteration 017: Provider Output Safety Contract

## Before

- Input、标准证据与题目状态已有确定性闸门，但服务端会直接展开Provider返回值。
- Provider可以返回非法一级标签、跳过因果步骤、覆盖作答结果或输出矛盾置信度，随后进入反馈与练习模块。
- Confidence字段虽然存在，但服务层没有确定性上限，未来LLM可能单方面给出高置信值。

## Change

- 新增运行时Provider输出契约和JSON Schema。
- 服务端重新计算`answer_result`、`lucky_correct`、`confidence_language`和`requires_teacher_review`。
- 五步trace必须严格符合主要错因的因果位置：之前步骤pass、当前步骤fail、后续步骤not assessed。
- 根据Evidence、Reasoning、trace一致性、竞争类别和历史一致性计算置信度上限，最终值取Provider值与上限的较低值。
- Provider异常、非法标签、跳步、缺少证据确认、低置信确定诊断或非结构化结果全部fail closed。
- 新增5类恶意Provider挑战与8项回归测试。

## After

- 恶意或矛盾Provider输出接受率：100%可穿透 → 0/5。
- Provider不能覆盖服务端作答结果。
- Provider异常不泄露原始上游错误，同时保留Provider、Prompt和模型版本用于复现。
- 诊断trace从`not_observed`改为明确的`pass / fail / not_assessed`。

## Regression

- 80项自动化测试通过。
- 12条框架基线、8条困难边界、50条冻结预测完整性和练习闭环没有回归。

## Remaining Risk

- 输出契约证明系统能拦截坏输出，不证明真实语义Provider能够正确分类。
- 置信度上限仍需在Teacher Gold上校准；当前只证明规则与安全边界成立。

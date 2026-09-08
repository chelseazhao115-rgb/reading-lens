# Iteration 023 — Teacher Gold来源准入

## Before

- 10条试审虽然状态完整，但审核者编号均为`browser-validation`。
- 这只能证明盲审页面流程被操作过，不能证明标签来自雅思阅读教师。
- 旧逻辑只要求审核者编号、标签和时间，流程验证记录可能错误进入Teacher Gold。

## Change

- 诊断与微练习审核均要求`reviewer_role=ielts_reading_teacher`和`qualification_attested=true`。
- `browser-validation`、automation、demo、test等保留编号由服务端拒绝。
- 旧记录原样保留作为流程验证证据，但不进入Gold，不删除也不改写。
- 试审检查点新增教师来源数、来源问题数和`ready_to_continue`。
- 审核页自动从第一条缺教师来源的记录开始，重新审核后继续寻找下一条未准入记录。
- 案例页与进度显示使用`gold_eligible`，不再把所有approved状态称为Teacher Gold。
- 诊断审核协议最终冻结为`diagnostic-causal-blind-v3`：除隐藏历史标签外，必须同时提交与标签一致的最早失败步骤和至少8字符的专业依据。微练习保持`exercise-two-stage-v2`。
- 对所有未准入历史记录，API把旧标签、说明、审核者和时间清空后再发送给重审页面，避免教师受到锚定；底层审计记录不变。

## After

- 截至本轮运行时验收，24条旧版或流程验证记录全部被来源与协议闸门排除，正式Teacher Gold为0。
- 试审教师来源0/10、来源问题10条、`ready_to_continue=false`。
- 旧字段绕过和保留编号伪装均被HTTP 400拒绝。
- 诊断与微练习两条审核链路均受来源与协议闸门保护，103项回归全部通过。

## Regression

- 现有审核记录未删除。
- 模型预测、拟议标签和置信度仍对审核者隐藏。
- 官方Accuracy、Macro F1、混淆矩阵继续保持N/A。

# Iteration 047 — DeepSeek真实失败驱动的边界Prompt修正

## Before

- `diagnostic-causal-v1`在8条真实DeepSeek边界评测中仅4/8正确，不安全确定性诊断率50%。
- 两条`paraphrase`稳定误判为`sentence_comprehension`；两条`question_strategy`稳定误判为`over_inference`。
- 四个错误均输出0.85，模型把固定高置信当成默认值。

## Change

- 升级为`diagnostic-causal-v2`，加入两组互斥操作定义和最早失败步骤tie-break规则。
- 明确“题干—原文词义对应失败”属于`paraphrase`；只有证据句内部关系理解失败才属于`sentence_comprehension`。
- 明确“无信息所以判FALSE”属于`question_strategy`；加入文本外实体结论才属于`over_inference`。
- 若相邻类别仍无法稳定区分，要求低于0.60并安全拒答；禁止固定使用0.85。
- DeepSeek剩余评测门禁现在同时校验模型、Prompt版本和Prompt哈希，旧smoke不能放行新Prompt。

## After

- 零成本自动化断言已锁定四条真实失败对应的边界规则。
- DeepSeek v2真实复测为6/8正确（75%）、错误确定性诊断0/8、拒答2/8；v1为4/8正确且错误确定性诊断4/8。分类安全显著改善，但样本仅8条且为项目原创边界集。
- 两条拒答均来自Provider契约失败：一条缺少合法标量字段，一条因果trace顺序非法，输出契约失败率25%，候选仍不得晋级。
- 适配器增加本地结构/因果校验失败自动重试一次；调用前最坏成本预留现在乘以最大尝试次数，成功与最终失败均累计所有已发生调用成本。
- v2成功smoke加其余7条记录成本0.00187866美元；另有一次已审计失败smoke为0.0002443美元。最早一次失败发生在成本审计修复前，费用无法从现有artifact可靠恢复，因此不宣称精确总成本。

## Regression

- 五类一级错因、五步因果顺序、标准证据闸门和结构化输出契约未改变。

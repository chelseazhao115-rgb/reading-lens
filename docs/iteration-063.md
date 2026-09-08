# Iteration 063 — DeepSeek v3输出契约离线修复

## Before

- DeepSeek v2真实评测为6/8正确、0条不安全、2/8契约失败，未达到晋级门槛。
- `challenge_location_vs_paraphrase_paraphrase`连续返回非标量顶层字段，触发`invalid_status`与`invalid_confidence`。
- `challenge_sentence_vs_strategy_sentence`分类本身为`sentence_comprehension`，但把失败步骤之后的`question_rule`标成`pass`，触发`decision_trace_causal_order_invalid`。
- 兼容适配器虽然重试一次，但第二次原样发送同一提示，没有告诉模型上一轮具体违反了哪个契约。

## Change

- Prompt升级为`diagnostic-causal-v3`并生成新SHA-256哈希。
- 明确规定status、label、confidence和reason必须为标量，禁止数组/对象包装。
- 为五类诊断与correct状态写入唯一合法的完整`decision_trace`模板；首次fail之后所有步骤必须为`not_assessed`。
- 第二次调用在保持原诊断任务不变的前提下，附加本地校验错误和“返回完整新JSON而非patch”的定向修复指令。
- 最坏预算预估增加修复指令输入Token，避免重试能力绕过预算保护。
- v3付费脚本写入`deepseek-v3-smoke.json`与`deepseek-v3-remaining.json`；v2真实Artifact不会被覆盖。
- 文档Schema收紧为七个必填字段、标量类型与`additionalProperties=false`。

## After

- 178/178项自动化测试通过。
- 定向测试分别覆盖非标量字段重试和正确分类/错误trace重试；第二次请求包含对应本地错误代码，并保持原分类任务。
- v3提示包共8条，`gold_labels_included=false`，版本为`diagnostic-causal-v3`，哈希为`20120047dd2f3a71cea7d2506ed8966252a14dab7af408312caa8b4ced094de4`。
- 免费合成评测保持通过；v2候选证据聚合测试仍通过。

## Regression

- 本轮没有调用DeepSeek API，新增费用为0。
- v3尚无真实模型结果，不能宣称契约失败率从25%下降，也不能覆盖v2案例页证据。
- 真实验证仍必须先跑1条smoke；成功后才允许剩余7条。Iteration 064将600输出Token下的硬预算分配校准为`$0.0013 + $0.0087`，合计上限为$0.01。

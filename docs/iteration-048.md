# Iteration 048 — P004正确答案被NOT GIVEN关键词误诊

## Before

- P004在原创题4和题5均给出正确的`NOT GIVEN`、有效证据和合理推理，但结果显示“答案正确，但证据或推理存在问题”。
- 删除推理中的`NOT GIVEN`后结果变为正确，说明诊断对单个词组敏感。
- 根因是规则Provider把任何`/not given/i`命中都视为`question_strategy`，再通过`lucky_correct`路径输出错因和通用反馈。

## Change

- 删除`NOT GIVEN`、`FALSE means`、`TRUE means`等脱离语境的单词级触发器。
- 题型策略信号只匹配明确的错误规则表达，例如“信息未提到，所以选FALSE”或“措辞不完全相同就选NOT GIVEN”。
- 新增P004题4、题5回归案例，覆盖中文和英文合理推理、完整与较短有效证据。
- 保留真正的“答案碰巧正确但证据位置错误”诊断路径，不取消`lucky_correct`能力。

## After

- P004题4、题5的合理`NOT GIVEN`推理返回`correct`，不再进入`lucky_correct`或写入错因。
- 第一次收窄规则使两个明确策略错误案例安全拒答；补充上下文模式后恢复识别，同时没有恢复单词级触发器。
- 全量158项自动化测试通过；合成框架指标恢复到修改前基线，无安全回退。
- 重启本地服务后通过真实`/api/diagnose`验证题4、题5：均为`status=correct`、`primary_error=null`、`lucky_correct=false`。

## Regression

- 标准证据和用户证据仍必须能在权威原文中定位；明确错误的题型规则仍应诊断为`question_strategy`。

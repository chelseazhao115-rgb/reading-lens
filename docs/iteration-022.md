# Iteration 022 — 首次用户研究事件血缘

## Before

- 研究者手工填写“证据提交成功”和完整任务耗时。
- 产品Demo事件与研究记录没有会话级关联，无法证明某条记录对应真实产品行为。
- 安全拒答显示在页面上，但没有记录为可验证的诊断终态。

## Change

- 研究页在匿名同意后生成随机`research_session_id`和专属产品链接。
- 产品页把会话ID自动附加到每条行为事件；无有效链接时不附加。
- 研究页只提取同一会话中有序的`question_started → answer_submitted → evidence_submitted → diagnosis_completed → diagnosis_viewed`链。
- 证据提交成功与任务耗时由事件生成，观察者无法仅靠表单声称完成。
- 对诊断路径，只有出现`transfer_completed`才可声称完整无帮助完成；正确或安全拒答路径在结果页终止。
- 已验证开始但中途退出的会话允许作为失败样本保存，并强制`unassisted_completion=false`，避免只保留完成者造成幸存者偏差。
- 安全拒答现在记录`diagnosis_completed/viewed`，但不会被算作成功分类。
- 纠错不能替换原始研究会话，导出Schema升级为v2。

## After

- 98项回归全部通过。
- 缺事件、跨会话事件或诊断后缺迁移事件都不能支撑“完整无帮助完成”。
- 真实目标用户记录仍不足，所有真实可用性指标继续保持N/A。

## Regression

- Demo Analytics仍与Real User Research分开。
- 参与者同意、匿名编号、纠错与撤回机制保留。
- 未修改目标用户、五类错因或核心学习流程。

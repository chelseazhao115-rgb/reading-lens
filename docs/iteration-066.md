# Iteration 066 — Provider失败原因的隐私安全可观测性

## Before

- DeepSeek v3唯一失败在Artifact中只显示`provider_request_failed`。
- JSON解析失败、空输出、HTTP错误和Schema违规无法区分，下一轮无法基于真实失败类型制定修复。
- 直接保存原始响应会带来学生文本、上游错误详情或密钥泄露风险，因此不能作为解决方案。

## Change

- Provider现在把响应体JSON失败与`output_text` JSON失败分别标记为`provider_response_json_invalid`和`provider_output_json_invalid`。
- `output_text` JSON失败允许一次受预算保护的修复重试，并把固定错误码加入已有的有限长度repair message。
- 诊断安全闸门只允许输出固定白名单错误码；未知异常仍统一降级为`provider_request_failed`。
- Provider错误消息、原始响应、学生文本和API Key均不会写入评测Artifact。
- 后续benchmark逐条记录`provider_failure_code`，同时保留原有安全拒答、成本和延迟字段。

## After

- 新增3项回归：JSON修复重试、重试耗尽后的错误码与成本、安全遥测不泄露原始异常。
- 自动测试183/183通过。
- 既有v3 Artifact没有被追溯改写；它只能证明当时是未知请求失败，不能事后猜测具体原因。

## Regression

- 失败仍然fail closed，不会生成确定性诊断。
- 最大尝试次数仍为2，预算预留逻辑不变。
- 学生端Provider仍为规则基线，未发生自动晋级。

## Next

- 新错误码会在下一次经批准的真实Provider评测中提供可操作证据；在此之前不追加付费调用。
- 当前产品证据优先级回到独立教师Gold、微练习教师审核和P004修复后用户复测。

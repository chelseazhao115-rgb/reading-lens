# Iteration 045 — Provider超时与评测口径统一

## Before

- Eval把24条旧浏览器测试记录显示为`approved`，虽然Gold仍为0，存在指标误读风险。
- Provider异常会安全拒答，但无响应的Provider没有请求超时，未来接入语义模型时可能阻塞核心诊断。

## Change

- Eval审核汇总改用当前盲审协议口径；旧记录只进入`provenance_excluded`。
- Diagnostic Service增加默认15秒超时、AbortSignal和`provider_timeout`安全原因码。
- Provider晋级新增P95延迟门槛，默认不得超过5000毫秒；CLI和Eval Results同步展示。
- 超时仍返回信息不足与教师确认，不泄露上游错误。

## After

- Eval显示50条待审、0条当前批准、24条来源排除、Gold 0/50。
- 永不返回的测试Provider在10毫秒阈值后被中止并安全拒答。
- 自动化测试148项全部通过。

## Regression

- 标准证据、用户证据和问题三道确定性闸门仍先于Provider调用。
- 未连接或调用任何付费模型，成本保持0。

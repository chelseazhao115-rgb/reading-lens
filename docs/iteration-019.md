# Iteration 019: Blind Prompt Pack and Fixture Replay

## Before

- Provider benchmark只能直接调用已接入Provider；未授权付费服务时无法比较新的语义候选。
- 手工把Gold标签与模型输入放在同一文件会造成评测泄漏。
- 外部模型结果缺少统一的ID、版本、延迟和成本完整性校验。

## Change

- 生成8条JSONL盲测Prompt包，只包含输入、统一指令和Schema引用，不包含Gold、期望结果或基线预测。
- 新增fixture Provider，可离线回放任何已生成的结构化输出。
- fixture必须完整覆盖8个固定ID，并校验重复、未知ID、模型版本、延迟和成本。
- 回放结果继续经过服务端Provider输出契约、置信度上限和promotion gate。
- 新增可复现的离线使用指南，不要求产品持有API Key。

## After

- Prompt包：8/8输入存在，Gold标签泄漏0条。
- fixture完整性对缺失、重复、未知案例和无效telemetry全部fail closed。
- 规则参考基线仍保持12.5%精确分类、0%不安全诊断、87.5%拒答和0美元成本。
- 教师试审当前已启动，实时进度与Provider盲测相互隔离。

## Regression

- 86项自动化测试通过。
- Teacher Gold、产品API、核心闭环和Provider参考artifact没有回归。

## Remaining Risk

- 尚未获得任何真实语义模型fixture。
- Prompt包标签仍由项目作者在独立评测文件中定义，不等于Teacher Gold。
- 离线回放依赖操作者如实记录模型版本、实际延迟和成本。

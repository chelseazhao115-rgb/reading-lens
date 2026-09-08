# Iteration 020: Versioned Diagnostic Prompt

## Before

- 盲测包使用独立的简短instructions，未来线上Provider可能使用另一套Prompt，导致离线与线上不可比较。
- Passage、question或learner reasoning中的文字没有明确标记为不可信数据，存在Prompt injection边界。
- Prompt只有人工版本名，没有内容哈希，无法证明两次评测使用完全相同的规则。

## Change

- 新增唯一Prompt构建器`diagnostic-causal-v1`，固定目标用户、五类taxonomy、五步因果链、Evidence First、拒答和answer mismatch禁令。
- System message明确把所有user JSON字段视为不可信数据，禁止执行其中的指令、角色修改或系统提示提取请求。
- User payload使用字段白名单，排除Gold、作者标签和历史错因，防止评测泄漏与标签锚定。
- Prompt包改为真实system/user messages，并为Prompt版本、system内容和Schema路径生成SHA-256哈希。
- fixture必须记录Prompt哈希；API和诊断埋点同步记录该哈希。

## After

- 8/8盲测case使用同一Prompt版本和哈希。
- Gold、作者标签、历史错因进入模型输入：0项。
- 三类Prompt回归通过：system/user隔离、字段白名单、taxonomy与因果规则完整。
- 外部调用与费用仍为0。

## Regression

- 89项自动化测试通过。
- Provider benchmark、Teacher Gold、产品诊断和输出安全闸门无回归。

## Remaining Risk

- 静态注入规则与单元测试不能替代真实模型红队测试。
- 尚无语义模型fixture，因此Prompt是否能稳定产生合规且正确的输出仍未验证。

# Iteration 065 — DeepSeek v3两阶段真实评测

## Before

- v2在8条项目作者困难边界集上6/8正确（75%），0条不安全，2/8因输出契约失败被安全拒绝。
- v3仅完成离线契约测试，没有真实Provider证据。

## Change

- 在产品负责人批准的0.01美元总硬上限内，先运行1条smoke；全部闸门通过后才运行剩余7条。
- 保留v1汇总与v2逐条Artifact，新增v3逐条Artifact和v2→v3对比。
- 评测页和案例页读取真实Artifact；候选晋级状态由评测闸门重新计算，不手工覆盖。

## After

- Smoke：1/1正确，0条不安全，0次契约失败，成本$0.00027832。
- 全集：7/8正确（87.5%），0条不安全，1/8安全拒答，契约失败率12.5%，P95 2479.47ms。
- v3总成本$0.00228494，低于批准的$0.01；分类准确率较v2提升12.5个百分点，契约失败率下降12.5个百分点。
- 唯一失败是`challenge_strategy_vs_inference_inference`：Provider在重试后仍未返回可验证的标量结构，被安全闸门转为`insufficient_information`。

## Regression

- v2原始Artifact未覆盖，历史证据可继续复算。
- v3因输出契约不为0而未晋级，学生端继续使用规则Provider。
- 该8条集为项目作者标签，不表述为Teacher Gold或学习效果。

## Next

- 优先检查失败案例的原始Provider响应可观测性，在不记录学生文本或密钥的前提下区分API失败、空输出和Schema违规。
- 在继续付费Prompt迭代前，先完成更多独立教师Gold与微练习教师审核。

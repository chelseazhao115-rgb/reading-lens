# Iteration 015: Adversarial Boundary Safety

## Before

- 12条合成框架样本的分类准确率为100%，但学生判断过程包含规则引擎使用的显式提示词。
- 在不包含提示词的8条自然表达边界样本上，精确分类准确率仅37.5%。
- 5/8错误分类仍以0.70输出确定诊断，不安全边界诊断率为62.5%。

## Change

- 新增8条原创困难边界挑战，成对覆盖 location / paraphrase、paraphrase / sentence comprehension、sentence comprehension / question strategy、question strategy / over inference。
- 挑战样本不使用规则引擎的显式触发短语，并与Teacher Gold严格分区展示。
- 新增精确分类、错误且仍确定诊断、安全拒答和逐例结果。
- 当证据正确但规则未观察到任何语义错因信号时，不再默认归为sentence comprehension，而是以0.55返回 insufficient information 并要求教师复核。
- 规则Provider升级为 `deterministic-v2-safe-abstention`，重新冻结50条待审预测。

## After

- 困难边界不安全确定诊断率：62.5% → 0%。
- 困难边界拒答率：0% → 87.5%。
- 困难边界精确分类准确率：37.5% → 12.5%，因为未知案例不再用猜测标签制造表面准确率。
- 12条同源框架回归仍为100%，但页面同时呈现困难挑战，避免单一数字误导。

## Regression

- 69项自动化测试通过。
- Evidence gate、正确路径、练习闭环、Teacher Gold门槛与预测快照完整性未回归。

## Remaining Risk

- 87.5%的困难边界拒答率说明规则基线不具备自然语言语义诊断能力。
- 挑战标签由项目作者定义，不等于独立教师Gold。
- 下一步仍需真实语义Provider与教师盲审，才能同时降低拒答和误诊。

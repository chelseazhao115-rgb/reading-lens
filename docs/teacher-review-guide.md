# 教师评测复核指南

## 文件

- `evals/review-pack.csv`：适合在Excel中逐条复核。
- `evals/review-pack.json`：同一批候选的结构化版本。
- `evals/reviewed.json`：只有运行导入命令后才会生成。

这50条记录均为项目生成的合成候选，不是Gold Label。

## 推荐方式：本地盲审页面

启动产品后打开：

`http://localhost:4173/review.html`

页面不会向浏览器发送作者拟议标签、实际预测标签或预测置信度，可以减少审核锚定。审核者必须使用非测试的稳定匿名编号，并明确确认自己具有雅思阅读教学或正式教研经验；逐条选择标签并批准、拒绝或标记需修订。审核记录会保存到`evals/reviewed.json`。

`browser-validation`、`automation`、`demo`、`test`等编号只适合验证页面流程，永远不能进入Teacher Gold。历史流程验证记录会原样保留，但必须由教师重新审核并写入资质声明后才能准入。

正式浏览器提交必须记录`review_protocol_version=diagnostic-causal-blind-v3`。该冻结版本证明API已经隐藏所有不合格历史标签，并要求标签、最早失败步骤和专业依据三者一致；从旧页面或旧客户端提交的教师声明不会自动升级。

页面提供两个严格隔离的入口：项目作者QA用于发现材料和标签问题，记录写入独立`author_qa`区域且永不进入Gold；独立教师Gold盲审要求审核者未参与案例编写或标签设计。独立页面不会展示作者QA标签。

首批10条覆盖五类主要错因、`insufficient_information`、`ambiguous_question`和`data_error`三种特殊状态，并补充两个容易混淆的边界候选。完成10条后先检查是否存在需修订或拒绝的样本，再继续剩余40条。试审阶段不展示作者标签、模型预测、置信度或一致率；10条也不会替代50条正式Teacher Gold门槛。

每条案例由服务端附带审核版本令牌。若另一审核会话已先更新该案例，旧页面的提交会以409拒绝并自动重新加载最新状态，不会覆盖先保存的教师判断。出现冲突提示时，应重新阅读最新案例状态后再继续，不要通过刷新接口或手工修改令牌绕过。

CSV方式仍然保留，适合批量复核或备份。

CSV同样不包含作者拟议标签、实际预测标签或置信度。导入时系统根据不可修改的案例ID重新附加冻结预测快照，避免审核者提前看到预测，也避免CSV修改模型结果。

## 需要填写的列

| 列 | 填写规则 |
|---|---|
| `review_status` | `approved`、`rejected`或`needs_revision` |
| `reviewer_label` | 只有approved时填写；必须是五类一级错因或三个特殊状态之一 |
| `reviewer_failed_step` | approved时必须填写；五类依次映射证据定位、同义替换、句子理解、题型规则、推理边界，特殊状态填写`not_applicable` |
| `reviewer_notes` | 所有状态都必须填写至少8个字符，说明证据和学生思路为何支持该判断 |
| `reviewer_id` | 可使用匿名稳定编号，如`teacher-001` |
| `reviewer_role` | 必须为`ielts_reading_teacher` |
| `qualification_attested` | 教师本人确认后填写`true` |
| `independence_attested` | 独立教师确认未参与案例编写和标签设计后填写`true`；作者QA不得填写为独立 |
| `review_track` | 正式Gold为`independent_teacher_gold`；项目作者检查为`author_qa`且写入独立轨道 |
| `review_protocol_version` | 新版浏览器自动填写`diagnostic-causal-blind-v3`；CSV导入时必须明确填写 |
| `reviewed_at` | ISO时间，如`2026-08-22T10:30:00+08:00` |

一级标签只能是：

- `location`
- `paraphrase`
- `sentence_comprehension`
- `question_strategy`
- `over_inference`
- `insufficient_information`
- `ambiguous_question`
- `data_error`

## 复核顺序

1. 标准证据是否为支持标准答案的最小充分证据。
2. 学生证据是否位于正确区域。
3. 学生思考过程是否足以支持错因判断。
4. 按固定因果链判断最先发生的主要错误。
5. 若信息不足，不要勉强选择五类错因。
6. 若题目本身多解，选择`ambiguous_question`。
7. 若标准答案或标准证据异常，选择`data_error`。

## 导入

在Excel中保存CSV后运行：

```powershell
npm run eval:import-review
```

导入器会拒绝：

- 少于或多于50条；
- 重复ID；
- 非法一级标签；
- 非数据错误样本的标准证据无法匹配原文；
- 缺少必要字段。
- 冻结预测标签、置信度、Provider或模型版本缺失或被修改。

只有同时满足以下条件的记录才进入Gold：

```text
review_status = approved
reviewer_label 合法
reviewer_id 非空
reviewer_id 不是测试/自动化保留编号
reviewer_role = ielts_reading_teacher
qualification_attested = true
independence_attested = true
review_track = independent_teacher_gold
review_protocol_version = diagnostic-causal-blind-v3
reviewer_failed_step 与 reviewer_label 映射一致
reviewer_notes 至少8个字符
reviewed_at 为有效时间
```

匿名编号不可跨轨道复用：独立教师编号必须为`teacher-`开头，项目作者QA编号必须为`author-`开头。两个页面使用不同的本地缓存键；服务端也会拒绝把`author-001`提交到Gold轨道或把`teacher-001`提交到作者QA轨道。

拟议标签、pending状态或只填写approved但没有审核者与时间，都不会进入教师一致率。

完成50条Gold后，评测输出真实预测相对教师标签的Accuracy、Macro F1、5×5混淆矩阵，以及0.60–0.69、0.70–0.79、0.80–0.89、0.90–1.00四个置信度桶。当前规则基线的作者拟议标签与真实预测有12条差异，因此禁止使用作者拟议标签代替系统预测。

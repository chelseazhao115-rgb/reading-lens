# 微练习教师质量复核指南

优先打开 `http://localhost:4173/exercise-review-start.html` 阅读独立性、两阶段规则和当前服务端进度，再进入浏览器盲审。审核者必须具有雅思阅读教学或正式教研经验、未参与这些练习/答案/目标标签的编写，并使用`teacher-`开头的稳定匿名编号。新版页面自动记录`independence_attested=true`、`review_track=independent_teacher_exercise`和`review_protocol_version=exercise-two-stage-v3`。第一阶段不展示内部语义ID、标准答案、目标错因与练习阶段；教师必须先独立选择答案和主要训练错因，提交后立即锁定且不可修改。第二阶段才揭示标准信息并审核以下六项：

当前服务只监听`127.0.0.1:4173`，不能把localhost链接直接发给另一台电脑。独立老师必须在运行项目的同一台电脑上操作，或通过屏幕共享/远程控制该电脑完成。未经单独的安全与隐私决策，不要改成局域网监听或临时公网暴露。

1. `targets_primary_error`：只训练标注的一级错因；
2. `original_content`：内容原创，不复制原题；
3. `unique_answer`：只有一个合理答案；
4. `answer_correct`：标准答案准确；
5. `difficulty_appropriate`：适合 IELTS Reading 5.5–6.5；
6. `no_answer_leak`：题干、选项和提示未泄露答案。

填写规则：

- 六项均为 `true` 才能设置 `review_status=approved`；
- approved还要求盲答与标准答案一致、盲判错因与目标错因一致；不一致时必须标记相应维度不通过并说明；
- 任一项为 `false` 应设置 `needs_revision` 或 `rejected`；
- 必须填写`teacher-`开头的匿名 `reviewer_id`，确认独立性声明；ISO时间`reviewed_at`由服务端生成；
- `pending`、缺审核者、缺时间或六项未全部通过的题目不得计入教师有效率；
- 不要为了得到 90% 指标把待修改题标成通过。

浏览器页面会在服务端再次执行以下准入：教师编号、资质、未参与编写的独立性、独立教师轨道和v3协议必须同时成立；六项必须全部选择；approved必须六项全部为true；需修订或拒绝必须至少一项为false并填写说明。项目作者自审和旧v2记录不会进入正式指标。自动化测试不会替教师提交审核。

盲判揭示和六维审核保存都带有服务端版本令牌。若另一审核会话已经更新同一道练习，旧页面会收到409、重新加载最新状态，并禁止覆盖已锁定的盲判或教师结论。

也可以运行 `npm run eval:exercise-review-pack` 生成CSV作为审计或导入载体，但CSV同时包含标准答案与目标标签，不能被称为无提示盲审。审核完成后运行 `npm run eval:import-exercise-review`。脚本会拒绝题目、选项、答案或标签被修改的文件，并生成 `evals/exercise-reviewed.json`。教师有效率、盲答一致率和盲判错因一致率在全部10题完成审核前保持 `null`。

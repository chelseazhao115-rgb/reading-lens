# IELTS Reading Diagnostic Coach

面向 IELTS Reading 5.5–6.5 分学习者的错因诊断 MVP。

核心闭环：

`Answer → Evidence → Reasoning → Diagnosis → Correction → Micro Exercise → Transfer → Learner State`

当前阶段以可评测性优先。运行：

```powershell
npm test
npm run eval
npm run eval:provider
npm run eval:provider:deepseek:smoke
npm run eval:provider:deepseek:remaining
npm run eval:provider-pack
npm start
npm run eval:review-pack
npm run eval:import-review
npm run eval:exercise-review-pack
npm run eval:import-exercise-review
```

项目原则与当前差距见 [`docs/gap-analysis.md`](docs/gap-analysis.md)。评测数据为原创、教师标签或明确标注的合成数据，不包含未经授权的雅思真题。

未来语义模型必须遵循[`docs/provider-output-contract.md`](docs/provider-output-contract.md)及对应JSON Schema。服务端会重新验证标签、五步因果链、证据确认和置信度，Provider输出不能直接进入学生反馈。

本地产品启动后访问 `http://localhost:4173`。当前默认使用确定性规则Provider，目的是验证安全闸门和产品闭环，不代表已接入真实语义模型。

用户自有真题 PDF 的导入入口为 `http://localhost:4173/import.html`。网站解析文字版或扫描版 PDF（最大60MB、200页），对缺少文字层的页面自动执行英文 OCR，并识别 Passage 页面、题目、题型、选项和答案候选，再由用户校对并补充标准证据后进入同一套诊断、微练习与迁移闭环。完整 PDF 不写入服务器磁盘；当前练习正文只保存在标签页会话中，关闭标签页后清除。详细边界见 [`docs/pdf-import.md`](docs/pdf-import.md)。

Chrome 插件开发版见 [`docs/chrome-extension.md`](docs/chrome-extension.md)。它在严格识别的爱听写 IELTS 做题页保存答案、高亮、Note与错词，在结果页通过 Side Panel 复用本地诊断和微练习接口，并可生成错词打印学习册。

招聘者案例页为 `http://localhost:4173/case-study.html`。该页面在3至5分钟内串联用户问题、五类错因、因果工作流、安全兜底、实时评测状态、失败边界和验证计划，并嵌入可直接操作的真实产品。

评测结果页为 `http://localhost:4173/evals.html`。该页面明确分隔合成框架基线与Teacher Gold官方结果；Gold不足50条时不会展示校准、混淆或边界结论。运行 `npm run eval` 后刷新最新artifact。

产品页会在当前浏览器保存版本化工作流草稿。刷新后可恢复答案、证据、推理、诊断结果、当前微练习以及即时练习完成后等待进入迁移题的状态；恢复渲染不会重复写入漏斗事件。诊断进入`diagnosed`、`correct`或`abstained`终态后，本题输入会保持锁定，只有开始下一道诊断才解锁，避免重复提交污染诊断次数与复发错因。

产品使用5道项目原创最小诊断题集。错因路径完成迁移题后、正确或安全拒答路径达到诊断终态后，用户可以开始下一次诊断；新一轮保留Learner State并记录新的`question_started`，不扩展为完整题库。

题目正确答案与标准证据由服务端权威题目源持有。公开题目接口不返回Gold，客户端只提交`question_id`和学生行为；未知ID被拒绝，客户端伪造的正确答案、原文或标准证据不会进入诊断。

用户证据也必须能在服务端权威 passage 中逐字定位。来自 passage 的错误句子仍可进入“定位错误”判断；完全不存在于 passage 的文字会在调用Provider前被拒绝，表单保持可编辑。无效证据重试不会重复记录答案、已提交证据或证据用时，刷新后仍保持去重状态。

微练习答案同样只存在于服务端内部。初始练习、答错/答对判分、迁移判分和下一题公开对象均不返回`answer`或`correct_answer`键，确保第一次答错后仍需真实Retry。

练习与迁移判分只有在HTTP成功且响应通过练习ID、错因、阶段和下一题结构契约后才写入Learner State。断网、非2xx或畸形响应不会消耗学生尝试次数，迁移题按钮会恢复并允许重试，下一诊断不会提前解锁。

案例理解测试台位于`http://localhost:4173/portfolio-review.html`，用于验证招聘相关评审者能否在3–5分钟内通过无提示盲回忆复述九项核心内容。少于5名合格记录时结果保持N/A。

零成本Provider基准使用`npm run eval:provider`。它只运行本地规则基线，不连接外部服务；记录困难边界分类、安全拒答、P95延迟和成本，并执行安全、质量、覆盖、输出契约与预算五道发布门槛。

需要离线比较其他模型时，先运行`npm run eval:provider-pack`生成不含Gold标签的JSONL输入包，再按[`docs/provider-benchmark-guide.md`](docs/provider-benchmark-guide.md)整理fixture并回放。该路径不在产品中保存API Key，也不会主动调用外部服务。

经明确批准后，把项目根目录的`.env.example`复制为`.env`，仅在本地填写`DEEPSEEK_API_KEY`。先运行`npm run eval:provider:deepseek:smoke`评测1条；只有保存的冒烟结果通过模型、当前Prompt版本与哈希、非拒答和输出契约检查后，`npm run eval:provider:deepseek:remaining`才允许评测其余7条。两段预算分别硬限制为0.002和0.008美元，总上限0.01美元；每次调用前按最坏输出预留，Key不会写入结果、日志或浏览器。模型与价格配置依据2026-08-31访问的DeepSeek官方Responses API及价格页，变更前必须复核官方信息。

教师复核交接入口为`http://localhost:4173/review-start.html`，配套文字见[`docs/teacher-review-startup-kit.md`](docs/teacher-review-startup-kit.md)和[`docs/teacher-review-guide.md`](docs/teacher-review-guide.md)。只有由声明雅思阅读教师/教研资质、使用非测试稳定编号完成的记录才能进入Gold；`browser-validation`等流程测试记录会被保留但隔离。诊断与微练习审核均使用服务端版本令牌，旧页面不能覆盖其他审核会话已经保存的判断。

三项外部验证的统一工作台为`http://localhost:4173/validation.html`。它实时读取诊断Gold、微练习教师审核和修复后用户复测进度，并只把CTA指向当前最高优先级的未完成证据门槛；占位数字或手工文档不会覆盖服务端状态。

诊断试审公开接口只下发`blind-case-001`形式的无语义编号，不下发内部案例ID、作者预设标签或模型预测。首批10条覆盖五类主要错因与`insufficient_information`、`ambiguous_question`、`data_error`三种安全状态；页面进度只统计当前v3协议下的合格教师操作，历史流程记录只进入来源排除计数。

审核分为两条隔离轨道：`/review.html?track=author_qa`用于项目作者先检查样本，结果单独保存在`author_qa`区域且永不进入Gold；`/review.html`用于未参与案例编写或标签设计的独立雅思阅读教师。正式Gold除教师资质外还必须满足`review_track=independent_teacher_gold`与独立性声明，独立页面不会展示作者QA标签。

两条轨道使用不同匿名编号命名空间和浏览器缓存：作者QA必须使用`author-`前缀，独立教师必须使用`teacher-`前缀。服务端拒绝跨轨道编号，避免同一浏览器切换页面时把项目作者误记为独立审核者。

首轮10条作者QA的证据化审计见[`docs/author-qa-pilot-001.md`](docs/author-qa-pilot-001.md)。案例06–08完成二次复核后，当前记录为10条批准、0条需修订、0条拒绝，作者检查点已通过；这些记录仍不进入Teacher Gold，下一步是独立教师首批10条盲审。

独立教师首批10条的证据化审计见[`docs/independent-teacher-pilot-001.md`](docs/independent-teacher-pilot-001.md)：10条均符合当前协议并进入Gold候选，冻结规则预测探索性一致率为9/10；正式模型指标仍需满50条。

复核表单修改后必须点击“批准”“需修订”或“拒绝”按钮才会写入服务端。未保存修改会显示提醒并阻止案例切换或离页；作者QA页的通过数按作者批准记录显示，不与Teacher Gold合格数混用。

诊断审核使用`evals/review-pack.json`中的冻结预测作为当前50条候选的不可变评测基准。后续规则或模型升级不会重算、覆盖或误判历史预测快照；`npm run eval:review-pack`只复用冻结包并安全重建CSV，不覆盖已启动审核的预测版本。

微练习两阶段盲审与六维质量复核见 [`docs/exercise-review-guide.md`](docs/exercise-review-guide.md)，浏览器入口为 `http://localhost:4173/exercise-review.html`。教师先锁定答案与训练错因，再揭示标准信息；结构检查与教师有效率是两个独立指标，10题未全部审核前所有正式教师指标保持 `null`。

首次用户测试交接入口为`http://localhost:4173/usability-start.html`，配套[`docs/usability-startup-kit.md`](docs/usability-startup-kit.md)和[`docs/usability-test-guide.md`](docs/usability-test-guide.md)，记录页为`http://localhost:4173/usability.html`。主持说明不展示给参与者；当前本地版本必须使用同一浏览器配置文件。匿名会话把研究记录与真实产品事件链连接，一个会话只能对应一名参与者，重复会话全部排除；少于5名合格目标用户时不输出汇总比例。

首轮5名真实用户测试的证据摘要见[`docs/usability-pilot-001.md`](docs/usability-pilot-001.md)。5/5记录结构有效且会话唯一；无帮助完成与证据提交均为5/5，诊断理解为4/5。P004受到已修复的`NOT GIVEN`误诊缺陷影响，因此诊断理解结果只作探索性使用，不宣称学习效果。

推荐使用本地盲审页面：`http://localhost:4173/review.html`。页面不会显示系统拟议标签，避免审核锚定。

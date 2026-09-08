# MVP Requirement Audit — 2026-08-22

状态定义：`PROVEN` 有可重复测试或人工浏览器证据；`PARTIAL` 已实现但证据不足；`MISSING` 尚未实现或尚无真实数据。合成数据不得替代教师或真实用户证据。

## 结论

- 工程型核心路径、评测与真实用户迭代闭环均已完成，当前约 **90%** 完成。
- 当前产品适合做受控演示和教师复核，不适合宣称模型质量或学习效果已经达标。
- 最大风险仍是Teacher Gold尚未达到50条正式门槛，而非页面或功能数量不足。

## 逐项审计

| 要求 | 状态 | 权威证据 | 缺口 / 下一验证 |
|---|---|---|---|
| 固定五类一级错因与三类特殊状态 | PROVEN | `src/taxonomy.js`、taxonomy/engine tests | 不扩类 |
| 固定 Evidence→Semantic→Sentence→Rule→Boundary 因果链 | PROVEN | `src/diagnostic-engine.js`、decision trace tests | 需教师案例验证语义判断 |
| 标准证据与用户证据 quote 必须在 passage 中 | PROVEN | `src/validators.js`；服务端权威题目源；公开接口不泄露Gold；标准/用户伪造证据均有Provider零调用回归 | 真实模型输出仍未接入 |
| 无效证据时 fail closed | PROVEN | 139项自动化回归；浏览器实测伪造用户证据被拒绝、表单可重试、改用原文证据后成功 | — |
| Provider结构化输出闸门 | PROVEN | 5类恶意输出挑战全部拦截；非法标签、因果跳步、矛盾置信度、缺证据确认和非结构化结果均fail closed | 尚未用真实语义Provider验证响应分布 |
| Provider离线基准与发布门槛 | PROVEN | 8条困难边界统一记录分类、拒答、安全、P95延迟与成本；DeepSeek v3真实复测7/8正确、0条不安全、1条安全拒答 | 作者边界集不是独立教师Gold且契约失败率仍为12.5%，候选未晋级学生端 |
| Provider盲测Prompt包与离线回放 | PROVEN | 8条输入包不含Gold标签；DeepSeek真实输出继续经过结构、因果链、置信和预算闸门 | 仍需在完整独立教师Gold上验证 |
| 版本化Prompt与注入隔离 | PROVEN | `diagnostic-causal-v3`固定taxonomy、因果链、唯一trace模板、标量输出、拒答与answer mismatch禁令；system/user分离、字段白名单和SHA-256哈希；DeepSeek v1→v2→v3均有真实回归证据 | v3仍有1条契约失败；尚未做完整Prompt injection红队评测 |
| confidence 与低置信拒答 | PARTIAL | DeepSeek v3在8条作者边界集上0条不安全、1条安全拒答；规则基线拒答7/8；冻结预测、四桶、ECE与篡改保护已实现 | Teacher Gold仅10/50，正式校准不可计算 |
| 正确 / 错误 / 幸运猜对分流 | PROVEN | 3 个 correct-path cases、浏览器验证 | 复杂正确推理仍需语义 Provider |
| 划选或粘贴证据 | PROVEN | UI与服务端二次校验；5名真实用户证据提交成功率100% | 小样本探索性结果 |
| 证据视觉对比、Where/Why/Fix | PROVEN | 产品页面、feedback tests；五类错因均使用服务端作者标注提供精确题干/原文对应、类别特定动作，题型策略已完成浏览器回归 | 新版教学价值仍需新用户复测 |
| 即时练习首轮隐藏答案 | PROVEN | 初始题目、答错、答对、迁移和下一题五类公开对象均无`answer`/`correct_answer`键；HTTP与浏览器Retry实测 | 选项本身必须公开，但不标记正确项 |
| 答错后 Retry，答对才进入 Transfer | PROVEN | API 实测：wrong→null，right→transfer | 需真实用户完成数据 |
| 记录首次、retry、提示次数、transfer | PROVEN | attempt_number / hints_used、state tests | 当前只有本地 Demo 数据 |
| Transfer 无提示 | PROVEN | transfer 阶段隐藏提示按钮 | 需浏览器和用户验证 |
| 五类均有原创 immediate + transfer | PROVEN | 10 条题、exercise tests | 教师质量/难度复核未完成 |
| Learner State 可持久化且不人格化 | PROVEN | localStorage、state tests；浏览器刷新后诊断计数1、微练习计数1且无重复埋点 | 当前无登录，限单浏览器 |
| average evidence time | PROVEN | evidence timer、average state test | 页面停留时间只是近似作答时长 |
| help dependency | PROVEN | hint event + help_dependency test | 需真实数据解释阈值 |
| Eval A/B/C/D/E 可重复运行 | PARTIAL | `npm run eval`，合成 12 例、练习结构评测 | B/C/E 缺独立教师 Gold |
| 至少 50 条盲审候选与准入规则 | PROVEN | 50条平衡候选；作者QA与独立教师Gold分轨；公开API隐藏作者标签和模型预测；冻结预测独立于后续更新 | 独立教师Gold 10/50，尚余40条 |
| Teacher Agreement >=80% | PARTIAL | 50-Gold门槛、教师来源准入、Accuracy、Macro F1、5×5混淆矩阵和回归测试已实现 | 当前Teacher Gold为10/50；官方指标仍为null |
| 四组关键边界混淆 | PARTIAL | 8条不含规则提示词的对抗挑战集覆盖四组边界；另有Teacher Gold双向混淆、第三类错误及隐藏门槛 | 挑战集为项目作者标签而非Teacher Gold；官方报告仍为 null |
| Evidence Accuracy / hallucination 目标 | PARTIAL | 合成集 100% / 0% | 同源小样本，不可当官方结果 |
| Micro Exercise Validity >=90% | PARTIAL | 10/10完成独立教师两阶段盲审；六维有效率80%，盲答一致率100%，盲判训练目标一致率80% | 未达到90%目标；两条相邻错因边界案例进入Future Improvements，不阻塞收尾 |
| 核心漏斗和诊断认可率 | PROVEN | 本地事件 + Demo Analytics | 无 Real User Data |
| Recurring Error Rate | PROVEN | 同类错因第二次及以后出现次数/全部错因诊断；5题最小轮换和完成后下一诊断入口可真实产生多轮路径 | 当前仅 Demo Data |
| 7-Day Repeat Usage | PROVEN | 观察不足7天返回null、第7天后复访返回1；每次新诊断写入新的`question_started` | 首轮真实用户未形成7日观察，因此真实指标仍N/A |
| Provider / prompt / model / latency / cost 元数据 | PROVEN | API响应及每条diagnosis_completed事件记录Provider、Prompt版本/哈希、模型、延迟和成本；输出异常仍保留血缘且不泄露上游错误 | 当前rule provider，真实模型cost仍为null |
| error handling / secrets / refresh / concurrency protection | PROVEN | 179项测试；诊断Gold权威；用户/标准证据双闸门；Provider 15秒超时、AbortSignal与5秒P95晋级门槛；结构错误重试携带定向契约修复且预算预留覆盖额外输入；真实8条最坏预留低于分段及总计$0.01硬闸门；无效证据重试不重复计时或写漏斗；冻结预测不受模型漂移影响；作者QA/独立Gold数据、编号和缓存隔离；诊断与练习复核均拦截未保存切题/关闭；旧审核只进入来源排除计数；教师盲审ID零标签泄露；练习答案零泄漏；两类教师审核均支持权威动态续审；迁移断网可重试；终态刷新锁定；审核版本令牌；研究会话去重；Schema迁移 | 本地存储清除后不可恢复是预期行为 |
| 首次用户无需指导完成 | PROVEN | 5个匿名首测会话无指导完成率100%、证据选择成功率100%、诊断理解率80%；修复后3名新用户对具体错点、下一步动作和练习关系的理解均为100% | 小样本探索性证据，不能推断提分或长期迁移 |
| 研究记录纠错与撤回 | PROVEN | 定向纠错、版本号、研究会话不可替换、确认撤回、最小审计日志及回归测试 | 仅适合小样本本地研究，不是生产数据平台 |
| 3–5 分钟作品集叙事 | PARTIAL | 统一案例页覆盖9个招聘者问题；限时阅读、无提示盲回忆、九项显式核验、匿名导出和少于5人N/A闸门已实现 | 当前真实合格案例理解记录0/5，不能宣称招聘者已理解 |

## 当前 P0

无阻塞作品集交付的P0。核心流程、自动评测、真实用户问题发现、修复和新用户复测均已闭环。

## Future Improvements

1. 扩充至50条独立教师Gold，再计算正式一致率、Macro F1和置信度校准。
2. 修订两条相邻错因边界微练习，并在新版本上做定向复审。
3. 进行7日复访与长期迁移验证；在独立Teacher Gold达到门槛后再评估DeepSeek候选晋级。

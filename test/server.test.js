import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatReviewSaveConfirmation } from '../public/review-save-confirmation.js';

test('saved review confirmation identifies the persisted case, server time and final status', () => {
  const confirmation = formatReviewSaveConfirmation({
    reviewed_at: '2026-08-24T13:40:24.120Z',
    review_status: 'needs_revision'
  }, 8, 'zh-CN');
  assert.match(confirmation, /^案例08已保存/);
  assert.match(confirmation, /08\/24/);
  assert.match(confirmation, /状态：needs_revision$/);
});

test('core web files exist and expose the evidence-first flow', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /使用划选文字作为证据/);
  assert.match(html, /也可以粘贴原文中的证据/);
  assert.match(html, /验证证据并诊断/);
  assert.match(html, /相同答案可能来自不同思路/);
  assert.match(html, /无需凑字数，一句话即可/);
  assert.match(html, /2 划选证据/);
  assert.doesNotMatch(html, /minlength="10"/);
  assert.match(html, /你的证据/);
  assert.match(html, /标准证据/);
  assert.match(html, /作答结果/);
  assert.match(html, /答案与证据均成立/);
  assert.match(html, /这个诊断符合你的实际情况吗/);
  assert.match(html, /错误发生在哪里/);
  assert.match(html, /为什么会错/);
  assert.match(html, /下次怎么做/);
  assert.match(html, /这题具体要核对什么/);
  assert.match(html, /针对性微练习/);
  assert.match(client, /无辅助迁移题/);
  assert.match(html, /你的可观察学习记录/);
  assert.match(html, /开始下一次诊断/);
  assert.match(client, /nextDemoQuestionId/);
  assert.match(client, /path_completed/);
  assert.match(client, /if \(workflowDraft\.path_completed\) \{[\s\S]*button\.disabled = true/);
  assert.match(client, /fetch\('\/api\/demo-questions'\)/);
  assert.match(client, /question_id: sample\.id/);
  assert.match(client, /portfolio_preview/);
  assert.match(client, /clearWorkflowDraft\(localStorage, workflowNamespace\)/);
});

test('PDF import page exposes local extraction confirmation practice and diagnosis flow',()=>{
  const html=fs.readFileSync(new URL('../public/import.html',import.meta.url),'utf8');
  const client=fs.readFileSync(new URL('../public/import.js',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  for(const text of ['上传练习文件，识别题库','选择本机 PDF','文件不会保存在服务器','确认识别出的文章页','自动识别候选','开始练习','针对性微练习'])assert.match(html,new RegExp(text));
  assert.match(client,/\/api\/pdf\/extract/);assert.match(client,/\/api\/imported-diagnose/);assert.match(client,/sessionStorage/);assert.doesNotMatch(client,/localStorage\.setItem\([^\n]*passage/);
  assert.match(server,/MAX_PDF_BYTES/);assert.match(server,/retention:'memory_only'/);assert.match(server,/\/api\/pdf\/extract/);
});

test('analytics page labels browser records as demo data', () => {
  const html = fs.readFileSync(new URL('../public/analytics.html', import.meta.url), 'utf8');
  assert.match(html, /DEMO DATA ONLY/);
  assert.match(html, /不代表真实用户、模型效果或学习提升/);
});

test('blind teacher review page does not render proposed model labels', () => {
  const html = fs.readFileSync(new URL('../public/review.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/review.js', import.meta.url), 'utf8');
  assert.match(html, /BLIND TEACHER REVIEW/);
  assert.doesNotMatch(html, /proposed_primary_error/);
  assert.doesNotMatch(client, /proposed_primary_error/);
  assert.doesNotMatch(client, /item\.id|cases\[currentIndex\]\.id/);
  assert.match(client, /blind_id: cases\[currentIndex\]\.blind_id/);
  assert.match(client, /盲审案例/);
  assert.match(client, /reading-lens-author-qa-id/);
  assert.match(client, /reading-lens-independent-reviewer-id/);
  assert.match(client, /作者QA编号必须使用 author-/);
  assert.match(client, /独立教师编号必须使用 teacher-/);
  assert.match(html, /三种特殊状态怎么区分/);
  assert.match(html, /坏Gold不能被归因成学生的句子理解错误/);
  assert.match(client, /requestedCaseNumber/);
  assert.match(client, /item\.review_status !== 'approved'/);
  assert.match(client, /修改尚未保存，请点击下方状态按钮完成保存/);
  assert.match(client, /if \(formDirty\)/);
  assert.match(client, /beforeunload/);
  assert.match(client, /authorQaMode \? progress\.approved : progress\.gold_eligible/);
  assert.match(client, /renderSavedConfirmation\(payload\.case\)/);
  assert.match(client, /pilot\.sample_issues\)/);
  assert.doesNotMatch(client, /pilot\.sample_issues \+ pilot\.provenance_issues/);
  assert.match(html, /审核者编号/);
});

test('teacher review startup page supports an independent ten-case handoff', () => {
  const html = fs.readFileSync(new URL('../public/review-start.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/review-start.js', import.meta.url), 'utf8');
  assert.match(html, /先完成10条试审/);
  assert.match(html, /五类主要错因与三种特殊状态|8类/);
  assert.match(html, /雅思阅读教学或正式教研经验/);
  assert.match(html, /未参与案例编写|项目作者QA/);
  assert.match(html, /不填写姓名、邮箱或学生身份/);
  assert.match(html, /最早失败的一步/);
  assert.match(html, /20–30分钟/);
  assert.match(html, /暂停与恢复/);
  assert.match(html, /多人同时审核/);
  assert.match(html, /不会覆盖先保存的结论/);
  assert.match(html, /未完成50条合格Gold前/);
  assert.match(html, /href="\/review\.html"/);
  assert.match(html, /id="review-handoff-status"/);
  assert.match(html, /src="\/review-start\.js"/);
  assert.match(client, /fetch\('\/api\/reviews'\)/);
});

test('exercise teacher review page exposes six dimensions without auto-approval', () => {
  const html = fs.readFileSync(new URL('../public/exercise-review.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/exercise-review.js', import.meta.url), 'utf8');
  assert.match(html, /MICRO EXERCISE TEACHER REVIEW/);
  assert.match(html, /href="\/exercise-review-start\.html"/);
  assert.match(html, /六维质量判断/);
  for (const field of ['targets_primary_error', 'original_content', 'unique_answer', 'answer_correct', 'difficulty_appropriate', 'no_answer_leak']) {
    assert.match(client, new RegExp(field));
  }
  assert.doesNotMatch(client, /\.click\(\).*approved|auto.?approve/i);
});

test('exercise review startup page hands off an independent two-stage ten-case review', () => {
  const html = fs.readFileSync(new URL('../public/exercise-review-start.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/exercise-review-start.js', import.meta.url), 'utf8');
  assert.match(html, /未参与这10题、答案或目标错因标签的编写/);
  assert.match(html, /第一阶段：独立盲判/);
  assert.match(html, /第二阶段：揭示并复核/);
  assert.match(html, /6维|六维/);
  assert.match(html, /INVITATION TEMPLATE/);
  assert.match(html, /不要直接发送localhost链接/);
  assert.match(html, /同一台电脑|屏幕共享\/远程控制/);
  assert.match(html, /id="exercise-handoff-status"/);
  assert.match(html, /src="\/exercise-review-start\.js"/);
  assert.match(client, /fetch\('\/api\/exercise-reviews'\)/);
});

test('exercise teacher review requires a locked blind answer and target before gold reveal', () => {
  const html = fs.readFileSync(new URL('../public/exercise-review.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/exercise-review.js', import.meta.url), 'utf8');
  assert.match(html, /第一阶段：独立盲判/);
  assert.match(html, /id="exercise-gold-meta"[^>]*hidden/);
  assert.match(html, /id="exercise-answer-reveal"[^>]*hidden/);
  assert.match(html, /未参与这些练习、答案或目标标签的编写/);
  assert.match(client, /\/api\/exercise-reviews\/reveal/);
  assert.match(client, /blind_target_error/);
  assert.match(client, /independence_attested: true/);
  assert.match(client, /independent_teacher_exercise/);
  assert.match(client, /exercise-two-stage-v3/);
  assert.match(client, /beforeunload/);
  assert.match(client, /if \(!formDirty\) return/);
  assert.match(client, /当前判断尚未保存/);
  assert.match(client, /blind_id: cases\[currentIndex\]\.blind_id/);
  assert.doesNotMatch(client, /cases\[currentIndex\]\.id/);
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /blindExerciseReviewId\(itemIndex\) === input\.blind_id/);
  assert.doesNotMatch(server, /item\.id === input\.id/);
});

test('client does not contain a secret or model API key', () => {
  const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client, /sk-[A-Za-z0-9_-]+/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY/);
});

test('accepted evidence and failed validation use separate telemetry paths', () => {
  const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const answerIndex = client.indexOf("addEvent(learnerState, 'answer_submitted'");
  const terminalIndex = client.indexOf('if (isTerminalDiagnosticStatus(result.status))');
  const evidenceIndex = client.indexOf("addEvent(learnerState, 'evidence_submitted'", terminalIndex);
  const failedBranchIndex = client.indexOf("result.status === 'evidence_validation_failed'", evidenceIndex);
  const failedEventIndex = client.indexOf("addEvent(learnerState, 'evidence_validation_failed'", failedBranchIndex);
  assert.ok(answerIndex >= 0 && terminalIndex > answerIndex && evidenceIndex > terminalIndex);
  assert.ok(failedBranchIndex > evidenceIndex && failedEventIndex > failedBranchIndex);
  assert.equal(client.indexOf("addEvent(learnerState, 'evidence_submitted'", evidenceIndex + 1), -1);
  assert.match(client, /这段证据无法在原文中找到。请重新划选/);
});

test('client exposes retry, hint and evidence-time instrumentation', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(html, /查看方法提示/);
  assert.match(client, /再次提交/);
  assert.match(client, /addEvidenceTime/);
  assert.match(server, /result\.stage === 'immediate' && result\.correct/);
  assert.match(client, /!response\.ok \|\| !validExerciseCheckResponse/);
  assert.match(client, /rollbackUnverifiedAttempt/);
  assert.match(client, /button\.textContent = idleButtonText/);
});

test('diagnosis completion events carry reproducibility telemetry', () => {
  const client = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const field of ['provider', 'prompt_version', 'model_version', 'response_time_ms', 'model_cost_usd']) {
    assert.match(client, new RegExp(`${field}: result\\.${field}`));
  }
  assert.match(client, /diagnosisTelemetry\(result/);
});

test('analytics distinguishes demo, eval and real user data', () => {
  const html = fs.readFileSync(new URL('../public/analytics.html', import.meta.url), 'utf8');
  assert.match(html, /Demo Data/);
  assert.match(html, /Eval Data/);
  assert.match(html, /Real User Data/);
});

test('eval results page separates synthetic framework baseline from teacher gold', () => {
  const html = fs.readFileSync(new URL('../public/evals.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/evals.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(html, /EVAL DATA · NOT REAL USER DATA/);
  assert.match(html, /FRAMEWORK BASELINE/);
  assert.match(html, /OFFICIAL METRICS/);
  assert.match(html, /TEACHER GOLD ONLY/);
  assert.match(client, /if \(official\.available\)/);
  assert.match(client, /当前不展示校准、混淆矩阵或边界结论/);
  assert.match(server, /\/api\/eval-results/);
  assert.doesNotMatch(html, /75%|0\.764/);
});

test('eval results expose adversarial boundary failures separately from Teacher Gold', () => {
  const html = fs.readFileSync(new URL('../public/evals.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/evals.js', import.meta.url), 'utf8');
  const runner = fs.readFileSync(new URL('../evals/run-evals.js', import.meta.url), 'utf8');
  assert.match(html, /BOUNDARY CHALLENGE/);
  assert.match(html, /ADVERSARIAL SYNTHETIC DATA/);
  assert.match(client, /unsafe_boundary_diagnosis_rate/);
  assert.match(runner, /synthetic_adversarial_project_authored/);
  assert.match(runner, /not Teacher Gold/);
});

test('validation workbench reads all external evidence gates without inventing progress', () => {
  const html = fs.readFileSync(new URL('../public/validation.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/validation.js', import.meta.url), 'utf8');
  assert.match(html, /EVIDENCE OPERATIONS · LIVE SERVER STATE/);
  assert.match(html, /诊断教师盲审/);
  assert.match(html, /微练习两阶段盲审/);
  assert.match(html, /修复后新用户复测/);
  for (const endpoint of ['/api/reviews', '/api/exercise-reviews', '/api/usability-summary']) assert.match(client, new RegExp(endpoint));
  assert.match(client, /不要依据本页占位数字开展审核/);
});

test('portfolio case study explains the complete product and evidence story', () => {
  const html = fs.readFileSync(new URL('../public/case-study.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/case-study.js', import.meta.url), 'utf8');
  assert.match(html, /学生知道答案错了，却不知道错误发生在哪一步/);
  assert.match(html, /传统解析解释正确答案/);
  assert.match(html, /为什么必须提交Evidence/);
  for (const label of ['定位错误', '同义替换', '句子理解', '题型策略', '推理越界']) assert.match(html, new RegExp(label));
  for (const step of ['Answer', 'Evidence', 'Reasoning', 'Diagnosis', 'Correction', 'Practice', 'Transfer', 'Learner State']) assert.match(html, new RegExp(step));
  assert.match(html, /确定性验证器先于候选模型运行/);
  assert.match(html, /当前失败边界/);
  assert.match(html, /如何证明产品真正有效/);
  assert.match(html, /<iframe src="\/\?portfolio_preview=1"/);
  assert.match(client, /fetch\('\/api\/eval-results'\)/);
  assert.match(client, /fetch\('\/api\/usability-summary'\)/);
  assert.match(client, /首轮真实用户可用性已达到探索性门槛/);
  assert.match(client, /合成基线不等于模型效果/);
  assert.doesNotMatch(html + client, /—|–/);
});

test('portfolio comprehension study uses timed first-exposure blind recall and nine explicit concepts', () => {
  const html = fs.readFileSync(new URL('../public/portfolio-review.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/portfolio-review.js', import.meta.url), 'utf8');
  const store = fs.readFileSync(new URL('../public/portfolio-review-store.js', import.meta.url), 'utf8');
  assert.match(html, /3–5 MINUTE EVIDENCE TEST/);
  assert.match(html, /复述时没有查看案例页或笔记/);
  assert.match(client, /reading_time_seconds/);
  assert.match(store, /PORTFOLIO_CONCEPTS/);
  assert.match(store, /minimumSample = 5/);
  assert.match(store, /all_nine_recall_rate/);
  assert.doesNotMatch(html, /name="(?:name|email|phone)"/);
});

test('usability tool requires anonymous consented research records and stays separate from demo storage', () => {
  const html = fs.readFileSync(new URL('../public/usability.html', import.meta.url), 'utf8');
  const store = fs.readFileSync(new URL('../public/usability-store.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const learnerStore = fs.readFileSync(new URL('../public/learner-store.js', import.meta.url), 'utf8');
  assert.match(html, /匿名参与者编号/);
  assert.match(html, /明确同意匿名记录/);
  assert.match(html, /不得填写直接身份信息/);
  assert.match(store, /reading-lens-usability-study-v1/);
  assert.match(learnerStore, /reading-lens-learner-state-v1/);
  assert.doesNotMatch(store, /reading-lens-learner-state-v1/);
  assert.match(html, /确认撤回这一条记录/);
  assert.match(html, /纠错原因/);
  assert.match(store, /reading-lens-usability-audit-v1/);
  assert.match(html, /id="open-research-session"[^>]+hidden/);
  assert.match(styles, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
});

test('usability startup page separates moderator protocol from participant experience', () => {
  const html = fs.readFileSync(new URL('../public/usability-start.html', import.meta.url), 'utf8');
  assert.match(html, /这是给研究主持人的操作说明，不要把本页展示给参与者/);
  assert.match(html, /5\.5–6\.5/);
  assert.match(html, /1人1会话/);
  assert.match(html, /必须使用同一浏览器环境/);
  assert.match(html, /不能把localhost链接直接发到另一台设备/);
  assert.match(html, /我现在不会解释页面或告诉你答案/);
  assert.match(html, /不要额外提醒参与者划选证据/);
  assert.match(html, /卡住也要保存/);
  assert.match(html, /不是提分实验/);
  assert.match(html, /href="\/usability\.html"/);
});

test('usability sessions derive completion from tagged product events rather than observer claims', () => {
  const html = fs.readFileSync(new URL('../public/usability.html', import.meta.url), 'utf8');
  const study = fs.readFileSync(new URL('../public/usability.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /创建测试会话/);
  assert.match(html, /由产品事件自动计算/);
  assert.match(study, /deriveSessionTelemetry\(loadState\(sessionId\)\.events/);
  assert.match(app, /const researchSessionId = activateResearchSession\(\)/);
  assert.match(app, /stateStorageId = portfolioPreview \? 'rs_portfolio_preview_v1' : researchSessionId/);
  assert.match(app, /loadState\(stateStorageId\)/);
  assert.match(app, /result\.status === 'abstained'/);
});

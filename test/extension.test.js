import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('extension is restricted to idictation IELTS routes and local services', () => {
  const manifest = JSON.parse(read('../extension/manifest.json'));
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.idictation.cn/ielts/*']);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'sidePanel', 'storage']);
  assert.equal(manifest.host_permissions.some((item) => item.includes('api.deepseek') || item.includes('openai.com')), false);
});

test('idictation fixture exposes every strict v1 adapter field', () => {
  const fixture = read('./fixtures/idictation-result.html');
  for (const attribute of ['data-reading-passage','data-question-number','data-question-type','data-question-prompt','data-user-answer','data-correct-answer','data-standard-evidence']) {
    assert.match(fixture, new RegExp(attribute));
  }
  const adapter = read('../extension/idictation-adapter.js');
  assert.match(adapter, /standard_evidence_not_in_passage/);
  assert.match(adapter, /ambiguous_selector/);
  assert.doesNotMatch(adapter, /document\.body\.innerText|body\.textContent/);
});

test('doing-page fixture exposes workspace fields without requiring answer gold', () => {
  const fixture=read('./fixtures/idictation-doing.html');
  for(const token of ['data-reading-passage','data-question-number','data-question-type','input type="radio"','checked'])assert.match(fixture,new RegExp(token));
  const adapter=read('../extension/idictation-adapter.js');assert.match(adapter,/recognizeWorkspace/);assert.match(adapter,/questionSnapshot/);assert.match(adapter,/applyAnswer/);
});

test('v5 adapter supports the live result page radio-group structure',()=>{
  const adapter=read('../extension/idictation-adapter.js');
  assert.match(adapter,/idictation-v5/);assert.match(adapter,/structuralQuestionRoots/);assert.match(adapter,/text\(node\)==='解析'/);assert.match(adapter,/radio_count/);assert.match(adapter,/missing_question_prompt/);assert.match(adapter,/geometricPassage/);
});

test('diagnosis fallback infers structural metadata and asks for a missing gold answer',()=>{
  const adapter=read('../extension/idictation-adapter.js');const content=read('../extension/content.js');
  assert.match(adapter,/canonicalQuestionNumber/);assert.match(adapter,/function taggedEvidence/);assert.match(adapter,/overrides\.correct_answer/);assert.match(adapter,/overrides\.question/);
  assert.match(content,/window\.prompt/);assert.match(content,/missing_correct_answer/);assert.match(content,/missing_question_prompt/);assert.doesNotMatch(content,/当前页面结构暂不支持/);
});

test('standard evidence lookup canonicalizes live question labels and reads a visible analysis sentence',()=>{
  const adapter=read('../extension/idictation-adapter.js');const content=read('../extension/content.js');
  assert.match(adapter,/canonicalQuestionNumber/);assert.match(adapter,/visibleGlobalEvidence/);assert.match(adapter,/overrides\.standard_evidence/);
  assert.match(content,/lastSelection\?\.anchor\?\.exact/);assert.match(content,/页面显示了标准证据/);
});

test('extension contains no model secret or direct model endpoint', () => {
  const bundle = ['service-worker.js','idictation-adapter.js','content.js','sidepanel.js','print.js'].map((file) => read(`../extension/${file}`)).join('\n');
  assert.doesNotMatch(bundle, /sk-[A-Za-z0-9_-]+|DEEPSEEK_API_KEY|OPENAI_API_KEY|api\.deepseek\.com/);
  assert.match(bundle, /\/api\/external-diagnose/);
  assert.match(bundle, /\/api\/vocabulary\/enrich/);
  assert.doesNotMatch(bundle, /passage[^\n]{0,40}chrome\.storage\.local\.set/);
});

test('workspace UI exposes restore backup notes vocabulary and print paths', () => {
  const html = read('../extension/sidepanel.html');
  const print = read('../extension/print.html') + read('../extension/print.css');
  for (const text of ['爱听写页面','诊断服务','重新检查','工作区','诊断','错词本','一键恢复到页面','导出 JSON 备份','高亮与 Note','生成打印学习册']) assert.match(html, new RegExp(text));
  assert.match(print, /@page\{size:A4/);
  assert.match(print, /break-inside:avoid/);
});

test('plugin reports page recognition and local service health instead of failing silently',()=>{
  const content=read('../extension/content.js');const panel=read('../extension/sidepanel.js');const server=read('../server.js');
  assert.match(content,/READING_LENS_PAGE_STATUS/);assert.match(content,/waitForWorkspace\(adapter,15000\)/);assert.match(panel,/\/api\/health/);assert.match(panel,/未识别/);assert.match(server,/reading-lens-local/);
});

test('highlight selection survives the host page clearing its native selection',()=>{
  const content=read('../extension/content.js');
  assert.match(content,/addEventListener\('pointerup',\(\)=>\{captureSelection\(true\);selecting=false;/);assert.match(content,/dragBest/);assert.match(content,/pointerSelectionAt<800/);assert.match(content,/passageText\.lastIndexOf\(quote\)/);
});

test('saved highlights remain visible above host-page note styling',()=>{
  const content=read('../extension/content.js');const css=read('../extension/content.css');assert.match(content,/renderHighlightOverlay/);assert.match(content,/reading-lens-highlight-rect \$\{kind\} reading-lens-owned/);assert.match(content,/getClientRects/);assert.match(content,/原文中标为青色/);assert.match(css,/reading-lens-highlight-layer/);assert.match(css,/40,211,231,.62/);
});

test('layout changes rebind the passage node without invalidating the workspace',()=>{
  const content=read('../extension/content.js');assert.match(content,/refreshPassageNode/);assert.match(content,/sourceIdentity/);assert.match(content,/pendingPassageMismatch/);assert.match(content,/first_seen>=1200/);assert.doesNotMatch(content,/页面正文已变化。为避免错配/);
});

test('release scope supports TFNG YNNG and fill-in while rejecting other types',()=>{
  const adapter=read('../extension/idictation-adapter.js');const content=read('../extension/content.js');
  for(const type of ['TRUE_FALSE_NOT_GIVEN','YES_NO_NOT_GIVEN','FILL_IN_THE_BLANK'])assert.match(adapter,new RegExp(type));
  assert.match(adapter,/SUPPORTED_TYPES/);assert.match(adapter,/textInputs===1/);assert.match(adapter,/unsupported_question_type/);assert.match(content,/当前版本暂不支持该题型/);
});

test('failed vocabulary enrichment exposes a visible retry and preserves a safe reason',()=>{
  const panel=read('../extension/sidepanel.js');const store=read('../extension/vocabulary-store.js');
  assert.match(panel,/重试 AI 释义/);assert.match(panel,/生成 AI 释义/);assert.match(panel,/activeVocabularyRequests/);assert.doesNotMatch(panel,/entry\.enrichment_status==='pending'\)return/);assert.match(panel,/failureText/);assert.match(store,/markEnrichmentPending/);assert.match(store,/enrichment_error/);
});

test('contextual vocabulary enrichment runs in the extension worker and keeps readable sources',()=>{
  const worker=read('../extension/service-worker.js');const content=read('../extension/content.js');const panel=read('../extension/sidepanel.js');const print=read('../extension/print.js');
  assert.match(worker,/READING_LENS_ENRICH_VOCABULARY/);assert.match(worker,/api\/vocabulary\/enrich/);
  assert.match(content,/source_label:sourceTitle/);assert.match(content,/剑雅\\s\*\\d\+/);assert.match(content,/加入错词本：/);
  assert.match(panel,/formatSources/);assert.match(print,/source_label/);
});

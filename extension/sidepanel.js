import { WORKSPACE_STORAGE_KEY, validateWorkspaceBackup } from './workspace-store.js';
import { VOCABULARY_STORAGE_KEY, emptyVocabulary, filteredVocabulary, updateVocabularyEntry, removeVocabularyEntry, applyEnrichment, markEnrichmentFailed, markEnrichmentPending } from './vocabulary-store.js';

const API_BASE = 'http://127.0.0.1:4173';
const LABELS = { location:'证据定位错误', paraphrase:'同义替换未识别', sentence_comprehension:'句子理解错误', question_strategy:'题型策略错误', over_inference:'推理越界' };
let activeQuestion = null;
let activeExercise = null;
const activeVocabularyRequests = new Set();

const $ = (id) => document.getElementById(id);
const screens = ['empty','confirm','evidence','loading','result'];
function show(id) { for (const name of screens) $(name).hidden = name !== id; }

async function refreshProductStatus(){
  setProductStatus('page','checking','正在检查…');setProductStatus('service','checking','正在检查…');$('retry-status').disabled=true;
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const supported=tab?.url?.startsWith('https://www.idictation.cn/ielts/');
    if(!supported)setProductStatus('page','error','请打开爱听写 IELTS 页面');
    else{let payload=null;try{payload=await chrome.tabs.sendMessage(tab.id,{type:'READING_LENS_PAGE_STATUS'});}catch{}if(payload?.recognized)setProductStatus('page','ready',`已识别 ${payload.questions} 道题`);else if(payload){const detail=payload.diagnostics?` · 解析题组 ${payload.diagnostics.question_groups} · 单选控件 ${payload.diagnostics.radio_count} · 文章 ${payload.diagnostics.passage_found?'是':'否'}`:'';setProductStatus('page','error',`未识别：${payload.reason}${detail}`);}else setProductStatus('page','error','内容脚本未运行 · 请重载插件后刷新页面');}
  }catch{setProductStatus('page','error','无法读取当前标签页');}
  try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),1800);const response=await fetch(`${API_BASE}/api/health`,{signal:controller.signal});clearTimeout(timer);const health=await response.json();if(!response.ok||health.status!=='ok')throw new Error();setProductStatus('service','ready',health.vocabulary_enrichment==='available'?'诊断与AI释义可用':'诊断可用 · AI释义未配置');}
  catch{setProductStatus('service','error','未连接 · 请运行 npm start');}
  $('retry-status').disabled=false;
}
function setProductStatus(kind,state,text){const dot=$(`${kind}-status-dot`);dot.className=`status-dot ${state}`;const label=$(`${kind}-status-text`);label.textContent=text;label.title=text;}
$('retry-status').addEventListener('click',refreshProductStatus);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshProductStatus();});

async function loadQuestion() {
  const stored = await chrome.storage.session.get(['activeQuestion']);
  activeQuestion = stored.activeQuestion ?? null;
  if (!activeQuestion) return show('empty');
  showTab('diagnosis');
  $('question-number').textContent = `第 ${activeQuestion.question_number} 题`;
  $('question-type').textContent = activeQuestion.question_type;
  $('question-text').textContent = activeQuestion.question;
  $('user-answer').textContent = activeQuestion.user_answer;
  $('correct-answer').textContent = activeQuestion.correct_answer;
  $('standard-preview').textContent = activeQuestion.standard_evidence;
  $('evidence-input').value = activeQuestion.user_evidence ?? '';
  show('confirm');
}

$('confirm-question').addEventListener('click', () => show('evidence'));
$('cancel-question').addEventListener('click', clearQuestion);
$('another').addEventListener('click', clearQuestion);
$('use-selection').addEventListener('click', async () => {
  const { activeTabId } = await chrome.storage.session.get(['activeTabId']);
  if (!activeTabId) return setStatus('evidence-status', '找不到当前结果页，请回到爱听写页面重试。', true);
  try {
    const response = await chrome.tabs.sendMessage(activeTabId, { type:'READING_LENS_GET_SELECTION' });
    if (!response?.quote) return setStatus('evidence-status', '尚未读取到原文划选。请先在文章区划选一句。', true);
    if (!activeQuestion.passage.includes(response.quote)) return setStatus('evidence-status', '划选内容不在识别出的文章中。', true);
    $('evidence-input').value = response.quote;
    setStatus('evidence-status', '已读取原文划选。');
  } catch { setStatus('evidence-status', '无法连接结果页，请刷新页面后重试。', true); }
});

$('diagnose').addEventListener('click', async () => {
  const userEvidence = $('evidence-input').value.replace(/\s+/g,' ').trim();
  const reasoning = $('reasoning-input').value.trim();
  if (!userEvidence || !activeQuestion.passage.includes(userEvidence)) return setStatus('evidence-status', '证据必须逐字来自左侧文章。', true);
  if (!reasoning) return setStatus('evidence-status', '请补充你当时的真实思路。', true);
  show('loading');
  try {
    const response = await fetch(`${API_BASE}/api/external-diagnose`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...activeQuestion, user_evidence:userEvidence, reasoning_process:reasoning }) });
    const result = await response.json();
    if (!response.ok && result.status === 'request_error') throw new Error(result.error || result.message);
    renderResult(result);
  } catch (error) {
    show('evidence');
    setStatus('evidence-status', `本机诊断服务不可用：${safeMessage(error)}。请确认 npm start 正在运行。`, true);
  }
});

function renderResult(result) {
  show('result');
  $('answer-result').textContent = result.answer_result === 'correct' ? '作答正确' : result.answer_result === 'incorrect' ? '作答错误' : '作答状态未知';
  const diagnosed = result.status === 'diagnosed' && LABELS[result.primary_error];
  $('diagnosis-title').textContent = diagnosed ? LABELS[result.primary_error] : result.status === 'correct' ? '答案与证据均成立' : '信息不足，已安全停止诊断';
  $('feedback').hidden = !diagnosed;
  $('guard-message').hidden = diagnosed || result.status === 'correct';
  $('guard-message').textContent = result.reason ?? '当前信息不足以支持稳定诊断。';
  if (diagnosed) for (const key of ['where','why','fix']) $(`feedback-${key}`).textContent = result.feedback?.[key] ?? '';
  activeExercise = result.exercise ?? null;
  renderExercise(activeExercise);
  saveLearningResult(result);
}

function renderExercise(exercise) {
  $('exercise').hidden = !exercise;
  if (!exercise) return;
  $('exercise-question').textContent = exercise.question;
  $('exercise-options').replaceChildren(...exercise.options.map((option) => {
    const label = document.createElement('label'); const input = document.createElement('input'); const span = document.createElement('span');
    input.type='radio'; input.name='exercise-answer'; input.value=option; span.textContent=option; label.append(input,span); return label;
  }));
  setStatus('exercise-status','');
}

$('check-exercise').addEventListener('click', async () => {
  const answer = document.querySelector('input[name="exercise-answer"]:checked')?.value;
  if (!answer) return setStatus('exercise-status','请选择一个答案。',true);
  const button = $('check-exercise'); button.disabled=true;
  try {
    const response = await fetch(`${API_BASE}/api/exercise/check`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ exercise_id:activeExercise.id, answer }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.status);
    await appendLearningRecord('exercise_results', { exercise_id:result.exercise_id, target_error:result.target_error, stage:result.stage, correct:result.correct, occurred_at:new Date().toISOString() });
    if (result.correct && result.next_exercise) { activeExercise=result.next_exercise; renderExercise(activeExercise); setStatus('exercise-status','答对了。继续完成无辅助迁移题。'); }
    else setStatus('exercise-status', result.feedback, !result.correct);
  } catch { setStatus('exercise-status','练习未提交成功，本次尝试不会被记录。',true); }
  finally { button.disabled=false; }
});

async function saveLearningResult(result) {
  await appendLearningRecord('diagnoses', { content_hash:result.provenance?.content_hash, question_number:activeQuestion.question_number, status:result.status, primary_error:result.primary_error, provider:result.provider, prompt_version:result.prompt_version, model_version:result.model_version, occurred_at:new Date().toISOString() });
}
async function appendLearningRecord(key, record) {
  const stored=await chrome.storage.local.get(['readingLensLearnerState']); const state=stored.readingLensLearnerState ?? { schema_version:1, diagnoses:[], exercise_results:[] };
  state[key]=[...(state[key] ?? []),record].slice(-100); await chrome.storage.local.set({ readingLensLearnerState:state });
}
async function clearQuestion() { activeQuestion=null; activeExercise=null; await chrome.storage.session.remove(['activeQuestion']); show('empty'); }
function setStatus(id,message,error=false){ const node=$(id); node.textContent=message; node.style.color=error?'var(--danger)':''; }
function safeMessage(error){ return String(error?.message ?? '连接失败').replace(/[^\w\u4e00-\u9fff .:-]/g,'').slice(0,100); }

chrome.storage.onChanged.addListener((changes,area) => { if(area==='session' && changes.activeQuestion?.newValue) loadQuestion(); });
loadQuestion();

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));
function showTab(name) {
  for (const pane of document.querySelectorAll('.tab-pane')) pane.hidden = pane.id !== `${name}-pane`;
  for (const button of document.querySelectorAll('[data-tab]')) button.classList.toggle('active', button.dataset.tab === name);
  if (name === 'workspace') renderWorkspace();
  if (name === 'vocabulary') renderVocabulary();
}

async function activeTabMessage(message) {
  const { activeTabId } = await chrome.storage.session.get(['activeTabId']);
  const [activeTab]=await chrome.tabs.query({active:true,currentWindow:true});const tabId=activeTab?.url?.startsWith('https://www.idictation.cn/ielts/')?activeTab.id:activeTabId;
  if (!tabId) return null;
  try { return await chrome.tabs.sendMessage(tabId, message); } catch { return null; }
}

async function renderWorkspace() {
  const payload = await activeTabMessage({ type:'READING_LENS_GET_WORKSPACE' });
  $('workspace-empty').hidden = Boolean(payload?.workspace);
  $('workspace-content').hidden = !payload?.workspace;
  if (!payload?.workspace) return;
  const { workspace, summary } = payload;
  $('workspace-title').textContent = workspace.title || '爱听写阅读试卷';
  $('workspace-stats').replaceChildren(stat(`${summary.answers}`, '答案'), stat(`${summary.highlights}`, '高亮'), stat(`${summary.notes}`, 'Note'));
  $('workspace-answers').replaceChildren(...Object.values(workspace.answers).sort((a,b)=>Number(a.question_number)-Number(b.question_number)).map((answer)=>record(`第 ${answer.question_number} 题`, answer.value)));
  $('workspace-highlights').replaceChildren(...workspace.highlights.map((highlight)=>highlightRecord(highlight)));
  if (!Object.keys(workspace.answers).length) $('workspace-answers').replaceChildren(emptyLine('尚未保存答案。'));
  if (!workspace.highlights.length) $('workspace-highlights').replaceChildren(emptyLine('尚未添加高亮。'));
}

$('restore-workspace').addEventListener('click', async () => { const result=await activeTabMessage({type:'READING_LENS_RESTORE_WORKSPACE'}); setStatus('workspace-status',result?.ok?'已恢复到页面，不会自动提交。':'无法连接当前做题页。',!result?.ok); });
$('export-data').addEventListener('click', async () => {
  const stored=await chrome.storage.local.get([WORKSPACE_STORAGE_KEY,VOCABULARY_STORAGE_KEY]);
  downloadJson({ schema_version:1,exported_at:new Date().toISOString(),workspaces:stored[WORKSPACE_STORAGE_KEY]?.workspaces??{},vocabulary:stored[VOCABULARY_STORAGE_KEY]??emptyVocabulary() });
});
$('import-data').addEventListener('change', async (event) => {
  const file=event.target.files?.[0]; if(!file)return;
  try { const value=JSON.parse(await file.text());const checked=validateWorkspaceBackup(value);if(!checked.valid)throw new Error(checked.error);await chrome.storage.local.set({[WORKSPACE_STORAGE_KEY]:checked.value,[VOCABULARY_STORAGE_KEY]:value.vocabulary?.schema_version===1?value.vocabulary:emptyVocabulary()});setStatus('workspace-status','备份已导入。');renderWorkspace(); }
  catch { setStatus('workspace-status','备份格式无效，未修改现有数据。',true); }
  event.target.value='';
});
$('delete-workspace').addEventListener('click', async () => {
  if(!confirm('删除当前试卷的答案、高亮和 Note？此操作无法撤销。'))return;
  const result=await activeTabMessage({type:'READING_LENS_DELETE_WORKSPACE'});setStatus('workspace-status',result?.ok?'当前试卷记录已删除。':'无法连接当前做题页。',!result?.ok);renderWorkspace();
});
$('clear-data').addEventListener('click', async () => { if(!confirm('清空全部工作区、错词和诊断学习记录？建议先导出备份。'))return;await chrome.storage.local.remove([WORKSPACE_STORAGE_KEY,VOCABULARY_STORAGE_KEY,'readingLensLearnerState']);await activeTabMessage({type:'READING_LENS_DELETE_WORKSPACE'});setStatus('workspace-status','全部本地学习数据已清空。');renderWorkspace(); });

$('vocab-search').addEventListener('input',renderVocabulary);$('vocab-filter').addEventListener('change',renderVocabulary);
$('print-vocabulary').addEventListener('click', async () => { const stored=await chrome.storage.local.get([VOCABULARY_STORAGE_KEY]);const entries=filteredVocabulary(stored[VOCABULARY_STORAGE_KEY]??emptyVocabulary(),{status:$('vocab-filter').value,query:$('vocab-search').value});if(!entries.length)return setStatus('vocab-status','当前筛选结果没有可打印词条。',true);await chrome.storage.session.set({printVocabularyIds:entries.map((entry)=>entry.id)});chrome.tabs.create({url:chrome.runtime.getURL('print.html')}); });

async function renderVocabulary(){
  const stored=await chrome.storage.local.get([VOCABULARY_STORAGE_KEY]);const state=stored[VOCABULARY_STORAGE_KEY]??emptyVocabulary();const entries=filteredVocabulary(state,{status:$('vocab-filter').value,query:$('vocab-search').value});
  const counts=Object.fromEntries(['new','reviewing','mastered'].map((status)=>[status,state.entries.filter((entry)=>entry.status===status).length]));
  $('vocab-summary').replaceChildren(stat(`${counts.new}`,'待学习'),stat(`${counts.reviewing}`,'复习中'),stat(`${counts.mastered}`,'已掌握'));
  $('vocab-list').replaceChildren(...entries.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(vocabularyCard));$('vocab-empty').hidden=entries.length>0;
}

function vocabularyCard(entry){
  const article=document.createElement('article');article.className='vocab-card';const heading=document.createElement('div');heading.className='vocab-heading';const title=document.createElement('div');const strong=document.createElement('strong');strong.textContent=entry.enrichment?.headword||entry.original_term;const meta=document.createElement('span');meta.textContent=[entry.enrichment?.ipa,entry.enrichment?.part_of_speech].filter(Boolean).join(' · ')||statusText(entry.enrichment_status);title.append(strong,meta);
  const select=document.createElement('select');select.setAttribute('aria-label',`${entry.original_term} 的复习状态`);for(const [value,label] of [['new','待学习'],['reviewing','复习中'],['mastered','已掌握']]){const option=document.createElement('option');option.value=value;option.textContent=label;option.selected=entry.status===value;select.append(option);}select.addEventListener('change',()=>updateEntry(entry.id,{status:select.value}));heading.append(title,select);article.append(heading);
  const meaning=document.createElement('p');meaning.className='vocab-meaning';meaning.textContent=entry.enrichment?.contextual_meaning_zh||'释义待补充';const definition=document.createElement('p');definition.textContent=entry.enrichment?.simple_definition_en||'';const sentence=document.createElement('blockquote');sentence.textContent=entry.sentence;article.append(meaning,definition,sentence);
  const sources=document.createElement('p');sources.className='vocab-sources';sources.textContent=formatSources(entry.sources);article.append(sources);
  if(entry.enrichment_status!=='ready'){const reason=document.createElement('p');reason.className=`status${entry.enrichment_status==='failed'?' error':''}`;reason.textContent=entry.enrichment_status==='failed'?failureText(entry.enrichment_error):'释义尚未完成，可以立即重新生成。';const retry=actionButton(entry.enrichment_status==='failed'?'重试 AI 释义':'生成 AI 释义',()=>retryEnrichment(entry.id));retry.classList.add('vocab-retry');article.append(reason,retry);}
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='编辑与管理';const note=document.createElement('textarea');note.rows=2;note.placeholder='我的 Note';note.value=entry.note||'';const meaningInput=document.createElement('input');meaningInput.value=entry.enrichment?.contextual_meaning_zh||'';meaningInput.placeholder='中文语境释义';const definitionInput=document.createElement('input');definitionInput.value=entry.enrichment?.simple_definition_en||'';definitionInput.placeholder='英文简释';const actions=document.createElement('div');actions.className='inline-actions';actions.append(actionButton('保存修改',()=>updateEntry(entry.id,{note:note.value,enrichment:{contextual_meaning_zh:meaningInput.value,simple_definition_en:definitionInput.value}})),actionButton(entry.enrichment_status==='failed'?'重试AI释义':'重新生成',()=>retryEnrichment(entry.id)),actionButton('删除',()=>deleteEntry(entry.id),true));details.append(summary,fieldLabel('中文释义',meaningInput),fieldLabel('英文简释',definitionInput),fieldLabel('我的 Note',note),actions);article.append(details);return article;
}
async function updateEntry(id,patch){const stored=await chrome.storage.local.get([VOCABULARY_STORAGE_KEY]);await chrome.storage.local.set({[VOCABULARY_STORAGE_KEY]:updateVocabularyEntry(stored[VOCABULARY_STORAGE_KEY]??emptyVocabulary(),id,patch)});renderVocabulary();}
async function deleteEntry(id){if(!confirm('删除这个错词？'))return;const stored=await chrome.storage.local.get([VOCABULARY_STORAGE_KEY]);await chrome.storage.local.set({[VOCABULARY_STORAGE_KEY]:removeVocabularyEntry(stored[VOCABULARY_STORAGE_KEY]??emptyVocabulary(),id)});renderVocabulary();}
async function retryEnrichment(id){if(activeVocabularyRequests.has(id))return;let stored=await chrome.storage.local.get([VOCABULARY_STORAGE_KEY]);let state=stored[VOCABULARY_STORAGE_KEY]??emptyVocabulary();const entry=state.entries.find((item)=>item.id===id);if(!entry)return;activeVocabularyRequests.add(id);state=markEnrichmentPending(state,id);await chrome.storage.local.set({[VOCABULARY_STORAGE_KEY]:state});setStatus('vocab-status',`正在生成 ${entry.original_term} 的释义…`);renderVocabulary();try{const result=await chrome.runtime.sendMessage({type:'READING_LENS_ENRICH_VOCABULARY',payload:{term:entry.original_term,sentence:entry.sentence,context:entry.sentence}});if(!result?.ok)throw new Error(result?.error||'vocabulary_provider_failed');state=applyEnrichment(state,id,result.enrichment);setStatus('vocab-status','释义已更新。');}catch(error){state=markEnrichmentFailed(state,id,error?.message);setStatus('vocab-status',failureText(error?.message),true);}finally{activeVocabularyRequests.delete(id);}await chrome.storage.local.set({[VOCABULARY_STORAGE_KEY]:state});renderVocabulary();}

function stat(value,label){const node=document.createElement('div');const strong=document.createElement('strong');strong.textContent=value;const span=document.createElement('span');span.textContent=label;node.append(strong,span);return node;}
function record(title,value){const node=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;const span=document.createElement('span');span.textContent=value;node.append(strong,span);return node;}
function emptyLine(value){const node=document.createElement('p');node.className='empty-line';node.textContent=value;return node;}
function highlightRecord(item){const node=document.createElement('article');node.className=`highlight-record ${item.kind}`;const top=record(`${kindText(item.kind)}${item.question_number?` · 第 ${item.question_number} 题`:''}`,item.anchor.exact);top.addEventListener('click',()=>activeTabMessage({type:'READING_LENS_SCROLL_HIGHLIGHT',anchor:item.anchor}));const note=document.createElement('textarea');note.rows=2;note.placeholder='为这处高亮添加 Note';note.value=item.note||'';const actions=document.createElement('div');actions.className='inline-actions';actions.append(actionButton('保存 Note',async()=>{await activeTabMessage({type:'READING_LENS_UPDATE_HIGHLIGHT',id:item.id,note:note.value});renderWorkspace();}),actionButton('删除',async()=>{await activeTabMessage({type:'READING_LENS_DELETE_HIGHLIGHT',id:item.id});renderWorkspace();},true));node.append(top,note,actions);return node;}
function actionButton(label,action,danger=false){const button=document.createElement('button');button.type='button';button.textContent=label;button.className=danger?'text-danger':'text-action';button.addEventListener('click',action);return button;}
function fieldLabel(text,input){const label=document.createElement('label');label.textContent=text;label.append(input);return label;}
function downloadJson(value){const url=URL.createObjectURL(new Blob([`${JSON.stringify(value,null,2)}\n`],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`reading-lens-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function kindText(kind){return{evidence:'证据',mistake:'易错点',vocabulary:'重点词'}[kind]??kind;}
function statusText(status){return{pending:'正在生成释义',failed:'释义生成失败',ready:'释义已生成'}[status]??'待补充';}
function formatSources(sources){const values=(sources??[]).map((source)=>[source.source_label,source.question_number?`第 ${source.question_number} 题`:null].filter(Boolean).join(' · ')).filter(Boolean);return values.length?`来源：${[...new Set(values)].slice(0,3).join('；')}`:'来源：爱听写阅读练习';}
function failureText(code){return{vocabulary_service_unreachable:'本地服务未启动或无法连接。',vocabulary_provider_unavailable:'本地释义服务未配置模型。',vocabulary_provider_timeout:'释义请求超时，请重试。',vocabulary_provider_http_error:'模型服务暂时不可用，请重试。',vocabulary_budget_exceeded:'本次内容超过释义预算限制。',vocabulary_output_contract_failed:'模型返回格式不完整，请重试。'}[code]||'上次生成失败；词条已安全保存，可以直接重试。';}
chrome.runtime.onMessage.addListener((message)=>{if(message?.type==='READING_LENS_DATA_CHANGED'){renderWorkspace();renderVocabulary();}});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes[WORKSPACE_STORAGE_KEY]||changes[VOCABULARY_STORAGE_KEY])){renderWorkspace();renderVocabulary();}});
showTab('workspace');
refreshProductStatus();

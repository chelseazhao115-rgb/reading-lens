(async () => {
  const adapter = globalThis.ReadingLensIdictationAdapter;
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type!=='READING_LENS_PAGE_STATUS')return;
    const live=adapter.recognizeWorkspace(document);const diagnostics=adapter.structureDiagnostics(document).structural;
    sendResponse(live.ok?{recognized:true,adapter_version:adapter.VERSION,questions:live.questions.length,diagnostics}:{recognized:false,reason:live.reason,adapter_version:adapter.VERSION,diagnostics});
  });
  const workspaceStore = await import(chrome.runtime.getURL('workspace-store.js'));
  const vocabularyStore = await import(chrome.runtime.getURL('vocabulary-store.js'));
  let recognized = adapter.recognizeWorkspace(document);
  if(!recognized.ok)recognized=await waitForWorkspace(adapter,15000);
  if (!recognized.ok) {
    chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
      if(message?.type==='READING_LENS_ADAPTER_DEBUG')sendResponse({version:adapter.VERSION,structure:adapter.structureDiagnostics(document)});
    });
    return;
  }
  let passage = recognized.passage;
  const passageText = normalizedText(passage.textContent);
  const passageHash = await sha256(passageText);
  const key = workspaceStore.workspaceKey(location.href, passageHash);
  const sourceTitle=detectSourceTitle(document);
  let workspace = await loadWorkspace() ?? workspaceStore.emptyWorkspace({ sourceUrl:location.href, passageHash, title:sourceTitle });
  let lastSelection = null;
  let saveTimer = null;
  let workspaceActive = true;
  const initialSourceIdentity=sourceIdentity(location.href);
  let pendingPassageMismatch=null;

  injectDiagnosisButtons(); createSelectionToolbar(); bindAutosave(); renderHighlights();
  chrome.runtime.sendMessage({type:'READING_LENS_WORKSPACE_READY',workspaceKey:key}).catch(()=>{});
  const initialSummary = workspaceStore.workspaceSummary(workspace);
  if (initialSummary.answers || initialSummary.highlights) showRestoreBanner();
  const redraw = debounce(() => {
    if(sourceIdentity(location.href)!==initialSourceIdentity){pauseForContentMismatch();return;}
    const currentPassage = adapter.recognizeWorkspace(document);
    if(!currentPassage.ok){injectDiagnosisButtons();renderHighlights();return;}
    const currentText=normalizedText(currentPassage.passage.textContent);
    if(currentText===passageText){passage=currentPassage.passage;pendingPassageMismatch=null;workspaceActive=true;}
    else if(passage!==currentPassage.passage&&isUsableNode(passage)&&normalizedText(passage.textContent)===passageText){pendingPassageMismatch=null;}
    else{
      const now=Date.now();if(!pendingPassageMismatch||pendingPassageMismatch.text!==currentText)pendingPassageMismatch={text:currentText,first_seen:now};
      if(now-pendingPassageMismatch.first_seen>=1200){pauseForContentMismatch();return;}
      setTimeout(redraw,1300);
    }
    injectDiagnosisButtons(); renderHighlights();
  }, 250);
  new MutationObserver((records) => { if (records.some(isExternalMutation)) redraw(); }).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('scroll',debounce(()=>renderHighlights(),60),true);window.addEventListener('resize',debounce(()=>renderHighlights(),80));

  function injectDiagnosisButtons() {
    for (const root of adapter.questionRoots(document)) {
      if (root.dataset.readingLensDiagnosisBound === 'true') continue;
      root.dataset.readingLensDiagnosisBound = 'true';
      const button = document.createElement('button'); button.type='button'; button.className='reading-lens-diagnose reading-lens-owned'; button.textContent='AI 错因诊断';
      button.addEventListener('click', async () => {
        const overrides={};let result=adapter.extractQuestion(document,root,overrides);
        if(!result.ok&&result.reason==='missing_user_answer'){
          const answer=window.prompt('未能自动读取你的作答。请输入并确认你当时填写的答案：','');
          if(!answer?.trim())return;overrides.user_answer=answer.trim();result=adapter.extractQuestion(document,root,overrides);
        }
        if(!result.ok&&result.reason==='missing_question_prompt'){
          const question=window.prompt('未能自动读取这道题的题干。请确认并输入本题题干（只需题目陈述，不包含选项）：','');
          if(!question?.trim())return;overrides.question=question.trim();result=adapter.extractQuestion(document,root,overrides);
        }
        if(!result.ok&&result.reason==='missing_correct_answer'){
          const answer=window.prompt('爱听写当前页面没有提供可读取的正确答案。请输入并确认这道题的正确答案：','');
          if(answer?.trim()){overrides.correct_answer=answer.trim().toUpperCase();result=adapter.extractQuestion(document,root,overrides);}
          else return;
        }
        if(!result.ok&&result.reason==='missing_standard_evidence'&&lastSelection?.anchor?.exact){overrides.standard_evidence=lastSelection.anchor.exact;result=adapter.extractQuestion(document,root,overrides);}
        if(!result.ok&&result.reason==='missing_standard_evidence'){
          const evidence=window.prompt('页面显示了标准证据，但插件未能自动定位。请复制该原文句子到这里；系统会验证它确实存在于文章中：','');
          if(!evidence?.trim())return;overrides.standard_evidence=evidence.trim();result=adapter.extractQuestion(document,root,overrides);
        }
        if(!result.ok){const labels={unsupported_question_type:'当前版本暂不支持该题型',missing_user_answer:'请先完成本题作答',missing_correct_answer:'未获得正确答案',missing_standard_evidence:'未找到本题标准证据',missing_question_prompt:'未识别题干',missing_question_metadata:'未识别题号或题型',missing_passage:'未识别阅读文章'};button.dataset.error='true';button.textContent=labels[result.reason]||'暂时无法诊断';button.title=`Reading Lens: ${result.reason}`;return;}
        delete button.dataset.error;button.textContent='AI 错因诊断';
        button.disabled=true;const response=await chrome.runtime.sendMessage({type:'READING_LENS_OPEN_QUESTION',payload:result.value});button.disabled=false;
        if(!response?.ok)button.textContent='侧边栏打开失败，请重试';
      }); root.append(button);
    }
  }
  function bindAutosave(){
    const handler=(event)=>{if(event.target.closest?.('.reading-lens-owned'))return;const root=adapter.questionRoots(document).find((item)=>item.contains(event.target));if(!root)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveQuestion(root),300);};
    document.addEventListener('input',handler,true);document.addEventListener('change',handler,true);document.addEventListener('click',handler,true);
    window.addEventListener('scroll',debounce(()=>{workspace.scroll_anchor={y:window.scrollY};persistWorkspace();},500),{passive:true});
  }
  function saveQuestion(root){if(!workspaceActive)return;const roots=adapter.questionRoots(document);const snapshot=adapter.questionSnapshot(root,roots.indexOf(root));if(!snapshot.value)return;workspace=workspaceStore.upsertAnswer(workspace,snapshot);persistWorkspace();notifyChanged();}

  function createSelectionToolbar(){
    const toolbar=document.createElement('div');toolbar.className='reading-lens-selection-tools reading-lens-owned';toolbar.hidden=true;
    toolbar.addEventListener('pointerdown',(event)=>event.preventDefault());
    let wordButton=null;let pointerSelectionAt=0;let selecting=false;let dragBest=null;
    for(const [kind,label] of [['evidence','证据'],['mistake','易错点'],['vocabulary','重点词'],['word','加入错词本']]){const button=document.createElement('button');button.type='button';button.dataset.kind=kind;button.textContent=label;if(kind==='word')wordButton=button;button.addEventListener('click',()=>kind==='word'?addWord():addSelectedHighlight(kind));toolbar.append(button);}document.body.append(toolbar);
    const captureSelection=(fromPointer=false)=>{if(!fromPointer&&Date.now()-pointerSelectionAt<800)return false;refreshPassageNode();const selection=document.getSelection();let candidate=null;if(selection?.rangeCount&&!selection.isCollapsed){const range=selection.getRangeAt(0);const quote=normalizedText(selection.toString());const contained=quote&&passage?.contains(selection.anchorNode)&&passage?.contains(selection.focusNode);let start=contained?selectionStartInNormalizedPassage(range,passage):-1;if(!contained&&quote){const first=passageText.indexOf(quote);if(first>=0&&first===passageText.lastIndexOf(quote))start=first;}const anchor=start>=0?workspaceStore.createTextAnchor(passageText,start,start+quote.length):null;const rect=range.getBoundingClientRect();if(anchor)candidate={quote,anchor,rect:{left:rect.left,top:rect.top}};}if(selecting&&candidate&&(!dragBest||candidate.quote.length>=dragBest.quote.length))dragBest=candidate;if(fromPointer&&dragBest&&(!candidate||dragBest.quote.length>candidate.quote.length))candidate=dragBest;if(!candidate)return false;lastSelection={quote:candidate.quote,anchor:candidate.anchor};if(fromPointer)pointerSelectionAt=Date.now();if(wordButton)wordButton.textContent=`加入错词本：${candidate.quote.length>18?`${candidate.quote.slice(0,18)}…`:candidate.quote}`;toolbar.style.left=`${Math.max(8,Math.min(innerWidth-toolbar.offsetWidth-8,candidate.rect.left))}px`;toolbar.style.top=`${Math.max(8,candidate.rect.top-48)}px`;toolbar.hidden=false;return true;};
    document.addEventListener('pointerup',()=>{captureSelection(true);selecting=false;},true);document.addEventListener('selectionchange',()=>captureSelection(false));
    document.addEventListener('pointerdown',(event)=>{if(toolbar.contains(event.target))return;refreshPassageNode();if(passage?.contains(event.target)){selecting=true;dragBest=null;return;}selecting=false;toolbar.hidden=true;lastSelection=null;},true);
    document.addEventListener('keydown',(event)=>{if(event.key==='Escape'){toolbar.hidden=true;lastSelection=null;}});
  }
  async function addSelectedHighlight(kind){if(!lastSelection)return;workspace=workspaceStore.addHighlight(workspace,{kind,anchor:lastSelection.anchor,question_number:workspace.current_question});await persistWorkspace();renderHighlights();hideTools();notifyChanged();toast(kind==='evidence'?'证据已保存，并在原文中标为青色。':'高亮已保存，可在侧栏添加 Note。');}
  async function addWord(){
    if(!lastSelection||lastSelection.quote.length>120)return toast('请选择120个字符以内的单词或短语。',true);
    let vocabulary=await loadVocabulary();const sentence=sentenceAround(passageText,lastSelection.anchor.exact);const added=vocabularyStore.addVocabularyEntry(vocabulary,{term:lastSelection.quote,sentence,workspace_key:key,question_number:workspace.current_question,source_url:location.href,source_label:sourceTitle});
    if(added.error)return toast('这个选择无法加入错词本。',true);await saveVocabulary(added.state);workspace.vocabulary_refs=[...new Set([...workspace.vocabulary_refs,added.entry.id])];await persistWorkspace();hideTools();toast(added.created?'已加入错词本，正在生成语境释义。':'已合并到现有错词。');if(added.should_enrich)enrichVocabulary(added.entry.id);
  }
  async function enrichVocabulary(id){let vocabulary=await loadVocabulary();const entry=vocabulary.entries.find((item)=>item.id===id);if(!entry)return;try{const result=await chrome.runtime.sendMessage({type:'READING_LENS_ENRICH_VOCABULARY',payload:{term:entry.original_term,sentence:entry.sentence,context:entry.sentence}});if(!result?.ok)throw new Error(result?.error||'vocabulary_provider_failed');vocabulary=vocabularyStore.applyEnrichment(vocabulary,id,result.enrichment);toast(`${entry.original_term} 的语境释义已生成。`);}catch(error){vocabulary=vocabularyStore.markEnrichmentFailed(vocabulary,id,error?.message);toast('词条已保存，但自动释义失败；可在错词本中重试。',true);}await saveVocabulary(vocabulary);notifyChanged();}

  function showRestoreBanner(){const summary=workspaceStore.workspaceSummary(workspace);const banner=document.createElement('aside');banner.className='reading-lens-restore reading-lens-owned';const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent='发现这套题的本地学习记录';const detail=document.createElement('span');detail.textContent=`${summary.answers} 个答案 · ${summary.highlights} 处高亮 · ${summary.notes} 条 Note`;copy.append(strong,detail);banner.append(copy,makeButton('一键恢复',restoreWorkspace),makeButton('保留当前页面',()=>banner.remove(),true));document.body.append(banner);}
  async function restoreWorkspace(){const roots=adapter.questionRoots(document);for(const root of roots){const number=adapter.questionSnapshot(root,roots.indexOf(root)).question_number;const answer=workspace.answers[number];if(answer)adapter.applyAnswer(root,answer.value);}renderHighlights();if(workspace.scroll_anchor?.y>=0)window.scrollTo({top:workspace.scroll_anchor.y,behavior:'smooth'});document.querySelector('.reading-lens-restore')?.remove();toast('学习记录已恢复，不会自动提交试卷。');}
  function renderHighlights(){for(const kind of ['evidence','mistake','vocabulary'])globalThis.CSS?.highlights?.delete(`reading-lens-${kind}`);const groups={evidence:[],mistake:[],vocabulary:[]};for(const item of workspace.highlights){const resolved=workspaceStore.resolveTextAnchor(passageText,item.anchor);if(!resolved.resolved){item.status='unresolved';continue;}const range=rangeForNormalizedOffsets(passage,resolved.start,resolved.end);if(range){groups[item.kind].push(range);item.status='located';}}for(const [kind,ranges] of Object.entries(groups))if(ranges.length&&globalThis.CSS?.highlights)CSS.highlights.set(`reading-lens-${kind}`,new Highlight(...ranges));renderHighlightOverlay(groups);}
  function renderHighlightOverlay(groups){let layer=document.querySelector('.reading-lens-highlight-layer');if(!layer){layer=document.createElement('div');layer.className='reading-lens-highlight-layer reading-lens-owned';document.body.append(layer);}layer.replaceChildren();for(const [kind,ranges] of Object.entries(groups))for(const range of ranges)for(const rect of range.getClientRects()){if(rect.width<1||rect.height<1||rect.bottom<0||rect.top>innerHeight)continue;const mark=document.createElement('span');mark.className=`reading-lens-highlight-rect ${kind} reading-lens-owned`;mark.style.left=`${rect.left}px`;mark.style.top=`${rect.top}px`;mark.style.width=`${rect.width}px`;mark.style.height=`${rect.height}px`;layer.append(mark);}}

  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type==='READING_LENS_GET_SELECTION')sendResponse({quote:lastSelection?.quote??''});
    if(message?.type==='READING_LENS_ADAPTER_DEBUG')sendResponse({version:adapter.VERSION,structure:adapter.structureDiagnostics(document)});
    if(message?.type==='READING_LENS_GET_WORKSPACE')sendResponse({workspace,summary:workspaceStore.workspaceSummary(workspace),key});
    if(message?.type==='READING_LENS_RESTORE_WORKSPACE'){restoreWorkspace().then(()=>sendResponse({ok:true}));return true;}
    if(message?.type==='READING_LENS_SCROLL_HIGHLIGHT'){scrollToAnchor(message.anchor);sendResponse({ok:true});}
    if(message?.type==='READING_LENS_UPDATE_HIGHLIGHT'){workspace=workspaceStore.updateHighlight(workspace,message.id,{note:message.note});persistWorkspace().then(()=>sendResponse({ok:true}));return true;}
    if(message?.type==='READING_LENS_DELETE_HIGHLIGHT'){workspace=workspaceStore.removeHighlight(workspace,message.id);persistWorkspace().then(()=>{renderHighlights();sendResponse({ok:true});});return true;}
    if(message?.type==='READING_LENS_DELETE_WORKSPACE'){deleteWorkspace().then(()=>sendResponse({ok:true}));return true;}
  });
  async function loadWorkspace(){const stored=await chrome.storage.local.get([workspaceStore.WORKSPACE_STORAGE_KEY]);return stored[workspaceStore.WORKSPACE_STORAGE_KEY]?.workspaces?.[key]??null;}
  async function persistWorkspace(){const stored=await chrome.storage.local.get([workspaceStore.WORKSPACE_STORAGE_KEY]);const container=stored[workspaceStore.WORKSPACE_STORAGE_KEY]??{schema_version:1,workspaces:{}};container.workspaces[key]=workspace;try{await chrome.storage.local.set({[workspaceStore.WORKSPACE_STORAGE_KEY]:container});}catch{toast('本地空间不足。请先导出备份或删除旧记录。',true);}}
  async function deleteWorkspace(){const stored=await chrome.storage.local.get([workspaceStore.WORKSPACE_STORAGE_KEY]);const container=stored[workspaceStore.WORKSPACE_STORAGE_KEY]??{schema_version:1,workspaces:{}};delete container.workspaces[key];await chrome.storage.local.set({[workspaceStore.WORKSPACE_STORAGE_KEY]:container});workspace=workspaceStore.emptyWorkspace({sourceUrl:location.href,passageHash,title:sourceTitle});renderHighlights();document.querySelector('.reading-lens-restore')?.remove();}
  async function loadVocabulary(){const stored=await chrome.storage.local.get([vocabularyStore.VOCABULARY_STORAGE_KEY]);return stored[vocabularyStore.VOCABULARY_STORAGE_KEY]??vocabularyStore.emptyVocabulary();}
  async function saveVocabulary(value){try{await chrome.storage.local.set({[vocabularyStore.VOCABULARY_STORAGE_KEY]:value});}catch{toast('本地空间不足，错词未保存。请先清理数据。',true);throw new Error('storage_quota');}}
  function notifyChanged(){chrome.runtime.sendMessage({type:'READING_LENS_DATA_CHANGED'}).catch(()=>{});}function hideTools(){document.querySelector('.reading-lens-selection-tools').hidden=true;document.getSelection()?.removeAllRanges();}
  function toast(message,error=false){let node=document.querySelector('.reading-lens-toast');if(!node){node=document.createElement('div');node.className='reading-lens-toast reading-lens-owned';document.body.append(node);}node.textContent=message;node.dataset.error=String(error);clearTimeout(node.timer);node.timer=setTimeout(()=>node.remove(),3500);}
  function scrollToAnchor(anchor){const resolved=workspaceStore.resolveTextAnchor(passageText,anchor);if(!resolved.resolved)return;const range=rangeForNormalizedOffsets(passage,resolved.start,resolved.end);range?.startContainer.parentElement?.scrollIntoView({behavior:'smooth',block:'center'});}
  function refreshPassageNode(){if(isUsableNode(passage)&&normalizedText(passage.textContent)===passageText)return true;const live=adapter.recognizeWorkspace(document);if(live.ok&&normalizedText(live.passage.textContent)===passageText){passage=live.passage;pendingPassageMismatch=null;return true;}return false;}
  function pauseForContentMismatch(){if(!workspaceActive)return;workspaceActive=false;toast('检测到试卷或文章正文确实发生变化。为避免错配，学习记录已暂停。',true);}
  function isExternalMutation(record){const changed=[...record.addedNodes,...record.removedNodes].filter((node)=>node.nodeType===Node.ELEMENT_NODE);return changed.some((node)=>!node.classList?.contains('reading-lens-owned')&&!node.closest?.('.reading-lens-owned'));}
})();

function normalizedText(value){return String(value??'').replace(/\s+/g,' ').trim();}
function sourceIdentity(value){const url=new URL(value);const keys=['lid','cid','sid','id'];return `${url.pathname}?${keys.map((key)=>`${key}=${url.searchParams.get(key)??''}`).join('&')}`;}
function isUsableNode(node){if(!node?.isConnected)return false;const style=getComputedStyle(node);return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;}
function waitForWorkspace(adapter,timeout){return new Promise((resolve)=>{let settled=false;const finish=(value)=>{if(settled)return;settled=true;observer.disconnect();clearTimeout(timer);resolve(value);};const observer=new MutationObserver(()=>{const result=adapter.recognizeWorkspace(document);if(result.ok)finish(result);});observer.observe(document.documentElement,{childList:true,subtree:true});const timer=setTimeout(()=>finish(adapter.recognizeWorkspace(document)),timeout);});}
async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(bytes)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');}
function debounce(fn,delay){let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),delay);};}
function sentenceAround(text,term){const index=text.indexOf(term);if(index<0)return term;const left=Math.max(text.lastIndexOf('.',index-1),text.lastIndexOf('?',index-1),text.lastIndexOf('!',index-1));const ends=[text.indexOf('.',index+term.length),text.indexOf('?',index+term.length),text.indexOf('!',index+term.length)].filter((item)=>item>=0);const right=ends.length?Math.min(...ends)+1:Math.min(text.length,index+term.length+180);return text.slice(Math.max(0,left+1),right).trim().slice(0,1000);}
function detectSourceTitle(doc){for(const node of doc.querySelectorAll('span,p,div')){if(node.children.length>3)continue;const value=normalizedText(node.textContent);const match=value.match(/(?:爱听写\s*)?剑雅\s*\d+\s*Test\s*\d+/i);if(match)return match[0];}const url=new URL(location.href);const id=url.searchParams.get('id')||url.searchParams.get('lid');return id?`爱听写练习 ${id}`:(doc.title||'爱听写阅读练习');}
function selectionStartInNormalizedPassage(range,passage){const before=range.cloneRange();before.selectNodeContents(passage);before.setEnd(range.startContainer,range.startOffset);return normalizedText(before.toString()).length;}
function rangeForNormalizedOffsets(root,start,end){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let normalized='';const chars=[];let node;while((node=walker.nextNode()))for(let i=0;i<node.data.length;i++){const char=node.data[i];if(/\s/.test(char)){if(normalized&&!normalized.endsWith(' ')){normalized+=' ';chars.push({node,offset:i});}}else{normalized+=char;chars.push({node,offset:i});}}if(normalized.endsWith(' ')){normalized=normalized.slice(0,-1);chars.pop();}if(start<0||end>chars.length||start>=end)return null;const range=document.createRange();range.setStart(chars[start].node,chars[start].offset);const last=chars[end-1];range.setEnd(last.node,last.offset+1);return range;}
function makeButton(label,action,secondary=false){const value=document.createElement('button');value.type='button';value.textContent=label;if(secondary)value.className='secondary';value.addEventListener('click',action);return value;}

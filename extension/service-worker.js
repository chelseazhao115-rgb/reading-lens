chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'READING_LENS_WORKSPACE_READY' && sender.tab?.id) {
    chrome.storage.session.set({ activeTabId: sender.tab.id, activeWorkspaceKey: message.workspaceKey });
    return;
  }
  if (message?.type === 'READING_LENS_ENRICH_VOCABULARY') {
    enrichVocabulary(message.payload)
      .then((result) => sendResponse(result))
      .catch(() => sendResponse({ ok:false, error:'vocabulary_service_unreachable' }));
    return true;
  }
  if (message?.type !== 'READING_LENS_OPEN_QUESTION' || !sender.tab?.id) return;
  const tabId = sender.tab.id;
  chrome.storage.session.set({ activeQuestion: message.payload, activeTabId: tabId })
    .then(() => chrome.sidePanel.open({ tabId }))
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function enrichVocabulary(payload) {
  const term=String(payload?.term??'').trim();const sentence=String(payload?.sentence??'').trim();const context=String(payload?.context??'').trim();
  if(!term||term.length>120||!sentence||sentence.length>1000||context.length>1600)return{ok:false,error:'invalid_vocabulary_input'};
  try{
    const response=await fetch('http://127.0.0.1:4173/api/vocabulary/enrich',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({term,sentence,context})});
    const value=await response.json();
    return response.ok&&value.status==='enriched'?{ok:true,enrichment:value.enrichment}:{ok:false,error:value.error||'vocabulary_provider_failed'};
  }catch{return{ok:false,error:'vocabulary_service_unreachable'};}
}

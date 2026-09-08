(function attachAdapter(scope) {
  const VERSION = 'idictation-v5';
  const SUPPORTED_TYPES = new Set(['TRUE_FALSE_NOT_GIVEN','YES_NO_NOT_GIVEN','FILL_IN_THE_BLANK']);
  const SELECTORS = Object.freeze({
    passage: ['[data-reading-passage]', '.reading-passage', '.article-content', '.passage-content'],
    question: ['[data-question-number]', '.question-item', '.answer-item', '.read-question-item'],
    prompt: ['[data-question-prompt]', '.question-title', '.question-stem', '.subject-title'],
    userAnswer: ['[data-user-answer]', '.user-answer', '.my-answer', '.student-answer'],
    correctAnswer: ['[data-correct-answer]', '.correct-answer', '.right-answer', '.standard-answer'],
    explanation: ['[data-explanation]', '.analysis-content', '.answer-analysis', '.parse-content'],
    standardEvidence: ['[data-standard-evidence]', '.location-sentence', '.evidence-sentence', '.analysis-location'],
    option: ['[data-option]', '.option-item', '.answer-option']
  });
  const ANSWER_SELECTORS = ['input[type="radio"]:checked', 'input[type="text"]', 'textarea', 'select', '[data-selected="true"]', '.selected', '.active'];

  function findUnique(root, names, required = true) {
    const matches = [];
    for (const selector of names) for (const node of root.querySelectorAll(selector)) if (!matches.includes(node)) matches.push(node);
    if (matches.length === 1) return { ok: true, node: matches[0] };
    return required ? { ok: false, reason: matches.length ? 'ambiguous_selector' : 'missing_selector' } : { ok: true, node: matches[0] ?? null };
  }

  function text(node) { return node?.textContent?.replace(/\s+/g, ' ').trim() ?? ''; }
  function field(root, selectors, attribute) {
    const found = findUnique(root, selectors);
    if (!found.ok) return found;
    const value = attribute ? (found.node.getAttribute(attribute) || text(found.node)) : text(found.node);
    return value?.trim() ? { ok: true, value: value.trim() } : { ok: false, reason: 'empty_field' };
  }

  function extractQuestion(doc, questionRoot, overrides = {}) {
    const passageNode = findPassage(doc, questionRoots(doc));
    const passage = passageNode ? {ok:true,value:text(passageNode)} : {ok:false,reason:'missing_passage'};
    const suppliedPrompt = String(overrides.question ?? '').replace(/\s+/g,' ').trim();
    const prompt = suppliedPrompt ? {ok:true,value:suppliedPrompt} : (field(questionRoot, SELECTORS.prompt).ok ? field(questionRoot, SELECTORS.prompt) : structuralPrompt(questionRoot));
    const suppliedUserAnswer = String(overrides.user_answer ?? '').trim();
    const userAnswer = suppliedUserAnswer ? {ok:true,value:suppliedUserAnswer} : (field(questionRoot, SELECTORS.userAnswer, 'data-user-answer').ok ? field(questionRoot, SELECTORS.userAnswer, 'data-user-answer') : structuralUserAnswer(questionRoot));
    const suppliedCorrectAnswer = String(overrides.correct_answer ?? '').trim();
    const questionType = questionRoot.getAttribute('data-question-type') || inferQuestionType(questionRoot, doc);
    const correctAnswer = suppliedCorrectAnswer ? {ok:true,value:suppliedCorrectAnswer} : (field(questionRoot, SELECTORS.correctAnswer, 'data-correct-answer').ok ? field(questionRoot, SELECTORS.correctAnswer, 'data-correct-answer') : structuralCorrectAnswer(questionRoot, questionType));
    const inferredNumber = questionNumber(questionRoot);
    const questionNumberValue = canonicalQuestionNumber(questionRoot, inferredNumber);
    const explicitEvidence = field(questionRoot, SELECTORS.standardEvidence, 'data-standard-evidence');
    const visibleEvidence = explicitEvidence.ok ? explicitEvidence : visibleGlobalEvidence(doc);
    const suppliedEvidence=String(overrides.standard_evidence??'').replace(/\s+/g,' ').trim();
    const standardEvidence = suppliedEvidence?{ok:true,value:suppliedEvidence}:(visibleEvidence.ok ? visibleEvidence : taggedEvidence(passage.value, questionNumberValue));
    if(!SUPPORTED_TYPES.has(questionType))return{ok:false,reason:'unsupported_question_type'};
    const failed = [passage, prompt, userAnswer, correctAnswer, standardEvidence].find((item) => !item.ok);
    if (failed || !questionNumberValue || !questionType) return { ok: false, reason: failed?.reason ?? 'missing_question_metadata' };
    if (!passage.value.includes(standardEvidence.value)) return { ok: false, reason: 'standard_evidence_not_in_passage' };
    return { ok: true, value: {
      source: 'idictation', source_url: location.href, adapter_version: VERSION,
      question_number: questionNumberValue, question_type: questionType, passage: passage.value,
      question: prompt.value, options: [...questionRoot.querySelectorAll(SELECTORS.option.join(','))].map(text).filter(Boolean),
      user_answer: userAnswer.value, correct_answer: correctAnswer.value,
      standard_evidence: standardEvidence.value,
      explanation: optionalText(questionRoot, SELECTORS.explanation), user_evidence: ''
    }};
  }

  function inferQuestionType(root, doc = root.ownerDocument) {
    const words = text(root).toUpperCase();
    if (words.includes('NOT GIVEN') && words.includes('TRUE') && words.includes('FALSE')) return 'TRUE_FALSE_NOT_GIVEN';
    if (words.includes('NOT GIVEN') && words.includes('YES') && words.includes('NO')) return 'YES_NO_NOT_GIVEN';
    if (root.querySelector('input[type="text"], [data-fill-blank]')) return 'FILL_IN_THE_BLANK';
    const pageWords = text(doc?.body).toUpperCase();
    if (/COMPLETE THE (?:NOTES?|SUMMARY|SENTENCES?|TABLE|FLOW-CHART|DIAGRAM)/.test(pageWords) || /WRITE (?:NO MORE THAN )?(?:ONE|TWO|THREE) WORDS?/.test(pageWords)) return 'FILL_IN_THE_BLANK';
    return '';
  }
  function optionalText(root, selectors) {
    const found = findUnique(root, selectors, false);
    return found.node ? text(found.node) : '';
  }
  function questionRoots(doc) {
    const nodes = [];
    for (const selector of SELECTORS.question) for (const node of doc.querySelectorAll(selector)) if (!nodes.includes(node)) nodes.push(node);
    const explicit=nodes.filter((node) => node.getAttribute('data-question-number') || node.querySelector('.question-number'));
    if(explicit.length)return explicit;
    return structuralQuestionRoots(doc);
  }
  function recognizeWorkspace(doc) {
    const questions = questionRoots(doc);
    const passage=findPassage(doc,questions);
    return passage && questions.length > 0 ? { ok:true, passage, questions } : { ok:false, reason:questions.length ? 'missing_passage' : 'missing_questions' };
  }
  function questionSnapshot(root, index = 0) {
    const number = canonicalQuestionNumber(root, questionNumber(root)) || String(index + 1);
    const controls = [...root.querySelectorAll(ANSWER_SELECTORS.join(','))].filter((node) => !node.closest('.reading-lens-owned'));
    const values = controls.map(controlValue).filter(Boolean);
    const value = values.length === 1 ? values[0] : values.join(' | ');
    return { question_number:number, value, completed:Boolean(value) };
  }
  function applyAnswer(root, value) {
    const controls = [...root.querySelectorAll('input, textarea, select, [data-value], [role="radio"]')].filter((node) => !node.closest('.reading-lens-owned'));
    let applied = false;
    for (const control of controls) {
      if (control.matches('input[type="radio"], input[type="checkbox"], [role="radio"]')) {
        const candidate = control.value || control.getAttribute('data-value') || text(control);
        if (candidate.trim() === value.trim()) { control.click(); applied = true; }
      } else if ('value' in control && controls.length === 1) {
        control.value = value; control.dispatchEvent(new Event('input', { bubbles:true })); control.dispatchEvent(new Event('change', { bubbles:true })); applied = true;
      }
    }
    return applied;
  }
  function controlValue(node) {
    if (node.matches('input[type="radio"], input[type="checkbox"]') && !node.checked) return '';
    return String(node.value || node.getAttribute('data-value') || text(node)).replace(/\s+/g, ' ').trim();
  }
  function structureDiagnostics(doc) {
    return {...Object.fromEntries(Object.entries(SELECTORS).map(([key, selectors]) => [key, selectors.map((selector) => ({ selector, count: doc.querySelectorAll(selector).length }))])),structural:{radio_count:doc.querySelectorAll('input[type="radio"],[role="radio"]').length,question_groups:structuralQuestionRoots(doc).length,passage_found:Boolean(findPassage(doc,structuralQuestionRoots(doc)))}};
  }

  function structuralQuestionRoots(doc){
    const roots=[];const parseAnchors=parseControls(doc);
    for(const anchor of parseAnchors){let node=anchor.parentElement;let match=null;for(let depth=0;node&&depth<10;depth+=1,node=node.parentElement){const value=text(node);const numbered=/(?:^|\s)\d{1,2}(?:[.)、]|\s+(?:未作答|[A-Za-z]))\s*\S/.test(value);if(parseControls(node).length===1&&numbered&&value.length>=5&&value.length<1800){match=node;break;}}if(match&&!roots.some((root)=>root===match||root.contains(match)||match.contains(root)))roots.push(match);}
    if(roots.length)return roots.sort((a,b)=>questionNumber(a)-questionNumber(b));
    const controls=[...doc.querySelectorAll('input[type="radio"],[role="radio"],input[type="text"],[data-fill-blank]')];
    for(const control of controls){let node=control.parentElement;let match=null;for(let depth=0;node&&depth<9;depth+=1,node=node.parentElement){const count=node.querySelectorAll('input[type="radio"],[role="radio"]').length;const textInputs=node.querySelectorAll('input[type="text"],[data-fill-blank]').length;const value=text(node);if(((count>=2&&count<=6)||textInputs===1)&&value.length<1800&&/\b\d{1,2}[.)、]\s*\S/.test(value)){match=node;break;}}if(match&&!roots.some((root)=>root===match||root.contains(match)||match.contains(root)))roots.push(match);}
    return roots.sort((a,b)=>questionNumber(a)-questionNumber(b));
  }
  function findPassage(doc,questions){const explicit=findUnique(doc,SELECTORS.passage);if(explicit.ok)return explicit.node;const candidates=[...doc.querySelectorAll('article,main,section,div')].filter((node)=>{const value=text(node);if(value.length<700||value.length>30000||!/\bQ\s*\d{1,2}\b/i.test(value))return false;if(questions.some((question)=>node.contains(question)))return false;return node.querySelectorAll('p').length>=2||value.length>=1600;});if(candidates.length){candidates.sort((a,b)=>text(a).length-text(b).length);const shortest=text(candidates[0]).length;const close=candidates.filter((node)=>text(node).length<=shortest*1.08);return close.length===1?close[0]:candidates[0];}return geometricPassage(doc,questions);}
  function geometricPassage(doc,questions){const questionLeft=Math.min(...questions.map((node)=>node.getBoundingClientRect().left).filter((value)=>value>100));if(!Number.isFinite(questionLeft))return null;const candidates=[...doc.querySelectorAll('article,main,section,div')].filter((node)=>{const rect=node.getBoundingClientRect();const value=text(node);return isVisible(node)&&value.length>=700&&value.length<=30000&&rect.width>=260&&rect.height>=300&&rect.left<questionLeft&&rect.right<=questionLeft+32&&!questions.some((question)=>node.contains(question));});if(!candidates.length)return null;candidates.sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();const aScore=Math.abs(ar.right-questionLeft)+text(a).length/10000;const bScore=Math.abs(br.right-questionLeft)+text(b).length/10000;return aScore-bScore;});return candidates[0];}
  function structuralPrompt(root){
    const value=text(root).replace(/AI\s*错因诊断|暂时无法诊断|未识别题干|解析/gi,' ').replace(/\s+/g,' ').trim();
    const numbered=value.match(/(?:^|\s)\d{1,2}(?:[.)、]|\s+)\s*(.+)$/);if(!numbered)return{ok:false,reason:'missing_question_prompt'};
    const answerStart=numbered[1].search(/\s+(?:TRUE|FALSE|NOT\s+GIVEN|YES|NO)\b/i);
    const candidate=(answerStart>0?numbered[1].slice(0,answerStart):numbered[1]).replace(/\s+/g,' ').trim();
    return candidate.length>=3?{ok:true,value:candidate}:{ok:false,reason:'missing_question_prompt'};
  }
  function structuralUserAnswer(root){const textInput=root.querySelector('input[type="text"],[data-fill-blank],textarea');if(textInput){const value=controlValue(textInput);return value?{ok:true,value}:{ok:false,reason:'missing_user_answer'};}const checked=root.querySelector('input[type="radio"]:checked,[role="radio"][aria-checked="true"],.is-checked,.checked');const value=checked&&(checked.value||checked.getAttribute('data-value')||answerToken(text(checked.closest('label')||checked.parentElement||checked)));return value?.trim()?{ok:true,value:value.trim()}:{ok:false,reason:'missing_user_answer'};}
  function structuralCorrectAnswer(root, questionType){for(const control of root.querySelectorAll('input[type="radio"],[role="radio"]')){const label=control.closest('label')||control.parentElement;const style=getComputedStyle(label);const rgb=(style.color.match(/\d+/g)??[]).slice(0,3).map(Number);const green=/green|success|correct|right/i.test(`${label.className} ${control.className}`)||(rgb.length===3&&rgb[1]>rgb[0]*1.25&&rgb[1]>rgb[2]*1.1);if(green){const value=control.value||control.getAttribute('data-value')||text(label);if(value)return{ok:true,value:value.trim()};}}if(questionType==='FILL_IN_THE_BLANK'){const candidates=[...root.querySelectorAll('span,b,strong,em,i,div')].filter((node)=>node.children.length===0&&isVisible(node)).map((node)=>({node,value:text(node)})).filter(({value})=>value&&value.length<=120&&!/^(?:解析|未作答|AI\s*错因诊断)$/i.test(value));const green=candidates.filter(({node})=>{const style=getComputedStyle(node);const rgb=(style.color.match(/\d+/g)??[]).slice(0,3).map(Number);return /green|success|correct|right/i.test(`${node.className}`)||(rgb.length===3&&rgb[1]>rgb[0]*1.2&&rgb[1]>rgb[2]*1.08);});if(green.length===1)return{ok:true,value:green[0].value};}return{ok:false,reason:'missing_correct_answer'};}
  function canonicalQuestionNumber(root,inferred){const candidates=[root.getAttribute('data-question-number'),text(root.querySelector('.question-number'))];for(const candidate of candidates){const match=String(candidate??'').match(/\d{1,2}/);if(match)return String(Number(match[0]));}return inferred===999?'':String(inferred);}
  function visibleGlobalEvidence(doc){const matches=[];for(const selector of SELECTORS.standardEvidence)for(const node of doc.querySelectorAll(selector)){const value=text(node);if(value&&isVisible(node)&&!matches.includes(value))matches.push(value);}return matches.length===1?{ok:true,value:matches[0]}:{ok:false,reason:'missing_standard_evidence'};}
  function taggedEvidence(passageValue, number){
    if(!passageValue||!number)return{ok:false,reason:'missing_standard_evidence'};
    const digits=String(number).replace(/[^0-9]/g,'');if(!digits)return{ok:false,reason:'missing_standard_evidence'};
    const marker=new RegExp(`(?:^|[^A-Z0-9])Q\\s*${digits}(?!\\d)`,'i');const match=marker.exec(passageValue);
    if(!match)return{ok:false,reason:'missing_standard_evidence'};
    const markerStart=match.index+(match[0].match(/Q/i)?.index??0);const markerLength=match[0].length-(markerStart-match.index);
    const tail=passageValue.slice(markerStart+markerLength);const next=tail.search(/(?:^|[^A-Z0-9])Q\s*\d{1,2}(?!\d)/i);
    const end=next>=0?markerStart+markerLength+next:Math.min(passageValue.length,markerStart+700);
    const value=passageValue.slice(markerStart,end).trim();
    return value.length>=20?{ok:true,value}:{ok:false,reason:'missing_standard_evidence'};
  }
  function questionNumber(root){return Number(text(root).match(/(?:^|\s)(\d{1,2})(?:[.)、]|\s+(?:未作答|[A-Za-z]))/)?.[1]??999);}
  function answerToken(value){return value.match(/\b(TRUE|FALSE|NOT GIVEN|YES|NO)\b/i)?.[1]?.toUpperCase()??value.trim();}
  function isVisible(node){const style=getComputedStyle(node);const rect=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>0&&rect.height>0;}
  function parseControls(root){return[...root.querySelectorAll('a,button,span,div,p')].filter((node)=>text(node)==='解析'&&text(node.parentElement)!=='解析'&&isVisible(node));}
  scope.ReadingLensIdictationAdapter = { VERSION, extractQuestion, questionRoots, recognizeWorkspace, questionSnapshot, applyAnswer, structureDiagnostics };
})(globalThis);

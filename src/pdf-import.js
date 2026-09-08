import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);

export const MAX_PDF_BYTES = 60 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
export const OCR_NATIVE_TEXT_THRESHOLD = 40;

export function validatePdfUpload(buffer, contentType = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return { valid:false, error:'empty_pdf' };
  if (buffer.length > MAX_PDF_BYTES) return { valid:false, error:'pdf_too_large' };
  if (!String(contentType).toLowerCase().startsWith('application/pdf')) return { valid:false, error:'invalid_pdf_content_type' };
  if (buffer.subarray(0,5).toString('ascii') !== '%PDF-') return { valid:false, error:'invalid_pdf_signature' };
  return { valid:true };
}

export async function extractPdfText(buffer, options = {}) {
  const check = validatePdfUpload(buffer, 'application/pdf');
  if (!check.valid) return check;
  try {
    const pdfjs = options.pdfjs ?? await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({ data:new Uint8Array(buffer), useSystemFonts:true, disableFontFace:true, verbosity:0 }).promise;
    if (document.numPages > MAX_PDF_PAGES) return { valid:false, error:'pdf_too_many_pages' };
    const pages=[];
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
      const page=await document.getPage(pageNumber);const content=await page.getTextContent();
      const text=content.items.map((item)=>`${item.str ?? ''}${item.hasEOL?'\n':' '}`).join('').replace(/[ \t]+\n/g,'\n').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();
      pages.push({ page_number:pageNumber,text,char_count:text.length });
      page.cleanup?.();
    }
    const ocrTargets=pages.filter((page)=>page.char_count<OCR_NATIVE_TEXT_THRESHOLD).map((page)=>page.page_number);
    let ocrPages=[];
    if(ocrTargets.length){
      try{const runOcr=options.ocrExtractor??extractPdfOcrText;ocrPages=await runOcr(document,ocrTargets,{...options,pdfBuffer:buffer});}
      catch{if(pages.reduce((sum,page)=>sum+page.char_count,0)<100)return {valid:false,error:'pdf_ocr_failed',page_count:document.numPages};}
      const byNumber=new Map(ocrPages.map((page)=>[page.page_number,page]));
      for(const page of pages){const ocr=byNumber.get(page.page_number);if(ocr&&ocr.char_count>page.char_count){page.text=ocr.text;page.char_count=ocr.char_count;page.source='ocr';}else page.source='native_text';}
    }else for(const page of pages)page.source='native_text';
    const totalChars=pages.reduce((sum,page)=>sum+page.char_count,0);
    if(totalChars<100)return {valid:false,error:'pdf_text_unavailable',page_count:document.numPages};
    const ocrPageCount=pages.filter((page)=>page.source==='ocr').length;
    const extractionMethod=ocrPageCount===0?'native_text':ocrPageCount===pages.length?'ocr':'hybrid';
    return {valid:true,value:{document_hash:createHash('sha256').update(buffer).digest('hex'),page_count:document.numPages,total_characters:totalChars,extraction_method:extractionMethod,ocr_page_count:ocrPageCount,pages,detected_content:detectReadingContent(pages)}};
  } catch(error){
    const message=String(error?.message??'');
    return {valid:false,error:/password/i.test(message)?'pdf_password_required':'pdf_parse_failed'};
  }
}

export async function extractPdfOcrText(document,pageNumbers,options={}){
  if(!Buffer.isBuffer(options.pdfBuffer))throw new Error('ocr_pdf_buffer_missing');
  const {createWorker}=await import('tesseract.js');
  const workerOptions=typeof options.ocrLogger==='function'?{logger:options.ocrLogger}:{};
  const worker=await createWorker('eng',1,workerOptions);
  const pages=[];const tempRoot=await mkdtemp(path.join(tmpdir(),'reading-lens-ocr-'));const pdfPath=path.join(tempRoot,'source.pdf');
  try{
    await writeFile(pdfPath,options.pdfBuffer);
    for(const pageNumber of pageNumbers){
      const outputBase=path.join(tempRoot,`page-${pageNumber}`);const imagePath=`${outputBase}.png`;
      await execFileAsync(options.pdftoppmPath??'pdftoppm',['-f',String(pageNumber),'-l',String(pageNumber),'-singlefile','-r','200','-png',pdfPath,outputBase],{windowsHide:true,maxBuffer:1024*1024});
      const result=await worker.recognize(imagePath);const text=normalizeOcrText(result.data.text);
      pages.push({page_number:pageNumber,text,char_count:text.length,source:'ocr'});
    }
  }finally{await worker.terminate().catch(()=>{});await rm(tempRoot,{recursive:true,force:true});}
  return pages;
}

function normalizeOcrText(value){return String(value??'').replace(/-\s*\n\s*/g,'').replace(/[ \t]+\n/g,'\n').replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim();}

export function detectReadingContent(pages) {
  const answerMap=detectAnswers(pages);
  const questions=[];
  let activeType='OTHER';
  for(const page of pages){
    const lines=page.text.split(/\n|(?<=\.)\s+(?=\d{1,3}[.)]\s)/).map(normalizeLine).filter(Boolean);
    let current=null;
    for(const line of lines){
      activeType=typeFromInstruction(line,activeType);
      if(/answer\s*(?:key|sheet)|listening\s+answers/i.test(line))continue;
      const match=line.match(/^(\d{1,3})[.)]?\s+(.{3,})$/);
      if(match&&Number(match[1])<=60&&!looksLikeAnswerPair(match[2])){
        if(current)questions.push(current);
        current={question_number:match[1],question_type:activeType,question:match[2],options:[],correct_answer:answerMap[match[1]]??'',standard_evidence:'',source_page:page.page_number,confidence:'candidate'};
        continue;
      }
      const option=line.match(/^([A-H])[.)]\s+(.{1,})$/);
      if(current&&option){current.options.push(`${option[1]}. ${option[2]}`);continue;}
      if(current&&!/^(Questions?|READING PASSAGE|SECTION)\b/i.test(line)&&current.question.length<1200)current.question+=` ${line}`;
    }
    if(current)questions.push(current);
  }
  const unique=[];const seen=new Set();
  for(const question of questions){const key=question.question_number;if(seen.has(key))continue;seen.add(key);unique.push(question);}
  const passagePages=pages.filter((page)=>isLikelyPassagePage(page.text)).map((page)=>page.page_number);
  return {passage_pages:passagePages,questions:unique.slice(0,60),answer_candidates_found:Object.keys(answerMap).length,requires_confirmation:true};
}

function detectAnswers(pages){
  const answers={};
  for(const page of pages){
    const text=page.text;
    if(!/answers?|answer\s*key/i.test(text))continue;
    for(const match of text.matchAll(/(?:^|\s)(\d{1,3})[.)]?\s+(TRUE|FALSE|NOT GIVEN|YES|NO|[A-H]|[A-Za-z][A-Za-z -]{0,35})(?=\s+\d{1,3}[.)]?\s+|$)/gi)){
      if(Number(match[1])<=60)answers[match[1]]=normalizeLine(match[2]);
    }
  }
  return answers;
}
function isLikelyPassagePage(text){const words=text.split(/\s+/).length;const sentences=(text.match(/[.!?](?:\s|$)/g)??[]).length;return words>=120&&sentences>=4&&!/answer\s*(?:key|sheet)/i.test(text);}
function typeFromInstruction(line,fallback){if(/TRUE.*FALSE.*NOT GIVEN/i.test(line))return'TRUE_FALSE_NOT_GIVEN';if(/YES.*NO.*NOT GIVEN/i.test(line))return'YES_NO_NOT_GIVEN';if(/choose.*(?:correct|letter)|multiple choice/i.test(line))return'MULTIPLE_CHOICE';if(/complete (?:the )?(?:notes|summary|sentences|table|flow-chart)|no more than .* words?/i.test(line))return'FILL_IN_THE_BLANK';if(/match (?:each|the)|matching/i.test(line))return'MATCHING';return fallback;}
function looksLikeAnswerPair(text){return /^(?:TRUE|FALSE|NOT GIVEN|YES|NO|[A-H])(?:\s|$)/i.test(text);}
function normalizeLine(value){return String(value??'').replace(/\s+/g,' ').trim();}

export function validateImportedDiagnosticInput(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {valid:false,error:'input_must_be_object'};
  const documentHash=clean(value.document_hash,64);
  const questionNumber=clean(value.question_number,24);
  if(!/^[a-f0-9]{64}$/.test(documentHash))return {valid:false,error:'invalid_document_hash'};
  if(!questionNumber)return {valid:false,error:'missing_question_number'};
  const fields={passage:clean(value.passage,30000),question_type:clean(value.question_type,80),question:clean(value.question,3000),user_answer:clean(value.user_answer,1000),correct_answer:clean(value.correct_answer,1000),user_evidence:clean(value.user_evidence,5000),standard_evidence:clean(value.standard_evidence,5000),reasoning_process:clean(value.reasoning_process,3000)};
  const missing=Object.entries(fields).filter(([,field])=>!field).map(([key])=>key);if(missing.length)return {valid:false,error:'missing_required_fields',missing_fields:missing};
  return {valid:true,input:{id:`pdf-${documentHash}-${questionNumber}`,question_id:`pdf-${documentHash}-${questionNumber}`,passage:fields.passage,question_type:fields.question_type,question:fields.question,user_answer:fields.user_answer,correct_answer:fields.correct_answer,user_evidence:{quote:fields.user_evidence},standard_evidence:{quote:fields.standard_evidence},reasoning_process:fields.reasoning_process,previous_error_history:[]},provenance:{source:'user_pdf',document_hash:documentHash,question_number:questionNumber}};
}
function clean(value,max){return typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';}

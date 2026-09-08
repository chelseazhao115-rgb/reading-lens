import test from 'node:test';
import assert from 'node:assert/strict';
import { detectReadingContent, extractPdfText, MAX_PDF_BYTES, validateImportedDiagnosticInput, validatePdfUpload } from '../src/pdf-import.js';

const pdfBuffer=Buffer.from('%PDF-1.7 fake fixture');

test('PDF upload validator enforces MIME signature and byte limit',()=>{
  assert.equal(MAX_PDF_BYTES,60*1024*1024);
  assert.equal(validatePdfUpload(pdfBuffer,'application/pdf').valid,true);
  assert.equal(validatePdfUpload(Buffer.from('not a pdf file'),'application/pdf').error,'invalid_pdf_signature');
  assert.equal(validatePdfUpload(pdfBuffer,'text/plain').error,'invalid_pdf_content_type');
});

test('reading PDF detection suggests passage pages questions types options and answer candidates',()=>{
  const prose='Reading passage title. '+('This is a complete sentence about urban transport. '.repeat(35));
  const detected=detectReadingContent([
    {page_number:1,text:prose},
    {page_number:2,text:'Questions 1-2 Choose the correct letter.\n1 Which system was introduced first?\nA. Trams\nB. Buses\n2 What was the main benefit?\nA. Speed\nB. Cost'},
    {page_number:3,text:'Answer key 1 A 2 B'}
  ]);
  assert.deepEqual(detected.passage_pages,[1]);
  assert.equal(detected.questions.length,2);
  assert.equal(detected.questions[0].question_type,'MULTIPLE_CHOICE');
  assert.deepEqual(detected.questions[0].options,['A. Trams','B. Buses']);
  assert.equal(detected.questions[0].correct_answer,'A');
  assert.equal(detected.requires_confirmation,true);
});

test('PDF extraction returns page text and hash without persisting a file',async()=>{
  const fakePdfjs={getDocument(){return{promise:Promise.resolve({
    numPages:2,
    async getPage(pageNumber){return{async getTextContent(){return{items:[{str:`Page ${pageNumber} `},{str:'text '.repeat(30),hasEOL:true}]};},cleanup(){}};}
  })};}};
  const result=await extractPdfText(pdfBuffer,{pdfjs:fakePdfjs});
  assert.equal(result.valid,true);assert.equal(result.value.page_count,2);assert.match(result.value.document_hash,/^[a-f0-9]{64}$/);assert.equal('file_path'in result.value,false);
});

test('scanned or empty PDFs fail closed instead of inventing text',async()=>{
  const fakePdfjs={getDocument(){return{promise:Promise.resolve({numPages:1,async getPage(){return{async getTextContent(){return{items:[]};}};}})};}};
  const result=await extractPdfText(pdfBuffer,{pdfjs:fakePdfjs,ocrExtractor:async()=>[]});assert.equal(result.error,'pdf_text_unavailable');
});

test('scanned PDFs automatically use OCR text before question detection',async()=>{
  const fakePdfjs={getDocument(){return{promise:Promise.resolve({numPages:1,async getPage(){return{async getTextContent(){return{items:[]};}};}})};}};
  const ocrText='Reading Passage. '+('A scanned sentence contains readable English text. '.repeat(12));
  const result=await extractPdfText(pdfBuffer,{pdfjs:fakePdfjs,ocrExtractor:async(_document,pages)=>[{page_number:pages[0],text:ocrText,char_count:ocrText.length,source:'ocr'}]});
  assert.equal(result.valid,true);assert.equal(result.value.extraction_method,'ocr');assert.equal(result.value.ocr_page_count,1);assert.equal(result.value.pages[0].source,'ocr');
});

test('imported diagnosis requires user-confirmed gold and evidence fields',()=>{
  const valid=validateImportedDiagnosticInput({document_hash:'a'.repeat(64),question_number:'1',passage:'The route closes in winter.',question_type:'TRUE_FALSE_NOT_GIVEN',question:'The route stays open.',user_answer:'TRUE',correct_answer:'FALSE',user_evidence:'The route closes in winter.',standard_evidence:'The route closes in winter.',reasoning_process:'I overlooked closes.'});
  assert.equal(valid.valid,true);assert.equal(valid.provenance.source,'user_pdf');
  assert.equal(validateImportedDiagnosticInput({...valid.input,standard_evidence:''}).valid,false);
});

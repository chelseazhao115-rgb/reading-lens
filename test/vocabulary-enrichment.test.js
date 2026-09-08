import test from 'node:test';
import assert from 'node:assert/strict';
import { createVocabularyEnricher, validateVocabularyOutput, validateVocabularyRequest, VOCABULARY_PROMPT_HASH } from '../src/vocabulary-enrichment.js';

const output={headword:'robust',part_of_speech:'adjective',ipa:'/rəʊˈbʌst/',contextual_meaning_zh:'稳健的',simple_definition_en:'strong and reliable',usage_note:'Often describes evidence or methods.'};

test('vocabulary input requires the selected term to occur in its sentence', () => {
  assert.equal(validateVocabularyRequest({term:'robust',sentence:'A robust method.',context:''}).valid,true);
  assert.equal(validateVocabularyRequest({term:'robust',sentence:'A weak method.',context:''}).error,'term_not_in_sentence');
});

test('vocabulary output contract rejects missing or unknown fields', () => {
  assert.equal(validateVocabularyOutput(output).valid,true);
  assert.equal(validateVocabularyOutput({...output,extra:'x'}).error,'unknown_output_field');
  assert.equal(validateVocabularyOutput({...output,ipa:''}).error,'invalid_output_field');
});

test('vocabulary enricher records bounded provider metadata without exposing its key', async () => {
  const enricher=createVocabularyEnricher({apiKey:'secret-test-key',fetchImpl:async(_url,options)=>{
    assert.doesNotMatch(options.body,/secret-test-key/);
    return {ok:true,async json(){return{output_text:JSON.stringify(output),usage:{input_tokens:100,output_tokens:80}};}};
  }});
  const result=await enricher.enrich({term:'robust',sentence:'A robust method.',context:'A robust method.'});
  assert.equal(result.contextual_meaning_zh,'稳健的'); assert.match(result.prompt_hash,/^[a-f0-9]{64}$/); assert.equal(result.prompt_hash,VOCABULARY_PROMPT_HASH); assert.ok(result.model_cost_usd<0.0005);
});

test('vocabulary enricher fails safely when no provider key is configured', async () => {
  const enricher=createVocabularyEnricher(); assert.equal(enricher.available,false);
  await assert.rejects(()=>enricher.enrich({term:'robust',sentence:'A robust method.'}),{code:'vocabulary_provider_unavailable'});
});

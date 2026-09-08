import test from 'node:test';
import assert from 'node:assert/strict';
import { addVocabularyEntry, applyEnrichment, emptyVocabulary, filteredVocabulary, normalizeTerm, updateVocabularyEntry } from '../extension/vocabulary-store.js';

test('vocabulary normalizes duplicates and merges sources before enrichment', () => {
  let state=emptyVocabulary(); const first=addVocabularyEntry(state,{id:'v1',term:'  Sustainable, ',sentence:'A sustainable plan.',workspace_key:'w1',question_number:'2',source_label:'剑雅20 Test 1'});state=first.state;
  const second=addVocabularyEntry(state,{term:'SUSTAINABLE',sentence:'Another context.',workspace_key:'w2',question_number:'5',source_label:'剑雅20 Test 2'});
  assert.equal(normalizeTerm(' Sustainable, '),'sustainable'); assert.equal(second.created,false); assert.equal(second.state.entries.length,1); assert.equal(second.state.entries[0].sources.length,2);
  assert.equal(second.state.entries[0].sources[0].source_label,'剑雅20 Test 1');
});

test('vocabulary enrichment remains editable and filterable by review status', () => {
  let state=addVocabularyEntry(emptyVocabulary(),{id:'v1',term:'robust',sentence:'A robust method.',workspace_key:'w1'}).state;
  state=applyEnrichment(state,'v1',{headword:'robust',contextual_meaning_zh:'稳健的',simple_definition_en:'strong and reliable'});
  state=updateVocabularyEntry(state,'v1',{status:'reviewing',note:'Review Friday',enrichment:{contextual_meaning_zh:'可靠且稳健的'}});
  assert.equal(filteredVocabulary(state,{status:'reviewing',query:'稳健'}).length,1); assert.equal(state.entries[0].note,'Review Friday');
});

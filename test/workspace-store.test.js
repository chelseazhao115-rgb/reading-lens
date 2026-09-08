import test from 'node:test';
import assert from 'node:assert/strict';
import { addHighlight, createTextAnchor, emptyWorkspace, resolveTextAnchor, upsertAnswer, validateWorkspaceBackup, workspaceSummary } from '../extension/workspace-store.js';

test('workspace stores answers and anchors without storing a complete passage', () => {
  const passage='Alpha repeats. Beta decides the answer. Omega.';
  let workspace=emptyWorkspace({sourceUrl:'https://www.idictation.cn/ielts/read/1?utm_source=x',passageHash:'abc',title:'Test'});
  workspace=upsertAnswer(workspace,{question_number:'4',value:'FALSE',completed:true});
  const start=passage.indexOf('Beta decides the answer.'); const anchor=createTextAnchor(passage,start,start+24);
  workspace=addHighlight(workspace,{id:'h1',kind:'evidence',anchor,question_number:'4',note:'decisive sentence'});
  assert.equal(workspace.answers['4'].value,'FALSE'); assert.equal(workspace.passage,undefined);
  assert.deepEqual(resolveTextAnchor(passage,anchor),{resolved:true,start,end:start+24});
  assert.deepEqual(workspaceSummary(workspace),{updated_at:workspace.updated_at,answers:1,highlights:1,notes:1});
});

test('anchor resolution refuses repeated ambiguous text', () => {
  const anchor={exact:'same words',prefix:'',suffix:'',occurrence:0};
  assert.deepEqual(resolveTextAnchor('same words and same words',anchor),{resolved:false,reason:'ambiguous_anchor'});
});

test('workspace backup rejects unsupported shapes', () => {
  assert.equal(validateWorkspaceBackup({schema_version:2,workspaces:{}}).valid,false);
  assert.equal(validateWorkspaceBackup({schema_version:1,workspaces:{a:{}}}).valid,true);
});

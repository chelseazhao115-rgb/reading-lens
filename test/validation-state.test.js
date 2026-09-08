import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseValidationPriority } from '../public/validation-state.js';

test('validation workbench points to the next incomplete evidence gate in order', () => {
  assert.deepEqual(chooseValidationPriority({ diagnosisDone: 10, exerciseDone: 0, retestDone: 0 }), {
    task: 'exercise', number: '0/10', title: '完成微练习独立教师审核',
    detail: '仍有10条待完成；必须先盲答和盲判目标，再进行六维审核。',
    action: '进入微练习审核启动页', href: '/exercise-review-start.html'
  });
  assert.equal(chooseValidationPriority({ diagnosisDone: 10, exerciseDone: 10, retestDone: 0 }).task, 'retest');
  const ready = chooseValidationPriority({ diagnosisDone: 10, exerciseDone: 10, retestDone: 3 });
  assert.equal(ready.task, 'complete');
  assert.match(ready.detail, /Future Improvements/);
});

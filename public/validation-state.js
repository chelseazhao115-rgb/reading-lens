export function chooseValidationPriority({ diagnosisDone, exerciseDone, retestDone }) {
  if (exerciseDone < 10) return { task: 'exercise', number: `${exerciseDone}/10`, title: '完成微练习独立教师审核', detail: `仍有${10 - exerciseDone}条待完成；必须先盲答和盲判目标，再进行六维审核。`, action: '进入微练习审核启动页', href: '/exercise-review-start.html' };
  if (retestDone < 3) return { task: 'retest', number: `${retestDone}/3`, title: '邀请修复后的新用户复测', detail: `仍需${3 - retestDone}名新目标用户；每人必须创建新的匿名事件会话。`, action: '进入用户测试启动页', href: '/usability-start.html' };
  return { task: 'complete', number: 'READY', title: '三天收尾的两项硬门槛已经完成', detail: diagnosisDone < 50 ? `诊断Gold现有${diagnosisDone}/50，可作为探索性试审证据；剩余正式样本进入Future Improvements。` : '诊断Gold也已达到正式指标门槛。', action: '查看评测结果', href: '/evals.html' };
}

export function deriveReviewHandoffState(payload) {
  const progress = payload?.progress ?? {};
  const pilot = payload?.pilot_checkpoint ?? {};
  const cases = Array.isArray(payload?.cases) ? payload.cases : [];
  const total = Number(progress.total) || cases.length || 50;
  const gold = Number(progress.gold_eligible) || 0;
  const nextIndex = cases.findIndex((item) => item.review_status === 'pending' || item.qualification_attested !== true);
  const nextCase = nextIndex >= 0 ? nextIndex + 1 : null;

  if (gold >= total && total > 0) {
    return {
      title: `${total}条独立教师Gold已完成。`,
      status: `当前服务端记录为${gold}/${total}条Gold合格；可以进入评测页复算正式指标。`,
      ctaLabel: '查看已完成的教师Gold',
      href: '/review.html?case=1',
      phaseKicker: 'COMPLETE', phaseTitle: '50条Gold门槛已达到',
      phaseBody: '当前不需要继续招募审核者。先进入评测页复算正式指标，并检查不一致案例。',
      invitationText: '本轮50条独立教师Gold审核已经完成，暂不继续招募新的诊断案例审核者。'
    };
  }

  if (Number(pilot.reviewed) >= Number(pilot.total || 10) && pilot.ready_to_continue !== true) {
    return {
      title: '10条试审已完成，但暂不应继续。',
      status: `试审发现${Number(pilot.sample_issues) || 0}个样本问题；请先完成样本审计，再处理剩余案例。`,
      ctaLabel: '查看试审案例',
      href: '/review.html?case=1',
      phaseKicker: 'PAUSED', phaseTitle: '先处理试审发现的样本问题',
      phaseBody: '不要邀请教师继续剩余40条。先完成样本审计，并确认试审检查点恢复为可继续。',
      invitationText: '当前诊断案例盲审处于暂停状态；试审样本问题解决前不继续招募审核者。'
    };
  }

  if (pilot.ready_to_continue === true && nextCase) {
    const batchEnd = Math.min(total, nextCase + 9);
    return {
      title: `10条试审已通过，继续完成第${nextCase}–${total}条。`,
      status: `当前服务端记录为${gold}/${total}条Gold合格；下一条待审为CASE ${nextCase}。`,
      ctaLabel: `从第${nextCase}条继续`,
      href: `/review.html?case=${nextCase}`,
      phaseKicker: 'CURRENT 10-CASE BATCH', phaseTitle: `本次只完成CASE ${nextCase}–${batchEnd}`,
      phaseBody: `前${nextCase - 1}条已经保存，不要重复审核。完成本批后可以暂停，工作台会自动指向下一条。`,
      invitationText: `你好，我正在验证一个“AI雅思阅读错因诊断教练”。想邀请一位具有雅思阅读教学或教研经验、且未参与案例编写或标签设计的老师，独立盲审当前批次CASE ${nextCase}–${batchEnd}，共${batchEnd - nextCase + 1}条原创合成案例，预计20–30分钟。前${nextCase - 1}条已经完成，不需要重复。页面不会展示作者标签、模型预测或置信度，也不要求姓名、邮箱或学生信息；只需使用teacher-开头的稳定匿名编号。若你愿意参与，我会安排在测试电脑本机或通过屏幕共享完成。`
    };
  }

  const pilotReviewed = Number(pilot.reviewed) || 0;
  return {
    title: '先完成10条试审，再决定是否继续。',
    status: `试审进度${pilotReviewed}/10；系统将从下一条未完成案例继续。`,
    ctaLabel: nextCase ? `继续第${nextCase}条试审` : '开始独立教师试审',
    href: nextCase ? `/review.html?case=${nextCase}` : '/review.html',
    phaseKicker: '03 · 10-CASE PILOT', phaseTitle: '先完成试审检查点',
    phaseBody: '建议预留20–30分钟完成首批10条。完成后先检查样本质量，不自动进入剩余40条。',
    invitationText: '你好，我正在验证一个“AI雅思阅读错因诊断教练”。想邀请一位具有雅思阅读教学或教研经验、且未参与这些案例编写或标签设计的老师，先独立盲审10条原创合成案例，预计20–30分钟。页面不会展示作者标签、模型预测或置信度，也不要求姓名、邮箱或学生信息；只需使用teacher-开头的稳定匿名编号。完成试审后再共同判断样本是否适合继续。'
  };
}

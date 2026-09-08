export function deriveExerciseReviewHandoffState(payload) {
  const progress = payload?.progress ?? {};
  const cases = Array.isArray(payload?.cases) ? payload.cases : [];
  const total = Number(progress.total) || cases.length || 10;
  const reviewed = Number(progress.reviewed_complete) || 0;
  const blinded = Number(progress.blinded_complete) || 0;
  const gold = Number(progress.gold_eligible) || 0;
  const nextIndex = cases.findIndex((item) => item.review_status === 'pending');
  const nextCase = nextIndex >= 0 ? nextIndex + 1 : null;

  if (reviewed >= total && total > 0) {
    return {
      title: `${total}条独立教师审核已完成。`,
      status: `正式准入${gold}/${total}条；教师有效率与两项盲判一致率现在可以从服务端Artifact复算。`,
      ctaLabel: '查看已完成的审核',
      href: '/exercise-review.html'
    };
  }

  if (blinded > 0 || reviewed > 0) {
    return {
      title: `已完成${reviewed}/${total}条，从第${nextCase ?? 1}题继续。`,
      status: `已锁定盲判${blinded}/${total}条，正式准入${gold}/${total}条；未完成全部${total}题前不展示总体比例。`,
      ctaLabel: `继续第${nextCase ?? 1}题`,
      href: `/exercise-review.html${nextCase ? `?case=${nextCase}` : ''}`
    };
  }

  return {
    title: '先盲判，再揭示Gold。',
    status: `当前独立教师审核为0/${total}；第一阶段不会显示内部语义ID、答案、目标错因或练习阶段。`,
    ctaLabel: '开始10题独立盲审',
    href: '/exercise-review.html?case=1'
  };
}

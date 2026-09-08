export function formatReviewSaveConfirmation(savedCase, caseNumber, locale = 'zh-CN') {
  const savedAt = savedCase.reviewed_at
    ? new Intl.DateTimeFormat(locale, {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(savedCase.reviewed_at))
    : '刚刚';
  const paddedCaseNumber = String(caseNumber).padStart(2, '0');
  return `案例${paddedCaseNumber}已保存 · ${savedAt} · 状态：${savedCase.review_status}`;
}

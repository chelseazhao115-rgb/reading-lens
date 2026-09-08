import { loadPortfolioReviews, summarizePortfolioReviews } from './portfolio-review-store.js';

const status = document.querySelector('#case-evidence-status');
const grid = document.querySelector('#case-evidence-grid');
const note = document.querySelector('#case-evidence-note');

try {
  const [evalResponse, diagnosisResponse, exerciseResponse, usabilityResponse] = await Promise.all([
    fetch('/api/eval-results'), fetch('/api/reviews'), fetch('/api/exercise-reviews'), fetch('/api/usability-summary')
  ]);
  if (![evalResponse, diagnosisResponse, exerciseResponse, usabilityResponse].every((response) => response.ok)) throw new Error('evidence_request_failed');
  const [evalData, diagnosisData, exerciseData, usabilityData] = await Promise.all([
    evalResponse.json(), diagnosisResponse.json(), exerciseResponse.json(), usabilityResponse.json()
  ]);
  const portfolioStudy = summarizePortfolioReviews(loadPortfolioReviews());
  renderEvidence(evalData, diagnosisData, exerciseData, usabilityData, portfolioStudy);
} catch {
  status.textContent = '证据状态暂时无法读取。产品体验仍可使用，但本页不会显示缓存或推测结果。';
  status.dataset.state = 'error';
}

function renderEvidence(evalData, diagnosisData, exerciseData, usabilityData, portfolioStudy) {
  const official = evalData.teacher_review.official_metrics;
  status.textContent = official.available
    ? '教师Gold已达到门槛，以下官方结果来自冻结预测与盲审标签。'
    : '首轮真实用户可用性已达到探索性门槛；教师Gold仍不足，因此模型官方指标保持N/A。';
  status.dataset.state = official.available ? 'ready' : 'pending';
  grid.hidden = false;
  grid.replaceChildren(
    evidenceItem(`${diagnosisData.progress.gold_eligible} / 50`, '诊断教师Gold', official.available ? '官方一致率可计算' : `交错试审教师来源 ${diagnosisData.pilot_checkpoint.teacher_attested} / 10`, 'wide'),
    evidenceItem(`${exerciseData.progress.reviewed_complete} / 10`, '微练习教师审核', exerciseData.progress.teacher_validity === null ? '教师有效率N/A' : `通过 ${exerciseData.progress.gold_eligible} / 10 · 教师有效率 ${percent(exerciseData.progress.teacher_validity)} · 盲答一致 ${percent(exerciseData.progress.blind_answer_agreement)} · 目标一致 ${percent(exerciseData.progress.blind_target_agreement)}`),
    evidenceItem(`${usabilityData.sample.eligible_records} / 5`, '首次用户测试', `无帮助完成 ${percent(usabilityData.metrics.unassisted_completion.rate)} · 诊断理解 ${percent(usabilityData.metrics.diagnosis_comprehension.rate)}`),
    evidenceItem(`${usabilityData.metrics.median_completion_time_seconds}s`, '核心路径中位时间', `理解诊断中位 ${usabilityData.metrics.median_diagnosis_comprehension_time_seconds}s · 修复后复测 ${usabilityData.post_fix_retest.eligible_records} / ${usabilityData.post_fix_retest.minimum_sample}`),
    evidenceItem(`${usabilityData.post_fix_retest.eligible_records} / 3`, '修复后新用户复测', postFixDetail(usabilityData.post_fix_retest), 'wide'),
    evidenceItem(`${portfolioStudy.eligible_records} / 5`, '案例理解测试', portfolioStudy.claim_ready ? '探索性理解结果可用' : '汇总指标N/A'),
    evidenceItem(percent(evalData.metrics.evidence_accuracy), '合成Evidence Accuracy', '仅为框架回归基线', 'wide'),
    evidenceItem(percent(evalData.boundary_challenge.unsafe_boundary_diagnosis_rate), '困难边界不安全诊断', `安全拒答 ${percent(evalData.boundary_challenge.abstention_rate)}`),
    evidenceItem(
      evalData.provider_candidate_evidence?.valid
        ? `${percent(evalData.provider_candidate_evidence.v1.metrics.exact_classification_accuracy)} → ${percent(evalData.provider_candidate_evidence.v2.metrics.exact_classification_accuracy)} → ${percent((evalData.provider_candidate_evidence.v3 ?? evalData.provider_candidate_evidence.v2).metrics.exact_classification_accuracy)}`
        : 'N/A',
      'DeepSeek Prompt迭代',
      evalData.provider_candidate_evidence?.valid
        ? `不安全诊断 ${percent(evalData.provider_candidate_evidence.v1.metrics.unsafe_diagnosis_rate)} → ${percent(evalData.provider_candidate_evidence.v2.metrics.unsafe_diagnosis_rate)} → ${percent((evalData.provider_candidate_evidence.v3 ?? evalData.provider_candidate_evidence.v2).metrics.unsafe_diagnosis_rate)} · 未晋级学生端`
        : '候选模型证据不可用',
      'wide'
    ),
    evidenceItem(evalData.teacher_review.prediction_snapshot_integrity.valid ? '通过' : '失败', '预测快照完整性', '防止标签、置信度和版本被修改')
  );
  note.textContent = '合成基线不等于模型效果，教师审核不等于学习提分，首次用户测试不等于长期学习结果。';
}

function postFixDetail(retest) {
  const metrics = retest?.instructional_value_metrics;
  if (!metrics || retest.eligible_records < retest.minimum_sample) return '最小样本未达到，教学价值指标保持N/A';
  return `具体错点 ${percent(metrics.specific_error_understanding_rate)} · 下一步动作 ${percent(metrics.next_action_understanding_rate)} · 练习针对性 ${percent(metrics.practice_relevance_understanding_rate)}`;
}

function evidenceItem(value, label, detail, size = '') {
  const item = document.createElement('div');
  if (size) item.dataset.size = size;
  const strong = document.createElement('strong'); strong.textContent = value;
  const heading = document.createElement('span'); heading.textContent = label;
  const paragraph = document.createElement('p'); paragraph.textContent = detail;
  item.append(strong, heading, paragraph);
  return item;
}

function percent(value) {
  return value === null || value === undefined ? 'N/A' : `${Math.round(value * 100)}%`;
}

const categoryLabels = {
  location: '定位', paraphrase: '同义替换', sentence_comprehension: '句子理解',
  question_strategy: '题型策略', over_inference: '推理越界', insufficient_information: '信息不足'
};

try {
  const response = await fetch('/api/eval-results');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'eval_load_failed');
  render(data);
} catch (error) {
  document.querySelector('#eval-generated').textContent = `评测结果无法加载：${error.message}`;
}

function render(data) {
  document.querySelector('#eval-generated').textContent = `评测生成时间：${new Date(data.generated_at).toLocaleString('zh-CN')} · 数据源：${data.data_source}`;
  metricCards('#framework-metrics', [
    [data.dataset.total, '合成回归样本'],
    [percent(data.metrics.evidence_accuracy), 'Evidence Accuracy'],
    [percent(data.metrics.hallucinated_evidence_rate), 'Hallucinated Evidence'],
    [percent(data.metrics.unsafe_overdiagnosis_rate), 'Unsafe Overdiagnosis'],
    [percent(data.metrics.primary_error_accuracy), '合成分类准确率'],
    [percent(data.metrics.correct_path_accuracy), '正确路径准确率'],
    [percent(data.provider_output_contract.unsafe_acceptance_rate), 'Provider异常接受率']
  ]);
  document.querySelector('#framework-limitation').textContent = data.dataset.limitation;

  const challenge = data.boundary_challenge;
  metricCards('#challenge-metrics', [
    [challenge.total, '困难边界样本'],
    [percent(challenge.exact_classification_accuracy), '精确分类准确率'],
    [percent(challenge.unsafe_boundary_diagnosis_rate), '错误且仍确定诊断'],
    [percent(challenge.abstention_rate), '安全拒答率']
  ]);
  document.querySelector('#challenge-limitation').textContent = challenge.limitation;
  tableRows('#challenge-body', challenge.cases.map((item) => [
    pairLabel(item.boundary_pair), categoryLabels[item.expected], categoryLabels[item.predicted] ?? item.predicted,
    item.status, fixed(item.confidence), item.safe ? '是' : '否'
  ]));

  const teacher = data.teacher_review;
  const official = teacher.official_metrics;
  sourceCards('#official-readiness', [
    [`${teacher.gold_eligible} / 50`, '诊断Gold', teacher.gold_eligible >= 50 ? '已达到官方评测门槛。' : '不足门槛，官方指标保持N/A。'],
    [teacher.prediction_snapshot_integrity.valid ? '通过' : '失败', '预测快照完整性', teacher.prediction_snapshot_integrity.valid ? '标签、置信度和版本未被修改。' : '官方指标已禁用。'],
    [official.available ? '可用' : 'N/A', '官方结果', official.available ? '仅基于教师Gold。' : official.reason_unavailable]
  ]);
  metricCards('#official-metrics', [
    [official.available ? percent(official.primary_error_accuracy) : 'N/A', 'Teacher Agreement'],
    [official.available ? fixed(official.primary_error_macro_f1) : 'N/A', 'Macro F1'],
    [official.available ? official.primary_cases : 'N/A', '一级错因Gold样本'],
    [official.available ? official.abstained_or_special_predictions : 'N/A', '一级Gold上的特殊状态预测']
  ]);
  document.querySelector('#official-message').textContent = official.available
    ? '以下校准与边界结果均来自冻结预测和教师Gold。'
    : '当前不展示校准、混淆矩阵或边界结论，避免把合成标签误当教师结果。';
  if (official.available) {
    renderCalibration(official.confidence_calibration);
    renderBoundaries(official.boundary_pair_report);
  }
  if (data.provider_benchmark) renderProviderBenchmark(data.provider_benchmark);
  if (data.provider_candidate_evidence?.valid) renderProviderCandidate(data.provider_candidate_evidence);

  const exercise = data.exercise_evaluation;
  metricCards('#exercise-eval-metrics', [
    [exercise.structural_validity ? '通过' : '失败', '结构校验'],
    [`${exercise.teacher_review.gold_eligible} / ${exercise.teacher_review.total}`, '教师六维通过'],
    [exercise.teacher_review.teacher_validity === null ? 'N/A' : percent(exercise.teacher_review.teacher_validity), '教师有效率'],
    [`${exercise.teacher_review.blinded_complete} / ${exercise.teacher_review.total}`, '已锁定盲判'],
    [exercise.teacher_review.blind_answer_agreement === null ? 'N/A' : percent(exercise.teacher_review.blind_answer_agreement), '盲答一致率'],
    [exercise.teacher_review.blind_target_agreement === null ? 'N/A' : percent(exercise.teacher_review.blind_target_agreement), '盲判错因一致率']
  ]);
}

function renderProviderCandidate(value) {
  const latest = value.v3 ?? value.v2;
  const latestLabel = value.v3 ? 'v3' : 'v2';
  document.querySelector('#provider-candidate-panel').hidden = false;
  metricCards('#provider-candidate-metrics', [
    [`${percent(value.v1.metrics.exact_classification_accuracy)} → ${percent(value.v2.metrics.exact_classification_accuracy)} → ${percent(latest.metrics.exact_classification_accuracy)}`, '精确分类准确率'],
    [`${percent(value.v1.metrics.unsafe_diagnosis_rate)} → ${percent(value.v2.metrics.unsafe_diagnosis_rate)} → ${percent(latest.metrics.unsafe_diagnosis_rate)}`, '错误且仍确定诊断'],
    [percent(latest.metrics.abstention_rate), `${latestLabel}安全拒答率`],
    [percent(latest.metrics.output_guard_failure_rate), `${latestLabel}契约失败率`],
    [`${fixed(latest.metrics.p95_latency_ms)} ms`, `${latestLabel} P95响应时间`],
    [`$${Number(latest.metrics.total_cost_usd).toFixed(6)}`, `${latestLabel}总调用成本`]
  ]);
  sourceCards('#provider-candidate-checks', [
    [latest.raw_case_artifacts_retained ? '8 / 8' : '否', `${latestLabel}逐条Artifact`, 'smoke通过后才运行剩余7条；可复算每条结果、延迟与成本。'],
    [value.v1.raw_case_artifacts_retained ? '是' : '否', 'v1逐条Artifact', 'v1仅保留审计文档中的汇总，因此证据强度低于v2。'],
    [latest.promotion_gate.eligible_for_promotion ? '通过' : '未通过', '学生端晋级', latest.promotion_gate.reason]
  ]);
  document.querySelector('#provider-candidate-note').textContent = `${value.comparison.interpretation} ${value.dataset.limitation}`;
}

function renderProviderBenchmark(value) {
  document.querySelector('#provider-benchmark-panel').hidden = false;
  metricCards('#provider-benchmark-metrics', [
    [value.provider.id, 'Provider'],
    [percent(value.metrics.exact_classification_accuracy), '困难边界精确分类'],
    [percent(value.metrics.unsafe_diagnosis_rate), '不安全诊断率'],
    [percent(value.metrics.abstention_rate), '拒答率'],
    [`${fixed(value.metrics.p95_latency_ms)} ms`, 'P95响应时间'],
    [`$${Number(value.metrics.total_cost_usd).toFixed(6)}`, '总调用成本']
  ]);
  const checks = value.promotion_gate.checks;
  sourceCards('#provider-promotion-checks', [
    [checks.safety ? '通过' : '失败', '安全不退步', '不安全诊断率不得超过10%。'],
    [checks.quality_improvement ? '通过' : '失败', '分类提升', '精确分类必须高于规则基线12.5%。'],
    [checks.coverage_improvement ? '通过' : '失败', '覆盖提升', '拒答率必须低于规则基线87.5%。'],
    [checks.output_contract ? '通过' : '失败', '输出契约', '不能触发结构化输出安全闸门。'],
    [checks.latency ? '通过' : '失败', '响应延迟', `P95不得超过 ${fixed(value.budget.maximum_p95_latency_ms)} ms。`],
    [checks.budget ? '通过' : '失败', '预算', `总成本不得超过 $${Number(value.budget.maximum_total_cost_usd).toFixed(4)}。`]
  ]);
  document.querySelector('#provider-benchmark-note').textContent = `${value.dataset.limitation} 当前角色：${value.promotion_gate.role}，不会自动切换线上Provider。`;
}

function renderCalibration(value) {
  document.querySelector('#calibration-panel').hidden = false;
  metricCards('#calibration-grid', [
    [fixed(value.expected_calibration_error), 'ECE'],
    [value.high_confidence_cases, '高置信样本'],
    [value.high_confidence_errors, '高置信错误'],
    [value.high_confidence_error_rate === null ? 'N/A' : percent(value.high_confidence_error_rate), '高置信错误率'],
    [value.calibration_warning ? '需降置信' : '未触发', '校准报警']
  ]);
  tableRows('#calibration-body', value.buckets.map((bucket) => [
    bucket.range, bucket.count, fixed(bucket.average_confidence), percentOrNA(bucket.accuracy), fixed(bucket.calibration_gap)
  ]));
}

function renderBoundaries(rows) {
  document.querySelector('#boundary-panel').hidden = false;
  tableRows('#boundary-body', rows.map((item) => [
    item.labels.map((label) => categoryLabels[label]).join(' ↔ '), item.gold_cases, percentOrNA(item.pair_accuracy),
    item.a_to_b, item.b_to_a, percentOrNA(item.cross_confusion_rate), item.outside_pair_error_count
  ]));
}

function metricCards(selector, values) {
  const container = document.querySelector(selector);
  container.replaceChildren(...values.map(([value, label]) => card(value, label)));
}

function sourceCards(selector, values) {
  const container = document.querySelector(selector);
  container.replaceChildren(...values.map(([value, label, detail]) => {
    const item = document.createElement('div');
    const strong = document.createElement('strong'); strong.textContent = value;
    const heading = document.createElement('b'); heading.textContent = label;
    const span = document.createElement('span'); span.textContent = detail;
    item.append(strong, heading, span); return item;
  }));
}

function card(value, label) {
  const item = document.createElement('div');
  const strong = document.createElement('strong'); strong.textContent = value;
  const span = document.createElement('span'); span.textContent = label;
  item.append(strong, span); return item;
}

function tableRows(selector, rows) {
  const body = document.querySelector(selector);
  body.replaceChildren(...rows.map((values) => {
    const row = document.createElement('tr');
    row.append(...values.map((value) => { const cell = document.createElement('td'); cell.textContent = value; return cell; }));
    return row;
  }));
}

function percent(value) { return value === null || value === undefined ? 'N/A' : `${Math.round(value * 100)}%`; }
function percentOrNA(value) { return percent(value); }
function fixed(value) { return value === null || value === undefined ? 'N/A' : Number(value).toFixed(3); }
function pairLabel(value) {
  const [left, right] = value.split('_vs_');
  return `${categoryLabels[left] ?? left} ↔ ${categoryLabels[right] ?? right}`;
}

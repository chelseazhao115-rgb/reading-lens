# Provider离线盲测与回放指南

## DeepSeek两阶段实跑

1. 将根目录`.env.example`复制为`.env`，只在本地设置`DEEPSEEK_API_KEY`；`.env`已被Git忽略。
2. 运行`npm run eval:provider:deepseek:smoke`，只请求第1条边界案例。
3. 检查`evals/results/deepseek-smoke.json`。只有模型版本匹配、输出契约无失败且结果非安全拒答时，剩余命令才会放行。
4. 运行`npm run eval:provider:deepseek:remaining`评测其余7条。

适配器使用DeepSeek官方`https://api.deepseek.com/responses`和`deepseek-v4-flash`。两段硬预算合计0.01美元；429、5xx及空输出最多重试一次，其他错误不重试。结果和日志不包含Key。

目标是在不向产品提供API Key、不自动产生调用费用的情况下，用同一批困难边界比较不同语义模型。

## 1. 生成盲测输入包

```powershell
npm run eval:provider-pack
```

输出`evals/provider-prompt-pack.jsonl`。第一行是manifest，其余8行是case。每条case包含同一版本的system/user messages、Schema路径、Prompt版本和SHA-256哈希，但不包含`gold_primary_error`、期望标签或基线预测。

所有内容都是项目原创合成数据，不包含真实学生信息或未经授权的雅思真题。

## 2. 获得模型输出

可以在已获授权的平台或本地模型中逐条运行case。每条输出必须满足：

- `docs/provider-output-contract.json`静态结构；
- `src/provider-output.js`运行时因果一致性；
- 不修改输入证据；
- 不把Gold标签加入Prompt。

## 3. 整理fixture

```json
{
  "metadata": {
    "provider_id": "candidate-provider",
    "prompt_version": "diagnostic-causal-v1",
    "prompt_hash": "COPY_THE_64_CHARACTER_HASH_FROM_THE_PACK_MANIFEST",
    "model_version": "model-name-or-version"
  },
  "results": [
    {
      "id": "challenge_location_vs_paraphrase_location",
      "output": {
        "status": "diagnosed",
        "primary_error": "location",
        "secondary_error": null,
        "confidence": 0.8,
        "evidence": { "standard_quote_valid": true },
        "decision_trace": {
          "evidence_location": "fail",
          "semantic_mapping": "not_assessed",
          "sentence_understanding": "not_assessed",
          "question_rule": "not_assessed",
          "reasoning_boundary": "not_assessed"
        }
      },
      "latency_ms": 850,
      "cost_usd": 0.0004
    }
  ]
}
```

fixture必须恰好覆盖8个case ID。缺失、重复、未知ID、缺少或非法Prompt哈希、负数成本、负数延迟或非结构化输出都会被拒绝。

## 4. 离线回放

```powershell
node evals/run-provider-benchmark.js --provider=fixture --fixture=PATH_TO_FIXTURE.json --max-cost-usd=0.05 --max-p95-ms=5000
npm run eval
```

第一条命令只读取fixture，不会连接模型服务。第二条命令把最新Provider artifact接入Eval Results页面。

## 5. 发布门槛

候选必须同时满足：

1. 不安全诊断率不高于10%；
2. 精确分类率高于规则参考基线12.5%；
3. 拒答率低于规则参考基线87.5%；
4. 输出安全闸门失败率为0；
5. 总成本不超过显式预算。

通过只代表具备进一步Teacher Gold验证资格，不会自动替换产品Provider，也不代表学习效果已经证明。

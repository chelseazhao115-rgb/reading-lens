# Iteration 001 — Evaluation Foundation and Ambiguity Guard

## Before

- Repository empty; no executable baseline.
- First 12-case project-authored synthetic baseline after scaffolding:
  - Primary error accuracy: 91.7%
  - Macro F1: 93.3%
  - Evidence accuracy: 100%
  - Hallucinated evidence rate: 0%
  - Unsafe overdiagnosis rate: 33.3%
- Failure: an ambiguous pronoun question was diagnosed as `sentence_comprehension` with confidence 0.90.

## Change

- Added deterministic input and exact-quote evidence validators.
- Added fixed causal-chain diagnostic baseline.
- Added confidence/abstention policy.
- Added explicit ambiguous-question gate before learner diagnosis.
- Added 12 synthetic project-authored eval cases and regression tests.
- Eval results are written to `evals/results/latest.json` and clearly labeled synthetic.

## After

- 10/10 automated tests passed.
- 12-case synthetic eval:
  - Primary error accuracy: 100%
  - Macro F1: 100%
  - Evidence accuracy: 100%
  - Hallucinated evidence rate: 0%
  - Unsafe overdiagnosis rate: 0%
- Ambiguous question now returns `ambiguous_question`, requests teacher review and has zero confidence.
- The local web product returns HTTP 200 and the `/api/diagnose` endpoint completed an end-to-end paraphrase diagnosis.
- The UI now supports passage text selection, evidence submission, reasoning input, evidence comparison, diagnosis and abstention/error states.

## Regression Risk

The current dataset is too small and partially aligned with deterministic heuristics. High accuracy is not evidence of real-world model quality. It only establishes an executable safety and evaluation baseline.

## Next

Expand the eval schema and implement a replaceable diagnostic-provider interface so deterministic safety gates remain outside the LLM. Then build the first end-to-end question/evidence/diagnosis flow.

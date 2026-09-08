# Iteration 002 — Provider Boundary and Learning Loop

## Before

- Diagnosis ran directly through one deterministic function without a replaceable provider boundary.
- No micro exercise, transfer question or learner state existed.
- Browser flow ended at diagnosis.
- 10 automated tests; exercise validity not included in eval output.

## Change

- Added `DiagnosticService`, which runs input, evidence and ambiguity gates before any provider call.
- Added provider/model/prompt version metadata to valid provider output.
- Added 10 original exercises: one immediate and one transfer item for each of five primary errors.
- Exercise answers remain server-side until the learner submits an answer.
- Added `/api/exercise/check` and end-to-end Diagnosis → Practice → Transfer flow.
- Added observable learner state, event records and browser persistence.
- Added a manual evidence-paste fallback while preserving exact passage validation.
- Added loading, abstention, request-error and exercise-feedback states.
- Corrected transfer-stage feedback so it does not request another transfer question.
- Visually tested desktop layout and removed a one-character headline orphan.

## After

- 19/19 automated tests pass.
- 12-case project-authored synthetic diagnostic eval remains 100% accuracy and Macro F1; this is still framework evidence only.
- Evidence accuracy: 100% on the small synthetic set.
- Hallucinated evidence rate: 0%.
- Unsafe overdiagnosis rate: 0%.
- Structural micro-exercise validity: 100% across 10 original items.
- Browser test completed the full location-error path with no console errors.
- After immediate and transfer answers, learner report showed 1 diagnosis, 1 micro exercise and 100% transfer accuracy.
- Reload preserved the learner report.
- HTTP test confirmed diagnosis → immediate exercise → transfer question; question payloads did not expose answers.

## Regression

- Diagnostic metrics did not decline on the current dataset.
- The new exercise evaluation checks structure and answer integrity, not instructional quality or difficulty. Teacher review is still missing.
- Browser persistence uses localStorage and is appropriate for the local MVP, not multi-device production use.

## Next

1. Expand to at least 50 independently reviewed cases, emphasizing adjacent-category confusion.
2. Add a real semantic diagnostic provider only after an approved model choice; keep safety gates deterministic.
3. Add feedback fields for where, why and fix without producing long unstructured text.
4. Add funnel calculation from stored events and distinguish demo/eval/real data.

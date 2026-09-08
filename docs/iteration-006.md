# Iteration 006 — Correct Answers and Diagnosis Acceptance

## Before

- The engine assigned an error category even when answer, evidence and reasoning were all correct.
- The result page did not explicitly show Correct or Incorrect.
- Lucky correct answers with wrong evidence were not distinguished.
- Diagnosis acceptance and response telemetry were unavailable.

## Change

- Added deterministic `answer_result` before causal diagnosis.
- Added three paths:
  - correct answer + valid evidence + sound reasoning → `status=correct`, no error and no exercise;
  - correct answer + invalid evidence/reasoning → diagnosed as a lucky correct answer;
  - incorrect answer → explicit incorrect result followed by error diagnosis.
- Added the answer result above evidence comparison.
- Added three permanent correct-path eval cases.
- Added diagnosis accepted/rejected controls.
- Added provider, prompt version, model version, response time and nullable model cost to diagnostic telemetry.
- Added Diagnosis Acceptance Rate to Demo Analytics.

## After

- 38/38 tests pass.
- Correct-path evaluation: 3/3.
- Browser verified a genuinely correct answer produced no exercise.
- Browser verified a correct answer with wrong evidence produced a location diagnosis and exercise.
- Diagnosis feedback controls render with no console errors; automated checks did not impersonate a user vote.
- API returned rule provider, prompt/model versions and measured response time.

## Regression

- Existing 12-case synthetic classification baseline did not regress.
- Correct reasoning is currently inferred by absence of known misconception signals. A semantic provider and teacher-reviewed cases are required before treating this as robust.
- Diagnosis acceptance remains Demo Data until real users provide it.

## Next

- Run a requirement-by-requirement MVP audit.
- Continue teacher review and model-provider decision as the two main external dependencies.


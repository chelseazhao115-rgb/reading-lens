# Iteration 007 — Retry, Help Dependency and Evidence Time

## Before

- An incorrect immediate exercise response still unlocked the transfer question.
- Exercise attempts and hint use were not recorded in the browser learner state.
- `average_evidence_time` existed in the state schema but the product never populated it.

## Change

- Transfer now unlocks only after a correct immediate answer.
- An incorrect immediate answer keeps the learner on the same exercise with a Retry action.
- Added one category-specific method hint for immediate practice; transfer remains unassisted.
- Recorded attempt number and hints used for every exercise submission, then calculated help dependency.
- Measured evidence-submission time and maintained a rolling 50-attempt average.
- Added permanent regression tests and a requirement-by-requirement MVP audit.

## After

- 40/40 tests pass (before: 38/38).
- API verification: incorrect immediate answer returned `next_exercise=null`; correct retry returned a transfer exercise.
- Browser verification: wrong immediate answer kept `TARGETED PRACTICE` visible with a `再次提交` action; a correct retry then exposed `进入迁移题`.
- Synthetic 12-case diagnostic metrics and 10-item structural exercise validation remain unchanged at 100% framework baseline.
- Official teacher metrics remain unavailable because 50/50 review candidates are still pending.

## Regression

- No test or synthetic eval regression.
- Evidence time measures elapsed page time, so it is a useful behavioral proxy but not pure visual-search time.
- Hints are deterministic method prompts and have not yet received teacher quality review.

## Next

- Complete telemetry/data-source semantics that can be verified locally.
- Then prepare a teacher exercise-review pack while waiting for diagnostic Gold review.

# Iteration 008 — Metric Semantics and Exercise Teacher Gate

## Before

- `diagnosis_completed` did not carry provider, prompt/model version, latency and cost metadata.
- Recurring Error Rate and 7-Day Repeat Usage had no executable definition.
- Analytics showed Demo data but did not explicitly expose the three data-source states.
- Micro Exercise Validity was only a structural check and had no teacher-review gate.

## Change

- Bound reproducibility telemetry to every completed diagnosis event.
- Defined recurring error rate as repeat occurrences after the first category occurrence divided by all error diagnoses.
- Defined 7-day repeat usage with an observation guard: less than seven days returns `null`.
- Added Transfer Accuracy, Recurring Error Rate and 7-Day Repeat Usage to Demo Analytics.
- Added explicit Demo / Eval / Real User data provenance.
- Built a 10-item exercise teacher review CSV/JSON pack with six dimensions, integrity-protected import and strict eligibility rules.
- Split structural exercise validity from teacher validity; teacher validity remains `null` until all ten are completely reviewed.

## After

- 48/48 tests pass (before: 40/40).
- All 35 JavaScript files pass `node --check`.
- Browser verified all new metrics and three data-source states render.
- Exercise review pack: 10 valid records, 10 pending, 0 eligible, teacher validity `null`.
- Synthetic diagnostic baseline remains unchanged; official diagnostic Gold remains 0/50.

## Regression

- No automated or synthetic-eval regression.
- Existing local Demo events from older schema versions lack new telemetry; only new diagnosis events are complete.
- A single-browser 7-day metric validates instrumentation, not population retention.

## Next

- Run the exercise teacher review workflow.
- Build a lightweight first-user usability protocol and evidence capture form.
- Continue diagnostic teacher review; only then calibrate confidence and report official agreement.

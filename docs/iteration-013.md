# Iteration 013 — Boundary Diagnostics and Eval Results Page

## Before

- Official teacher metrics had a 5×5 confusion matrix but no direct report for the four pedagogically important adjacent boundaries.
- Eval results were available only in terminal JSON, making data provenance difficult to inspect in a product demo.
- Analytics named Eval Data but did not display the eval artifact.

## Change

- Added four boundary reports: location↔paraphrase, paraphrase↔sentence comprehension, sentence comprehension↔question strategy, and question strategy↔over inference.
- Each report records Gold sample count, pair accuracy, both directional confusions, cross-confusion rate and errors into a third category.
- Added a read-only `/api/eval-results` endpoint backed by the latest reproducible eval artifact.
- Added `/evals.html`, which separates synthetic framework baseline, Teacher Gold official metrics, confidence calibration, boundary reports and exercise quality.
- Calibration and boundary panels remain hidden unless official metrics pass the 50-Gold and snapshot-integrity gates.

## After

- 66/66 tests pass (before: 65/65).
- All 42 JavaScript files pass syntax checks.
- API verified `data_source=eval_artifact`, synthetic origin, Gold 0/50, official unavailable and boundary report `null`.
- Browser verified synthetic and Teacher Gold labels, N/A official values, and hidden calibration/boundary sections.
- No synthetic fixture score is rendered as an official result.

## Regression

- No diagnostic, review, exercise, analytics or usability regression.
- The page reads a generated artifact; after teacher review, `npm run eval` must be rerun to refresh it.
- Boundary metrics are defined but cannot support conclusions until real Gold exists.

## Next

- Build a compact portfolio narrative page linking problem, workflow, safety gates, eval evidence and known limitations.
- Complete teacher and user validation to replace N/A sections with real evidence.
- Use the first real boundary failures to create regression cases before changing rules.


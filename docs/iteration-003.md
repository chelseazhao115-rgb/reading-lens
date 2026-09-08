# Iteration 003 — Explainability and Demo Analytics

## Before

- Diagnosis exposed a category and decision trace, but no concise instructional feedback.
- Events were stored but not converted into a visible funnel.
- Data source was not displayed on an analytics surface.

## Change

- Added fixed `where`, `why` and `fix` feedback for all five primary errors.
- Kept feedback structured and short instead of generating a long chat response.
- Added a separate analytics page with counts and conversion rates.
- Marked the page and state as Demo Data and explicitly disclaimed real-user, model-effect and learning claims.
- Added tests for feedback completeness, funnel arithmetic and zero-denominator handling.
- Browser testing found and corrected an instrumentation bug where pasted evidence was not counted.

## After

- 23 tests passed before the instrumentation regression was added; the final suite is rerun after the fix.
- Browser rendered the location-error explanation and analytics page with no console errors.
- Funnel includes all required stages from question start through transfer completion.
- Evidence submission is now recorded at diagnostic submission for both selection and paste paths.

## Regression

- Feedback is currently category-level, not personalized to fine-grained secondary errors.
- Demo funnel events count repeated page loads as new starts. This is transparent demo behavior, not a user-level production funnel.
- No real-user claims are made.

## Next

- Expand evaluation data with independently reviewed boundary cases.
- Add secondary-error labels and teacher review fields to the eval schema.
- Do not connect a paid model until the product owner approves provider and cost.


# Iteration 004 — Fifty-Case Teacher Review Pipeline

## Before

- Only 12 project-authored synthetic baseline cases existed.
- There was no separate review candidate set.
- Eval output could not show how many cases were teacher approved.
- No controlled CSV review and import workflow existed.

## Change

- Added 50 project-authored synthetic review candidates:
  - 8 `location`
  - 8 `paraphrase`
  - 8 `sentence_comprehension`
  - 8 `question_strategy`
  - 8 `over_inference`
  - 5 `insufficient_information`
  - 3 `ambiguous_question`
  - 2 `data_error`
- Added structural validation for IDs, labels, required fields and standard evidence.
- Added CSV and JSON review-pack export.
- Added CSV round-trip import with validation.
- Added strict Gold eligibility rules requiring approved status, legal reviewer label, reviewer identity and valid review timestamp.
- Added teacher-review status to the main eval report.
- Added a Chinese teacher-review guide.

## After

- 30/30 tests pass.
- Review candidate validation: 50/50 valid.
- Pending: 50.
- Approved: 0.
- Gold eligible: 0.
- Official primary-error accuracy and Macro F1: `null` by design.
- The existing 12-case synthetic baseline remains separate and explicitly labeled framework-only evidence.

## Regression

- No existing diagnostic, exercise or funnel tests regressed.
- Candidate labels are project proposals and may anchor reviewers. Reviewers should judge evidence and reasoning before inspecting the proposed label where practical.
- The review set is balanced by design and therefore does not estimate real-world error prevalence.

## Next

1. Teacher reviews all 50 candidates or marks unsuitable cases for revision.
2. Import the reviewed CSV and rerun eval.
3. Only then calculate teacher agreement and use disagreements to revise the taxonomy decision rules.
4. Model/API integration still requires product-owner approval.


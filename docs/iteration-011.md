# Iteration 011 — Executable Teacher Review and Official Metrics

## Before

- The 10-item exercise review required editing CSV/JSON by hand.
- Exercise review eligibility existed, but there was no browser save workflow or server-side status consistency check.
- Even after 50 diagnostic cases were reviewed, official Accuracy and Macro F1 were hard-coded to remain `null`.

## Change

- Added a browser-based six-dimension exercise review at `/exercise-review.html`.
- Added server persistence, reviewer identity, server timestamp, content-integrity validation and progress tracking.
- Enforced status consistency: approved requires six passes; revision/rejection requires a failed dimension and notes.
- Implemented official teacher metrics after the 50-Gold gate: primary-category Accuracy, Macro F1 and a 5×5 confusion matrix.
- Kept all pending data unavailable and prevented automated review submission.

## After

- 64/64 tests pass (before: 57/57).
- API verified 10 pending exercise cases, 0 eligible, 6 dimensions and teacher validity `null`.
- Browser verified the complete review interface without submitting a teacher judgment.
- A 50-approved regression fixture now proves official metrics become available; a disagreement changes Accuracy and the correct confusion-matrix cell.
- Current real status remains diagnostic 0/50 and exercise 0/10.

## Regression

- No diagnostic, exercise, analytics or usability regression.
- The 50-case fixture exists only inside automated tests and is never saved as reviewed data.
- Current official metrics remain unavailable because no teacher has completed the real review set.

## Next

- Complete the 10 exercise reviews in the browser and revise failed items.
- Start the 50-case blind diagnostic review.
- Add confidence values and calibration reporting to teacher-reviewed diagnostic cases before model-provider comparison.


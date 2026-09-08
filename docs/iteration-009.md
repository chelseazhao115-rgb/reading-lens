# Iteration 009 — First-User Usability Evidence

## Before

- No executable first-user usability protocol existed.
- Real User Data was only an unavailable label on Analytics.
- Completion, evidence-selection success and diagnosis-comprehension definitions were not fixed.
- There was no safe sample threshold preventing premature percentage claims.

## Change

- Added a researcher-facing, anonymous, consent-gated usability recording page.
- Fixed target-user eligibility to Reading 5.5–6.5, IELTS experience and accuracy plateau.
- Added separate task and diagnosis-comprehension timers, observable success fields and blocker codes.
- Added a dedicated storage namespace and JSON export marked `real_user_research`.
- Added a five-eligible-participant claim gate; below threshold all aggregate rates remain `null` / N/A.
- Added obvious email and mainland mobile-number rejection in observer notes, while explicitly requiring manual identity review before export.
- Integrated a separate Real User Research panel into Analytics without mixing records into Demo funnel events.

## After

- 54/54 tests pass (before: 48/48).
- Browser verified the research protocol, consent, timers, blocker checklist and 0-participant N/A state.
- No automated test created or impersonated a real participant record.
- Synthetic and teacher-review eval status did not change.

## Regression

- No test or eval regression.
- Local-only research storage is suitable for a small supervised study, not production multi-user analytics.
- Five participants provide exploratory usability evidence only and cannot prove learning improvement.

## Next

- Add controlled record correction/withdrawal and an audit trail before real sessions begin.
- Conduct at least five eligible first-user sessions.
- Use observed blocker frequencies—not aesthetic preference—to choose the next UX change.


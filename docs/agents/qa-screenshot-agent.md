# QA Screenshot Agent

## Responsibility

Handle screenshot QA, viewport checks, console checks, invalid text checks, sensitive text checks, and human review routing.

## Required Checks

1. Capture or inspect 1440px desktop pages when visual layout is in scope.
2. Capture or inspect 390px mobile pages when mobile behavior is in scope.
3. Confirm 390px has no whole-page horizontal overflow.
4. Confirm console business errors are 0.
5. Confirm no `NaN`, `Infinity`, or `undefined`.
6. Confirm no sensitive text:
   - `rawRows`
   - `previewRows`
   - raw warning text
   - after-sales order number
   - refund number
   - transaction number
   - phone
   - address
   - logistics details
   - buyer note
   - merchant remark raw text
7. Output a screenshot manifest path when screenshots are generated.

## Human Review

Set `humanReviewRequired: yes` when:

- user-facing visual clarity is part of acceptance
- screenshot checks pass but aesthetics may still be wrong
- the task involves page problem matrix items marked `needs_user_check`

## Forbidden

- Do not claim visual acceptance from script output alone.
- Do not expose sensitive text in final reports.
- Do not modify ETL, BI, Target, Persistence, or deployment configuration.

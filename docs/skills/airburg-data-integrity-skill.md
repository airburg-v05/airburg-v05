# Airburg Data Integrity Skill

Use this project skill for ETL/runtime/data consistency tasks.

## Principles

1. ETL only structures data.
2. BI defines metrics.
3. UI must not calculate business metrics.
4. Target must not alter actual values.
5. Real-file reconciliation must remain visible in validation output.

## Required Regression Metrics

When the Tmall real 18-file dataset is in scope, verify:

- GMV
- GSV
- visitors
- paidBuyers
- adSpend
- clicks
- refund amount and count
- search total visitors and buyers
- search product visitors and buyers
- 2026-06-26 to 2026-06-30 coverage

## Runtime Rules

- Append must not replace dataset.
- Search keyword dedup must use date + keyword dimensions.
- Duplicate imports must not double counts.
- Target drafts must not enter runtime dataset.

## Forbidden

- Do not modify UI layout.
- Do not save original files.
- Do not save `rawRows`, `previewRows`, raw warnings, or after-sales sensitive details.

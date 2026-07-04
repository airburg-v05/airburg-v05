# Airburg Regression Skill

Use this project skill for local or public regression after data, UI, target, persistence, or deployment changes.

## Required Real Data Regression

When a full Tmall data regression is required, verify the real 18-file dataset:

- GMV
- GSV
- visitors
- paidBuyers
- adSpend
- clicks
- refund amount
- refund count
- search totals
- date coverage

## Required Metric Regression

Verify:

- 去退费比
- 直接成交占比
- after-sales three-line rates
- Brand / Center resolver
- productId-first for series and product boards
- target isolation
- runtime dataset has no `targets` field

## UI Regression

Verify:

- 390px no horizontal overflow
- console business errors = 0
- no `NaN` / `Infinity` / `undefined`
- no sensitive fields

## Public Regression

For deployed changes, validate public IP routes, not only local routes.

## Git Baseline Sensitive Scan

For Git baseline readiness checks, use:

```bash
npx tsx scripts/private-audit/validate-git-baseline-sensitive-scan-policy-v2.ts
```

The V1 sensitive scan script is retained for historical comparison only. V2 must still hard-block real secrets, private keys, real Excel / CSV files, `private-samples`, and forbidden package / Vercel / storage / tmall / v05 paths, while treating guardrail docs and private-audit negative assertions as safe context.

## Forbidden

- Do not treat screenshots alone as data acceptance.
- Do not treat local PASS as public PASS.
- Do not expose raw files or sensitive fields.

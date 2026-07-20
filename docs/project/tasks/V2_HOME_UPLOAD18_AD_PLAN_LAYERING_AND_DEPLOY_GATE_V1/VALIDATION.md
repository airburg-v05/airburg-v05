# VALIDATION

## Key semantic proof

1. Same-day same-plan plan-level duplicates do not double count.
2. Mixed product-level + plan-level ad files do not double count store or product KPIs.
3. GMV / GSV / visitors / buyers / ad spend / clicks remain unchanged at the authoritative KPI layer.
4. Plan-level rows remain accepted and traceable as source coverage.

## Passed local validators

- `./node_modules/.bin/tsc --noEmit --incremental false --pretty false`
- `npx eslint lib/bi/bi.data-source.ts lib/etl/dedup-engine.ts scripts/private-audit/validate-tmall-plan-level-ad-plan-regression-v1.ts scripts/private-audit/validate-tianmao-v1-refactor-pipeline-v2.ts scripts/private-audit/validate-tmall-real-data-metric-reconciliation-v1.ts scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
- `npm run build`
- `validate-tmall-plan-level-ad-plan-regression-v1`: PASS
- `validate-tianmao-v1-refactor-pipeline-v2`: PASS
- `validate-tmall-real-data-metric-reconciliation-v1`: PASS
- `validate-v2-home-upload18-system-chrome-local-v1`: PASS

## Full lint note

- `npm run lint`: still fails on a pre-existing unrelated file:
  - `scripts/private-audit/validate-v2-home-preview-deployment-current-state-v1.ts:11`
  - rule: `@typescript-eslint/no-explicit-any`
- Existing unrelated warnings also remain in legacy review / mapper files.
- No new lint failure was introduced in the changed files for this task.

## Browser evidence

- System Chrome 18-file local E2E artifact directory:
  - `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-upload18-local-gwgnhz`
- Captured artifacts:
  - `upload-desktop.png`
  - `v2-home-desktop.png`
  - `v2-home-mobile.png`

## Public deployment evidence

- Deployment evidence: `DEPLOYMENT_EVIDENCE_20260720.json`
- Exact implementation commit: `de1a65feafe7f83d678654ccf77d448aa2c71159`
- Immutable package SHA-256: `178810bfe923942db318b66e2ccc421dd8f300cff32ef7d51757c38ceb733145`
- Package entries: `978`; forbidden entries: `0`
- Remote `npm ci`: PASS
- Remote `npm run build`: PASS, 25 routes
- PM2 `airburg-tmall-v1`: online
- Nginx: active and `nginx -t` PASS
- Node binding: `127.0.0.1:3000`
- Public `:3000`: unreachable as required
- Authorized legacy and V2 route regression: HTTP 200
- Public 18-file E2E artifact directory:
  - `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-upload18-local-oZrlE3`
- Public upload result: `18 success / 0 failed / 0 skipped`
- Public `/v2/home`: 17 metric cards; `缺失0 安全跳过0 重复126 不可计算3`
- Browser business console errors: `0`; failed business requests: `0`
- 390px page-wide overflow: `false`

Human gates remain closed: `visualAccepted=false`, `humanAccepted=false`.

## Important observed values

- Upload result: `18 success / 0 failed / 0 skipped`
- `/v2/home` after import:
  - metric cards: `17`
  - data health: `缺失0 安全跳过0 重复126 不可计算3`
- Real-data authoritative reconciliation remains:
  - GMV `125596`
  - GSV `85455.96`
  - Visitors `143076`
  - Paid buyers `128`
  - Ad spend `7625.95`
  - Clicks `6692`
- Plan-level coverage retained separately:
  - row count `101`
  - spend `21036.2`
  - clicks `105124`

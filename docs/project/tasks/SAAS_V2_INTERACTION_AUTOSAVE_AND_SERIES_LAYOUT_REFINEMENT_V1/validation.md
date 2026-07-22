# Validation

Status: PUBLIC_E2E_55_OF_55_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW

Local completed at: 2026-07-22T16:03:07+08:00

Public completed at: 2026-07-22T19:04:56+08:00

## Automated Evidence

- `npx tsx scripts/private-audit/validate-v2-interaction-autosave-and-series-layout-refinement-v1.ts`: PASS, 8/8.
- `npx tsx scripts/private-audit/validate-v2-cross-platform-series-lenses-and-growth-drivers-v1.ts`: PASS, 11/11.
- `npx tsx scripts/private-audit/validate-target-drafts-persistence-v1-local-acceptance.ts`: PASS, including real 18-file ETL, target refresh readback, scope isolation and read-only history/quality boundaries.
- `npx tsc --noEmit --incremental false`: PASS.
- `npm run lint`: PASS with 0 errors; two unrelated pre-existing unused-variable warnings remain.
- `npm run build`: PASS; Next.js generated all 27 static routes.
- `node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`: PASS, 54/54 in a new isolated Chrome profile on a dedicated local port.
- `git diff --check`: PASS.
- Post-authorization gate manifest: PASS; focused interaction source validator: PASS, 8/8; cross-platform compatibility validator: PASS, 11/11.
- Sensitive baseline scan: zero hard blocks, real secrets, real samples, forbidden paths or stale persistence copy. Three reviewed context hits were non-secret and private-audit-only; private-audit scripts are excluded from the runtime package.

## Browser Assertions

- Home metric-card click selected the same chart primary metric and updated `aria-pressed`.
- Auto-save persisted June brand targets, survived refresh, paused/reactivated without value loss, and removed only GMV when GMV was cleared while retaining conversion rate 92.
- Home, Series, Store and Product trend controls displayed `DAY`; no active control displayed `DLY`.
- Custom date remained interactive, was outside the Day/Week/Month segment and had no white or glyph block after Month on desktop or 390 px mobile.
- The visible brand-series breakdown was absent while Brand Summary and Store Drilldown remained operable.
- Two 18-file imports completed with 18 success, 0 failure and 0 skipped for each run; the second store aggregated without cross-store deduplication.
- Console business errors: 0. Failed business network requests: 0. Home and all three decision boards had no page-wide mobile overflow.

## Visual Evidence

- `artifacts/local-browser-final/v2-home-desktop.png`
- `artifacts/local-browser-final/v2-home-mobile.png`
- `artifacts/local-browser-final/v2-target-center-autosave-desktop.png`
- `artifacts/local-browser-final/v2-series-desktop.png`
- `artifacts/local-browser-final/v2-product-manual-desktop.png`
- Machine-readable browser result: `artifacts/local-browser-final/summary.json`

The local and public screenshots were inspected for hierarchy, custom-date residue, target density and series-lens layout. This is technical visual evidence, not owner acceptance.

## Deployment And Public Evidence

- Exact implementation commit: `8c95d8154d463d17216dae14efc74a4b5a800ed4`.
- Active release: `/opt/airburg/releases/saas-v2-interaction-autosave-8c95d81-20260722T185925`.
- Safe archive SHA-256: `3039cecb01d3b6edd8d13e8040c1a31a7105096ace9ce137f1e069274d1e240e`; 518 entries and zero forbidden files.
- Production build: PASS, 27 routes. PM2: online, active cwd matched release. Nginx: active and config-valid. Error log: unchanged.
- All 11 public V2 routes: HTTP 200. Node: loopback-only `127.0.0.1:3000`; public port 3000 remained closed.
- Public isolated browser: PASS, 54 core checks plus one cleanup check, 55/55 total. Both imports were 18 success / 0 failed / 0 skipped; console and failed business requests were zero.
- Public artifacts: `artifacts/public/public-8c95d81-2026-07-22`.
- Full machine-readable proof: `deployment-evidence.json`.
- Final evidence-state validation: gate PASS, focused source 8/8, cross-platform 11/11, JSON and diff checks PASS, sensitive scan PASS with zero findings.

## Evidence Boundaries

- Target persistence is browser-local and brand-namespaced. Cross-device synchronization remains unsupported without a server account and persistence contract.
- No ETL formula, raw fact, runtime dataset schema or target derivation rule was changed.
- Npm still reports one moderate and two high advisories; current exposure remains low based on the existing runtime boundary, but dependency security is not closed.
- `deploymentAuthorized=true`; `VISUAL_ACCEPTED=false` and `HUMAN_ACCEPTED=false` remain in force pending Zongji's public review.

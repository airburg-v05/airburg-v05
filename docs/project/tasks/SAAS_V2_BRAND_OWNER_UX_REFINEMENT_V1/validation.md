# Validation

Status: `IN_PROGRESS`

Planned validation:

- Gate manifest for Airburg data-dashboard work.
- New brand owner UX static validator.
- Existing targeted validators.
- Changed-file ESLint.
- Repo lint.
- Build.
- Local system Chrome isolated-profile 18+4+target.
- Local system Chrome ten-route desktop/mobile + key interaction UX regression.
- Public post-deploy isolated-profile ten-route desktop/mobile + key-click regression.
- Public service checks: PM2, Nginx, loopback 3000, public 3000 closed, log delta.
- Search assets modal UX lock: 390px mobile has no horizontal overflow, content scrolls inside the dialog, header/footer remain fixed/reachable, and the flow edits one group at a time without duplicate group-card titles/actions/chips.
- History/data-health label lock: V2-used upload history and quality components must not expose “安全短码”, English `safe warning code`, `问题 code`, `active dataset`, or `schema` copy in the business UI; labels should read as “批次标识/问题标识/当前数据/数据结构” while preserving the underlying fields for traceability.

Current results:

- Preflight reads: PASS.
- Task archive: created.
- Owner-provided UX audit: recorded in `issue-matrix.md`.
- Gate manifest: PASS via `check_gate_manifest.py`.
- Static validators: PASS
  - `node scripts/private-audit/validate-saas-v2-brand-owner-ux-refinement-v1.mjs`
  - `node scripts/private-audit/validate-saas-v2-full-quality-target-center-closure-v1.mjs`
  - `node scripts/private-audit/validate-v2-layout-copy-truthfulness-v1.mjs`
  - `node scripts/private-audit/validate-v2-board-route-mapping-and-home-empty-cta-v1.mjs`
  - `node scripts/private-audit/validate-v2-search-assets-and-exclusion-contract-boundaries-v1.mjs`
  - `node scripts/private-audit/validate-v2-board-target-and-trend-guards-v1.mjs`
  - `node scripts/private-audit/validate-v2-upload-data-health-embedded-routing-v1.mjs`
  - `node scripts/private-audit/validate-v2-target-center-routing-variant-v1.mjs`
  - `node scripts/private-audit/validate-v2-home-metric-settings-defaults-v1.mjs`
  - `node scripts/private-audit/validate-v2-series-board-runtime-binding-v1.mjs`
  - `node scripts/private-audit/validate-xlsx-security-and-postcss-exposure-v1.mjs`
  - `node scripts/private-audit/validate-v05-sha256-provider-cross-context-v1.mjs`
- Changed-file ESLint: PASS.
- Repo lint: PASS with 0 errors and the two pre-existing warnings:
  - `docs/project/tasks/V2_HOME_VISUAL_DIRECTION_CALIBRATION_AND_CONCEPT_PROTOTYPE_V1/V2_HOME_DIRECTION_A_AESTHETIC_REBASE_V2/prototype/prototype.js:24 height unused`
  - `lib/bi/bi.home-mapper.ts:122 emptyChartSeries unused`
- Build: PASS via `npm run build` on Next.js 16.2.9.
- Target-center focused production diagnostic: PASS.
  - Summary: `artifacts/local/target-diagnostic-production-2026-07-21/summary.json`
  - Screenshots: `artifacts/local/target-diagnostic-production-2026-07-21/target-center-desktop.png`, `artifacts/local/target-diagnostic-production-2026-07-21/upload-target-foundation-desktop.png`
  - Notes: direct-route production mode separated a Next dev-only router initialization warning from actual product behavior; production console/network errors were 0.
- Fresh-build local production 18+4+target: PASS.
  - Summary: `artifacts/local/upload18-4target-final-local-production-2026-07-21/summary.json`
  - Upload: 18 success / 0 failed / 0 skipped.
  - Home: 17 KPI metrics; custom metric subset/order refresh preserved; reset restored 17 metrics; mobile no horizontal overflow.
  - Target foundation: four source files detected and imported from the 18-file directory subset.
  - Target center: percent target created/read back, paused/read back, reactivated/read back; no hard delete; duplicate platform/store label absent.
  - Cleanup: runtime/debug test state cleaned; `/v2/home` returned to empty state with CTA `/v2/upload`.
  - Screenshots: `upload-desktop.png`, `v2-home-desktop.png`, `v2-home-mobile.png`.
- Fresh-build local production ten-route desktop/mobile regression: PASS.
  - Summary: `artifacts/local/ten-route-final-local-production-2026-07-21/summary.json`
  - Scope: 10 desktop routes, 10 mobile routes, 64 checks.
  - Key locks: no forbidden internal copy, no non-V2 links, no horizontal overflow, compact board empty states, search-assets 390x844 modal footer reachable, console/network errors 0.

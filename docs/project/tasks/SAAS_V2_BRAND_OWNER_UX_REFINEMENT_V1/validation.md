# Validation

Status: `PUBLIC_E2E_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW`

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
- Board empty-state CTA lock: `/v2/series-board`, `/v2/store-board`, and `/v2/product-board` no-data states must each expose exactly one primary CTA, `前往数据接入`, and it must link to `/v2/upload`.

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
- Broad UX implementation commit: `f184d9dd0bb90bb36c468fe572a46957b54e0ccf`.
- Final empty-state CTA increment implementation commit: `79a503be3988a66dd22b9c0c789a284223fe7c23`.
- Final Aliyun deployment: PASS.
  - Release: `/opt/airburg/releases/saas-v2-board-cta-79a503b-20260721T005754`
  - Active app path: `/opt/airburg/ecommerce-platform-optimized` resolves to the release above.
  - Rollback PM2 snapshot: `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-board-cta-79a503b-20260721T005754.pm2.json`
  - Release metadata: `.airburg-release.json` records schema `SAAS_UI_V2`, UI version `SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1`, release type `board-empty-state-cta-increment`, and commit `79a503be3988a66dd22b9c0c789a284223fe7c23`.
  - Release source came from `git archive HEAD` at commit `79a503be3988a66dd22b9c0c789a284223fe7c23` to avoid mixing uncommitted evidence files into the deployed source.
  - Rsync exclusions included `.git`, `.vercel`, `node_modules`, `.next`, `private-samples`, Excel/CSV/key files, `.env*`, and `tsconfig.tsbuildinfo`.
  - Remote forbidden-file scan: no `.xls`, `.xlsx`, `.csv`, `.pem`, `.key`, or `.env*` files found in release source.
  - Remote `npm ci`: PASS; only the already-recorded 2 Next/PostCSS moderate findings remain.
  - Remote `npm run build`: PASS; 26 app routes generated.
  - PM2 `airburg-tmall-v1`: online; script args `start -- -H 127.0.0.1`; exec cwd `/opt/airburg/ecommerce-platform-optimized`; Node `24.18.0`.
  - Nginx: active and `nginx -t` PASS.
  - Port checks: `127.0.0.1:3000/v2/home` HTTP 200; port 3000 listens only on `127.0.0.1`; public `http://123.57.49.121:3000/v2/home` timed out.
  - Public ten-route HTTP check: all ten V2 routes returned HTTP 200.
- Public isolated-profile 18+4+target regression: PASS.
  - Command: `V2_HOME_BASE_URL=http://123.57.49.121 V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1/artifacts/public/upload18-4target-final-public-f184d9d-2026-07-21 V2_HOME_PROFILE_DIR=/tmp/airburg-v2-ux-public-upload18-profile-f184d9d-20260721 V2_HOME_CLEANUP_AFTER_REGRESSION=1 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
  - Summary: `artifacts/public/upload18-4target-final-public-f184d9d-2026-07-21/summary.json`
  - Scope note: this full data regression ran on `f184d9dd0bb90bb36c468fe572a46957b54e0ccf`. The later `79a503be3988a66dd22b9c0c789a284223fe7c23` increment changed only three empty-state links and validators; it did not touch upload, ETL, metric formulas, target persistence, or data semantics, so the 18+4+target PASS evidence remains valid and was intentionally not rerun.
  - Upload: 18 success / 0 failed / 0 skipped.
  - Home: 17 KPI metrics; custom metric subset/order refresh preserved; reset restored 17 metrics; mobile no horizontal overflow.
  - Four-source target foundation: four source files detected and imported from the desktop 18-file directory subset.
  - Target center: percent target created/read back, paused/read back, reactivated/read back; no hard delete; duplicate platform/store label absent.
  - Cleanup: isolated-profile runtime/debug test state cleaned; `/v2/home` returned to empty state with CTA `/v2/upload`; target foundation databases were preserved in the isolated profile only to validate target-center readback.
  - Screenshots: `upload-desktop.png`, `v2-home-desktop.png`, `v2-home-mobile.png`.
- Public isolated-profile ten-route desktop/mobile UX regression: PASS.
  - Command: `SAAS_V2_BASE_URL=http://123.57.49.121 SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1/artifacts/public/ten-route-final-public-f184d9d-2026-07-21 SAAS_V2_PROFILE_DIR=/tmp/airburg-v2-ux-public-ten-route-profile-f184d9d-20260721 SAAS_V2_CLEANUP_RUNTIME_DEBUG=1 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Summary: `artifacts/public/ten-route-final-public-f184d9d-2026-07-21/summary.json`
  - Scope: 10 desktop routes, 10 mobile routes, 64 checks.
  - Key locks: no forbidden internal copy, no non-V2 links, no horizontal overflow, compact board empty states, `/v2/exclusion-rules` absent from main nav but direct route reachable as planned-state page, search-assets 390x844 modal footer reachable, console/network errors 0.
  - Cleanup: isolated-profile `airburg-runtime-dataset-v1` and `airburg-debug-context-v1` removed after screenshots; final `/v2/home` empty state and CTA `/v2/upload` confirmed.
- Incremental local board empty-state CTA regression after `79a503b`: PASS.
  - Command: `SAAS_V2_BASE_URL=http://127.0.0.1:3102 SAAS_V2_ROUTE_FILTER=/v2/series-board,/v2/store-board,/v2/product-board SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1/artifacts/local/board-empty-cta-incremental-local-production-2026-07-21 SAAS_V2_PROFILE_DIR=/tmp/airburg-v2-ux-board-cta-local-profile-20260721 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Summary: `artifacts/local/board-empty-cta-incremental-local-production-2026-07-21/summary.json`
  - Result: `/v2/series-board`, `/v2/store-board`, and `/v2/product-board` desktop/390px mobile PASS; each compact empty state has exactly one `前往数据接入` CTA linking to `/v2/upload`; console/network business errors 0.
- Incremental public board empty-state CTA regression after `79a503b`: PASS.
  - HTTP quick check: `/v2/series-board`, `/v2/store-board`, and `/v2/product-board` returned HTTP 200; public `:3000` timed out.
  - Command: `SAAS_V2_BASE_URL=http://123.57.49.121 SAAS_V2_ROUTE_FILTER=/v2/series-board,/v2/store-board,/v2/product-board SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1/artifacts/public/board-empty-cta-incremental-public-79a503b-2026-07-21 SAAS_V2_PROFILE_DIR=/tmp/airburg-v2-ux-board-cta-public-profile-79a503b-20260721 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Summary: `artifacts/public/board-empty-cta-incremental-public-79a503b-2026-07-21/summary.json`
  - Result: `/v2/series-board`, `/v2/store-board`, and `/v2/product-board` desktop/390px mobile PASS; each compact empty state has exactly one `前往数据接入` CTA linking to `/v2/upload`; console/network business errors 0.
- PM2 log delta after final public regression: PASS.
  - Error log bytes: `4175 -> 4175` (`delta=0`).
  - Out log bytes: `6654 -> 6654` (`delta=0`).

Owner acceptance remains pending:

- `visualAccepted=false`
- `humanAccepted=false`
- `PENDING_POST_DEPLOY_OWNER_REVIEW`

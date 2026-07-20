# Validation

Status: `PUBLIC_E2E_PASS_AFTER_XLSX0203_PENDING_POST_DEPLOY_OWNER_REVIEW`

Planned gates:

- Gate manifest for Airburg data-dashboard work.
- Source/contract validators for route truth and target-center semantics.
- Browser validators for ten routes, target-center interactions, desktop/mobile, console/network, and cleanup.
- Changed-file lint.
- Repo lint.
- Build.
- Real 18-file upload regression using system Chrome.
- Public post-deploy route and cleanup regression.

Current results:

- Preflight reads: PASS.
- Intake routing: existing project candidate `ecommerce_platform_optimized`.
- Gate manifest: PASS (`data_dashboard`).
- Xlsx security upgrade validator: PASS.
  - Command: `node scripts/private-audit/validate-xlsx-security-and-postcss-exposure-v1.mjs`
  - Dependency and lockfile now use official SheetJS 0.20.3 CDN tarball: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
  - Import/API compatibility: ESM namespace, ESM default read path, and CommonJS `require("xlsx")` read/write utilities available; package version reports `0.20.3` for namespace/CJS imports.
  - Workbook smoke: generated `.xlsx` buffer/array reads back two test rows with Chinese headers.
  - `npm audit --json` after upgrade: high 0, critical 0, total 2 moderate; xlsx is absent from vulnerabilities.
  - Remaining moderate findings: `next` / `postcss` only. Status: `BLOCKED_BY_UPSTREAM_STABLE_FIX_LOW_CURRENT_EXPOSURE`.
  - Stable-version check: `npm view next version` returned `16.2.10`; `npm view next@16.2.10 dependencies --json` shows `postcss: 8.4.31`, so stable 16.2.10 still does not clear `postcss<8.5.10`.
  - Exposure scan: production roots `app`, `components`, `lib` have no direct `postcss` import/call, user CSS input, dynamic `<style>` stringify, `dangerouslySetInnerHTML`, `cssText`, `insertRule`, or `CSSStyleSheet` constructor exposure.
- Xlsx0203 local validation stack: PASS.
  - Targeted validators: PASS.
    - `node scripts/private-audit/validate-v05-sha256-provider-cross-context-v1.mjs`
    - `node scripts/private-audit/validate-v2-layout-copy-truthfulness-v1.mjs`
    - `node scripts/private-audit/validate-v2-search-assets-and-exclusion-contract-boundaries-v1.mjs`
    - `node scripts/private-audit/validate-v2-target-center-routing-variant-v1.mjs`
    - `node scripts/private-audit/validate-v2-board-route-mapping-and-home-empty-cta-v1.mjs`
    - `node scripts/private-audit/validate-v2-upload-data-health-embedded-routing-v1.mjs`
    - `node scripts/private-audit/validate-v2-board-target-and-trend-guards-v1.mjs`
    - `node scripts/private-audit/validate-v2-home-metric-settings-defaults-v1.mjs`
    - `node scripts/private-audit/validate-v2-series-board-runtime-binding-v1.mjs`
    - `node scripts/private-audit/validate-saas-v2-full-quality-target-center-closure-v1.mjs`
  - Changed-file ESLint: PASS via `npx eslint scripts/private-audit/validate-xlsx-security-and-postcss-exposure-v1.mjs scripts/private-audit/validate-saas-v2-full-quality-target-center-closure-v1.mjs`.
  - Repo lint: PASS with 0 errors and the same 2 pre-existing warnings.
  - Build: PASS; Next 16.2.9 generated 26 app routes.
  - Final same-profile local browser regression: PASS.
    - Upload command: `V2_HOME_PROFILE_DIR=/tmp/airburg-saas-v2-xlsx0203-final-local-profile.* V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-xlsx0203-final-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
    - Ten-route cleanup command: `SAAS_V2_BASE_URL=http://127.0.0.1:3000 SAAS_V2_PROFILE_DIR=/tmp/airburg-saas-v2-xlsx0203-final-local-profile.* SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-xlsx0203-final-2026-07-20 SAAS_V2_CLEANUP_RUNTIME_DEBUG=1 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
    - Result: `18 success / 0 failed / 0 skipped`; V0.5F four-source import PASS; target-center `92%` save/readback/pause/reactivate PASS; ten V2 routes desktop/mobile PASS; console/network business errors 0; cleanup removed runtime/debug and returned `/v2/home` to empty state with CTA `/v2/upload`.
    - Artifact dirs:
      - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-xlsx0203-final-2026-07-20/`
      - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-xlsx0203-final-2026-07-20/`
- Xlsx0203 deployment validation: PASS.
  - Implementation commit: `4812e4db4d3398c2767c6e5449344ec1434f18f0`.
  - Release path: `/opt/airburg/releases/saas-v2-xlsx0203-4812e4d-20260720T234805`.
  - Release metadata: `.airburg-release.json` records schema `SAAS_UI_V2`, UI version `SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1`, release type `xlsx0203-security-continuation`, and commit `4812e4db4d3398c2767c6e5449344ec1434f18f0`.
  - Rsync exclusions included `.git`, `.vercel`, `node_modules`, `.next`, `private-samples`, Excel/CSV/key files, `.env*`, and `tsconfig.tsbuildinfo`.
  - Remote forbidden-file scan after rsync: no `.xls`, `.xlsx`, `.csv`, `.pem`, `.key`, or `.env*` files found in release source.
  - Remote `npm ci`: PASS; audit now reports only 2 moderate vulnerabilities from Next/PostCSS, matching `BLOCKED_BY_UPSTREAM_STABLE_FIX_LOW_CURRENT_EXPOSURE`.
  - Remote `npm run build`: PASS; 26 app routes generated.
  - PM2 `airburg-tmall-v1`: online; active app path resolves to the xlsx0203 release.
  - Nginx: active and `nginx -t` PASS.
  - Port checks: `127.0.0.1:3000/v2/home` HTTP 200; port 3000 listens only on `127.0.0.1`; public `http://123.57.49.121:3000/v2/home` timed out with `AbortError`.
  - Public ten-route HTTP check via Node fetch: all ten V2 routes returned HTTP 200.
- Xlsx0203 public browser regression: PASS.
  - Upload command: `V2_HOME_BASE_URL=http://123.57.49.121 V2_HOME_PROFILE_DIR=/tmp/airburg-saas-v2-xlsx0203-public-profile.* V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-xlsx0203-4812e4d-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
  - Ten-route cleanup command: `SAAS_V2_BASE_URL=http://123.57.49.121 SAAS_V2_PROFILE_DIR=/tmp/airburg-saas-v2-xlsx0203-public-profile.* SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-public-xlsx0203-4812e4d-2026-07-20 SAAS_V2_CLEANUP_RUNTIME_DEBUG=1 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Result: `18 success / 0 failed / 0 skipped`; `/v2/home` 17 metrics while runtime exists; metric subset/order persistence PASS; mobile no-overflow PASS.
  - V0.5F four-source target foundation: PASS on public HTTP IP.
  - Target-center: `92%` target save/readback/pause/reactivate PASS; no hard delete UI; single “平台和店铺” label.
  - Ten V2 routes: desktop/mobile PASS; no forbidden preview/no-write copy; V2 links stay in V2; console/network business errors 0.
  - Post-regression cleanup: removed `airburg-runtime-dataset-v1`, `airburg-debug-context-v1`, and `airburg_tmall_analysis_v2`; preserved `airburg-target-drafts-v1`, `airburg-v05`, and `airburg:demo-session`; refreshed `/v2/home` empty state visible with CTA `/v2/upload`.
  - PM2 log delta from before public regression: error log 0 bytes, out log 0 bytes.
  - Artifact dirs:
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-xlsx0203-4812e4d-2026-07-20/`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-public-xlsx0203-4812e4d-2026-07-20/`
- Static closure validator: PASS.
  - `node scripts/private-audit/validate-saas-v2-full-quality-target-center-closure-v1.mjs`
  - Covers route truth, source matrix, single file-input handlers, native file chooser validator path, runtime/V0.5F split, target freeze/no hard delete, percent input normalization, single “平台和店铺” label, route mapper, search/exclusion business copy, and stale target-agent conflict.
- Real local upload18 + target-center E2E: PASS.
  - Final command: `V2_HOME_PROFILE_DIR=/tmp/airburg-saas-v2-closure-final2-local-profile.1EWdHS V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
  - 18 files from `/Users/zongji/Desktop/每日平台数据/天猫`.
  - Result: `18 success / 0 failed / 0 skipped`.
  - `/v2/home`: 17 metrics visible; metric subset/order persists after refresh; reset restores 17 metrics; mobile no page-wide overflow.
  - Target foundation four-source files, all from the 18-file folder:
    - `【生意参谋平台】商品_全部_2026-06-30_2026-06-30.xls`
    - `商品报表_20260701_160039.csv`
    - `计划报表_20260701_160014.csv`
    - `4051124186_1782897394563_919.xlsx`
  - `/v2/target-center`: runtime-data-without-target-foundation precondition copy visible; four-source import activates V0.5F target foundation; store-scope percent target `92%` saves/readbacks; pause/readback/reactivate passes; no hard delete button; store drawer has exactly one “平台和店铺” label.
  - Persistent screenshot evidence:
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/upload-desktop.png`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/v2-home-desktop.png`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-2026-07-20/v2-home-mobile.png`
- Local ten-route browser regression: PASS.
  - Final command: `SAAS_V2_PROFILE_DIR=/tmp/airburg-saas-v2-closure-final2-local-profile.1EWdHS SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-2026-07-20 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Routes: `/v2/home`, `/v2/series-board`, `/v2/store-board`, `/v2/product-board`, `/v2/upload`, `/v2/upload/history`, `/v2/data-health`, `/v2/target-center`, `/v2/search-assets`, `/v2/exclusion-rules`.
  - Result: desktop and mobile reachable; no page-wide mobile/desktop overflow; no `V2 preview routes only`, `Dataset: preview pending`, or false no-write copy; no business console/network errors.
  - Artifacts: `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-2026-07-20/`.
- Additional local validation commands:
  - `node scripts/private-audit/validate-v05-sha256-provider-cross-context-v1.mjs`: PASS.
    - Shared provider source: `lib/v05/shared/sha256-provider.ts`.
    - Business paths covered: `lib/v05/import/hash.ts`, `lib/v05/migration/hash.ts`.
    - Standard vectors: empty string, `abc`, Unicode `空气堡🌬️`, binary `[00 01 02 03 fe ff]`.
    - Provider equivalence: WebCrypto fast path, forced noble fallback, ArrayBuffer input, and offset Uint8Array input all produced identical SHA-256 hex output.
  - `node scripts/private-audit/validate-v2-layout-copy-truthfulness-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-search-assets-and-exclusion-contract-boundaries-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-target-center-routing-variant-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-board-route-mapping-and-home-empty-cta-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-upload-data-health-embedded-routing-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-board-target-and-trend-guards-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-home-metric-settings-defaults-v1.mjs`: PASS.
  - `node scripts/private-audit/validate-v2-series-board-runtime-binding-v1.mjs`: PASS.
  - Changed-file ESLint: PASS.
  - `npm run lint`: PASS with 0 errors and 2 pre-existing warnings (`prototype.js` unused `height`; `lib/bi/bi.home-mapper.ts` unused `emptyChartSeries`).
  - `npm run build`: PASS; 26 app routes generated.
  - `git diff --check`: PASS.
  - `git diff -- next-env.d.ts`: clean after restoring generated route-reference drift.
- Hash fallback public root-cause evidence:
  - Public URL checked: `http://123.57.49.121/v2/upload`.
  - CDP eval result: `isSecureContext=false`, `hasCrypto=true`, `hasSubtleCrypto=false`, `cryptoKeys=["getRandomValues"]`.
  - Previous public implementation SHA `56a6369`: runtime upload18 reached `18 success / 0 failed / 0 skipped`, then V0.5F four-source import failed waiting for completion.
  - Public/official sources consulted:
    - MDN `Crypto.subtle`: secure-context only.
    - MDN `Window.crypto`: insecure contexts generally only expose `getRandomValues`.
    - `@noble/hashes` README: audited/minimal/tree-shakeable SHA-2 subimport, `@noble/hashes/sha2.js`.
- Hash fallback local post-fix E2E: PASS.
  - Command: `V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-hash-fallback-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
  - Result: `18 success / 0 failed / 0 skipped`; four-source import activates V0.5F target foundation; target-center percent target save/readback/pause/reactivate all pass; console/network business errors: 0.
  - Persistent screenshots:
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-hash-fallback-2026-07-20/upload-desktop.png`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-hash-fallback-2026-07-20/v2-home-desktop.png`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-hash-fallback-2026-07-20/v2-home-mobile.png`
- Hash fallback local ten-route browser regression: PASS.
  - Command: `SAAS_V2_BASE_URL=http://127.0.0.1:3000 SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-hash-fallback-2026-07-20 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
  - Routes: ten V2 routes, desktop and mobile.
  - Result: reachable; no false preview/no-write copy; V2 links stay in V2; no wide overflow; console/network business errors: 0.
  - Artifacts: `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-hash-fallback-2026-07-20/`.
- Homepage runtime/V0.5F source-boundary local validation: PASS.
  - Root cause observed during public cleanup: runtime/debug records and `airburg_tmall_analysis_v2` could be removed while `/v2/home` still displayed metrics from preserved `airburg-v05` target-foundation facts.
  - Source fix: `/v2/home` calls `loadHomeBIDataSource({ includeV05Persistence: false })`; target-center and V0.5F routes keep their default V0.5 persistence access.
  - Static validator: `node scripts/private-audit/validate-saas-v2-full-quality-target-center-closure-v1.mjs`: PASS, including `v2HomeDoesNotFallbackToV05TargetFoundationAfterRuntimeCleanup`.
  - Real local upload18 + target-center E2E:
    - Command: `V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-home-runtime-boundary-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
    - Result: `18 success / 0 failed / 0 skipped`; `/v2/home` 17 metrics while runtime exists; V0.5F four-source foundation import activates target dataset; percent target save/readback/pause/reactivate pass; console/network business errors: 0.
  - Local ten-route + cleanup:
    - Command: `SAAS_V2_BASE_URL=http://127.0.0.1:3000 SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-home-runtime-boundary-2026-07-20 SAAS_V2_CLEANUP_RUNTIME_DEBUG=1 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
    - Result: ten V2 routes desktop/mobile PASS; cleanup PASS; runtime/debug deleted; preserved `airburg-v05`; `/v2/home` returned to empty state with CTA `/v2/upload`.
  - Artifacts:
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-local-home-runtime-boundary-2026-07-20/`
    - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-local-home-runtime-boundary-2026-07-20/`
- Transient validator note:
  - One fresh-profile upload18 run passed 18/18 import, then timed out waiting for `/v2/home` dashboard. A same-profile ten-route check immediately proved `/v2/home` reachable with 17 metrics. The validator route wait was increased from 30s to 60s and the full upload18 E2E passed from a new profile.

Previous bf76 deployment validation: PASS. This section is historical and superseded by the xlsx0203 release evidence above.

- Implementation commit: `bf76c174d12f1bc27b7ca73b9603df4cfa1c8f4a`.
- Release path: `/opt/airburg/releases/saas-v2-home-boundary-bf76c17-20260720T232834`.
- Active path: `/opt/airburg/ecommerce-platform-optimized` resolves to the release path above.
- Release metadata: `.airburg-release.json` records commit `bf76c174d12f1bc27b7ca73b9603df4cfa1c8f4a`, schema `SAAS_UI_V2`, UI version `SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1`.
- Remote `npm ci`: PASS.
  - Historical npm audit output at this earlier bf76 release: 3 vulnerabilities (2 moderate, 1 high). This is superseded by the xlsx0203 release evidence above, where xlsx high/critical findings are gone and only Next/PostCSS moderates remain.
- Remote `npm run build`: PASS; 26 app routes generated.
- PM2: `airburg-tmall-v1` online after restart.
- Nginx: `systemctl is-active nginx` = `active`; `nginx -t` PASS.
- Port checks:
  - Remote `http://127.0.0.1:3000/v2/home`: HTTP 200.
  - Public `http://123.57.49.121/v2/home`: HTTP 200.
  - Public `http://123.57.49.121:3000/v2/home`: not reachable (`curl` timed out, HTTP 000).
  - `ss -ltnp`: port 3000 listens on `127.0.0.1:3000`.

Public upload18 + target-center E2E: PASS.

- Command:
  - `V2_HOME_BASE_URL=http://123.57.49.121 V2_HOME_PROFILE_DIR=/tmp/airburg-saas-v2-bf76c17-public-profile.vUUrKB V2_HOME_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-bf76c17-2026-07-20 node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`
- Result:
  - 18 files from `/Users/zongji/Desktop/每日平台数据/天猫`.
  - `18 success / 0 failed / 0 skipped`.
  - `/v2/home`: 17 metrics visible while runtime data exists.
  - Metric settings: default 17, subset/order persisted after refresh, reset restored 17.
  - Mobile: no page-wide overflow.
  - V0.5F target foundation four-source import: PASS on public HTTP IP after SHA-256 fallback.
  - Target-center: percent target `92%` save/readback/pause/reactivate PASS; no hard delete button; single “平台和店铺” label.
  - Console/network business errors: 0.
- Artifact screenshots:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-bf76c17-2026-07-20/upload-desktop.png`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-bf76c17-2026-07-20/v2-home-desktop.png`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/upload18-public-bf76c17-2026-07-20/v2-home-mobile.png`

Public ten-route + cleanup regression: PASS.

- Command:
  - `SAAS_V2_BASE_URL=http://123.57.49.121 SAAS_V2_PROFILE_DIR=/tmp/airburg-saas-v2-bf76c17-public-profile.vUUrKB SAAS_V2_ARTIFACT_DIR=docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-public-bf76c17-2026-07-20 SAAS_V2_CLEANUP_RUNTIME_DEBUG=1 node scripts/private-audit/validate-saas-v2-ten-route-system-chrome-v1.mjs`
- Routes:
  - `/v2/home`
  - `/v2/series-board`
  - `/v2/store-board`
  - `/v2/product-board`
  - `/v2/upload`
  - `/v2/upload/history`
  - `/v2/data-health`
  - `/v2/target-center`
  - `/v2/search-assets`
  - `/v2/exclusion-rules`
- Result:
  - Desktop and mobile reachable for all ten routes.
  - No page-wide overflow.
  - No false preview/no-write shell copy.
  - Cross-page inspected links stay in `/v2`.
  - Search/exclusion pages show business copy and no mock controls.
  - Console/network business errors: 0.
- Post-regression cleanup:
  - Removed: `airburg-runtime-dataset-v1`, `airburg-debug-context-v1`, `airburg_tmall_analysis_v2`.
  - Preserved: `airburg-target-drafts-v1`, `airburg-v05`, `airburg:demo-session`.
  - Refreshed `/v2/home`: empty state visible and “前往上传” CTA href is `/v2/upload`.
- Artifact summary and screenshots:
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-public-bf76c17-2026-07-20/summary.json`
  - `docs/project/tasks/SAAS_V2_FULL_QUALITY_AND_TARGET_CENTER_CLOSURE_V1/artifacts/ten-route-public-bf76c17-2026-07-20/v2-home-after-runtime-debug-cleanup.png`

Final service/log validation: PASS.

- Public HTTP route checks: all ten V2 routes returned HTTP 200.
- PM2 error log new bytes since before public regression: 0.
- PM2 out log new bytes since before public regression: 0.

Owner review gates still open:

- `visualAccepted=false`
- `humanAccepted=false`
- Status remains `PENDING_POST_DEPLOY_OWNER_REVIEW`.

# Validation

Status: PUBLIC_E2E_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW

## Automated Evidence

- `./node_modules/.bin/tsc --noEmit --incremental false`: PASS.
- `npm run lint`: PASS with zero errors and two pre-existing unused-variable warnings.
- `npm run build`: PASS; all 27 routes generated.
- `npx --yes tsx scripts/private-audit/validate-v2-cross-platform-series-lenses-and-growth-drivers-v1.ts`: PASS, 11/11.
- `npx --yes tsx scripts/private-audit/validate-v2-commercial-dashboard-and-manual-product-refinement-v1.ts`: PASS, 13/13.
- Final offline recheck through the already cached local tsx loader: PASS, 11/11 and 13/13. A separate repeated `npx` wrapper attempt hit sandbox npm-registry DNS `ENOTFOUND`; no validator check ran in that failed wrapper attempt.
- `node scripts/private-audit/validate-v2-home-metric-settings-defaults-v1.mjs`: PASS, 6/6.
- `node --check scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`: PASS.
- `node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`: PASS, 52/52.
- Final browser artifact directory: `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-upload18-local-nLVt5h`.
- `git diff --check`: PASS.

## Browser Proof

- Real sample import remained `18 success / 0 failed / 0 skipped`.
- Home rendered 16 commercial metrics, including total visitors `143,076` and paid buyers `128`; unavailable turnover and regional-fulfillment placeholders were absent.
- Brand-summary series mode covered all connected stores, displayed contribution rows and explicitly withheld store-series target aggregation.
- Single-store series mode retained the scoped series target: actual `34,047`, monthly target `100,000`.
- Store and manual-product target scopes remained correct.
- A second-store append doubled same-range brand GMV from `41,949` to `83,898`.
- Desktop home and series screenshots were inspected after the final run.
- Mobile home, series, store and product pages had no page-wide horizontal overflow.
- Browser console business errors: `0`; failed business requests: `0`.

## Deployment Proof

- Exact deployed implementation commit: `dface84eefdd87a55c819fd323626efb436b19b2`.
- Safe archive SHA-256: `3fd518171661fabb4aeeff313d25af4e3c0b85e7037b297e7796983e2885a884`; 1,461 entries and zero forbidden files.
- Active immutable release: `/opt/airburg/releases/saas-v2-cross-platform-series-dface84-20260722T092433`.
- PM2 `airburg-tmall-v1`: online; process cwd matches the active release; restart count `11`.
- Nginx: active and configuration valid; Node binding is `127.0.0.1:3000`; public port `3000` does not serve the application.
- All 11 public V2 routes returned HTTP `200`.
- Public isolated browser regression at `http://123.57.49.121`: PASS, `52/52`.
- Public browser artifact directory: `/tmp/airburg-v2-public-dface84-20260722`.
- Final PM2 error log remained `4,374` bytes with no post-deploy modification.
- Full machine-readable evidence: `deployment-evidence.json`.

## Validation Limitations

- Two Legacy V1 current-state validators remained non-applicable because they require historical `PAGE_PROBLEM_MATRIX_V2` review entries to be closed. That matrix and `UI_BASELINE_LOCK_V2` are historical Legacy V1 governance sources, not the active SaaS V2 acceptance contract.
- Remote `npm audit` reports one moderate and two high dependency advisories. Current code inspection and a public HTTP 400 check found no active untrusted server-image-processing path, and no user CSS input path exists; this is low-current-exposure evidence, not security closure.

## Evidence Boundary

- This proves exact-commit deployment, runtime health and public technical behavior only.
- It does not prove the new public version is visually or commercially accepted by Zongji.
- The prior owner-approved stable version, tag and immutable release remain available as rollback evidence.

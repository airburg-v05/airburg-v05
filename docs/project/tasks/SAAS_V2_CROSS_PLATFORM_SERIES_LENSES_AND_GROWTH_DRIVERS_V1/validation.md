# Validation

Status: LOCAL_E2E_PASS_PENDING_OWNER_DEPLOY_DECISION

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

## Evidence Boundary

- This is local technical and layout evidence only.
- No deployment, public regression or owner visual acceptance is claimed for the new candidate.
- The current public release remains the owner-approved stable visual baseline.

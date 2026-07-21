# Validation

Status: `LOCAL_VALIDATION_PASS`

## Automated Evidence

- `./node_modules/.bin/tsc --noEmit --incremental false`: PASS.
- `npm run lint`: PASS with zero errors and two pre-existing unused-variable warnings outside this task.
- `npm run build`: PASS; all 27 static routes generated.
- `npx --yes tsx scripts/private-audit/validate-v2-commercial-dashboard-and-manual-product-refinement-v1.ts`: PASS, 13/13.
- `node scripts/private-audit/validate-v2-home-upload18-system-chrome-local-v1.mjs`: PASS, 51/51.
- Final browser artifact directory: `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-upload18-local-tj3hml`.

## Critical Browser Proof

- The real 18-file sample set imported with `18 success / 0 failed / 0 skipped`.
- The home surface rendered 16 visible metrics and no `brandKeywordPaidShare` card.
- Explicit `selectedSeriesId=null` retained brand scope; selected series appeared only as up to five summaries in metric settings.
- The partial-month GMV card used the displayed stage target consistently: actual `125,596`, stage target `50,000`, difference `+75,596`, completion `251.19%`, monthly target `300,000` as secondary context.
- Store, series and manual-product June targets appeared only on matching scope/month boards.
- The second-store append doubled the same-range brand GMV from `41,949` to `83,898`; the append snapshot retained 180 product-metric rows and two stores.
- Desktop series/product screenshots and the mobile home screenshot were inspected; no page-wide overflow or orphan metric card was observed.

## Remaining Gates

- Public deployment and public browser regression: pending.
- Human visual/business acceptance by Zongji: pending.

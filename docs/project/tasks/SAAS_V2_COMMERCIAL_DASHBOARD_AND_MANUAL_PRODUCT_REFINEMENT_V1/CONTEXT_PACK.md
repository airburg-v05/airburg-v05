# Context Pack

## Direct Request

Zongji requested a new SaaS V2 refinement that removes the unsupported brand-keyword paid-share card, makes configured brand/store/series targets visible in the correct period, moves home series selection into metric settings with a maximum of five simultaneously displayed series, restores missing store operating indicators, rebuilds product center as a manual-only product library with square image upload and edit/delete cards, and performs a commercial UI and ecommerce-operator review before deployment.

## Current Truth

- Public baseline: `http://123.57.49.121/v2/home`.
- Deployed runtime-changing commit: `f772af503bcfd29b331798866d9efc2635958bc2`.
- Repository baseline: `dad63e1` on `feature/saas-ui-v2-shell`; working tree was clean before this task.
- Rollback tag: `rollback/saas-v2-pre-commercial-refinement-20260721` at `dad63e1`.
- Preserved server release: `/opt/airburg/releases/saas-v2-board-simplification-f772af5-20260721T190306`.
- Preserved PM2 rollback snapshot: `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-board-simplification-f772af5-20260721T190306.pm2.json`.
- Live browser evidence shows home currently renders 17 cards in a six-column grid and exposes series as a top-level scope switch.
- Live browser evidence shows store and product centers render only six legacy metrics and default to a one-day range.
- Live browser evidence shows the active operating range is June 2026 while target center defaults to July 2026. July targets must not be applied to June actuals.
- Series center currently shows June actuals with no target overlay; target center visibly contains July series targets.
- Product center currently auto-populates all imported products, contrary to the latest manual-only requirement.

## Authority Order

1. Latest direct request from Zongji on 2026-07-21.
2. Current live page evidence and current repository behavior.
3. Metric, target, persistence and runtime contracts in code.
4. `docs/project/PROJECT_SSOT.json` and prior task handoff.
5. Historical summaries, which may be stale where contradicted by current evidence.

## Interpretation

- Home remains brand-scoped. Series selection is a display preference inside metric settings, not a replacement for the brand scope.
- Selected series are shown alongside the brand indicators within the same operating-metrics region, with a hard maximum of five.
- Removing `brandKeywordPaidShare` is a display decision. No missing metric value will be fabricated.
- Store center should reuse the current home metric contract and range-aware target overlay rather than restoring old dense contribution tables.
- Product center should reuse the same concise series-center structure, but only manually configured products may appear in its selector and bottom library.
- A target applies only to the matching calendar month(s). The UI must guide the operator to the active data month instead of silently using the wall-clock month.

## Material Unknowns

- Product images remain browser-local until an account-backed asset service is explicitly designed; cross-device image synchronization is `unknown`.
- Owner visual acceptance was initially unknown; on 2026-07-22 Zongji accepted the deployed refinement as the stable visual baseline.
- JD/Douyin merchant integrations are not proven by the multi-platform data model.

## Owner Gate

The initial gate required `visualAccepted=false` and `humanAccepted=false` after technical and public validation. Zongji explicitly closed the visual-baseline gate on 2026-07-22, so `visualAccepted=true` now applies only to that preserved public baseline; full-product `humanAccepted=false` remains unchanged.

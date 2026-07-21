# Result

Status: `PUBLIC_E2E_PASS_PENDING_POST_DEPLOY_OWNER_REVIEW`

The authorized implementation is deployed and public technical regression is complete at `http://123.57.49.121/v2/home`. Owner visual/business acceptance remains open.

## Implemented Outcome

- `brandKeywordPaidShare` remains in the 17-key truth contract but is removed from the 16-card commercial display.
- Home no longer switches into a series scope. Up to five series are selected in metric settings and rendered below the same metric surface.
- The 16 visible metrics use a balanced four-column desktop and two-column mobile grid.
- Store center uses the complete shared metric and trend surface.
- Product center is manual-only with validated pasted product ID, optional square image, select/edit/delete and bottom cards.
- Brand, store, series and product targets use explicit matching scopes; target center follows the latest operating-data month after data loads.
- Multi-store brand aggregation is verified and no longer silently inherits the first series filter.

## Deployment

- Implementation commit: `e25660c67539bc82405e00e4f354df855e82e05c`.
- Active release: `/opt/airburg/releases/saas-v2-commercial-refinement-e25660c-20260722T003453`.
- Rollback tag: `rollback/saas-v2-pre-commercial-refinement-20260721` at `dad63e1`.
- PM2 rollback snapshot: `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-commercial-refinement-e25660c-20260722T003453.pm2.json`.
- Public regression: 52/52 PASS; technical PASS does not imply owner acceptance.

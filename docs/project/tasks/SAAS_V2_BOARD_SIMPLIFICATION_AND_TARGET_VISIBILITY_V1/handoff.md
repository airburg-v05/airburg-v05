# Handoff

Status: `PENDING_POST_DEPLOY_OWNER_REVIEW`

## Implemented

- Compact series maintenance with pasted product IDs and bottom edit/delete cards.
- Same 17 metrics and MTD/DLY dual-metric trend on home and series center.
- Home series filter exposes at most five manually selected series.
- Compact store/product scope, KPI and trend pages.
- June target contributes truthfully when a selected range crosses into July.

## Deployment

- Public route: `http://123.57.49.121/v2/home`.
- Commit: `f772af503bcfd29b331798866d9efc2635958bc2`.
- Release: `/opt/airburg/releases/saas-v2-board-simplification-f772af5-20260721T190306`.
- Rollback: `/opt/airburg/rollback/airburg-tmall-v1-pre-saas-v2-board-simplification-f772af5-20260721T190306.pm2.json`.
- Public system-browser regression: 46/46 PASS.

## Pending

Keep `PENDING_POST_DEPLOY_OWNER_REVIEW`; do not infer visual acceptance.

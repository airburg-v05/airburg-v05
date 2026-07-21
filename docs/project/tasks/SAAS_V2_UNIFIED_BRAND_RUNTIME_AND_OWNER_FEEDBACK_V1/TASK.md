# Task

Task ID: `SAAS_V2_UNIFIED_BRAND_RUNTIME_AND_OWNER_FEEDBACK_V1`

Status: `LOCAL_VALIDATED_PENDING_DEPLOY`

## Objective

Resolve 宗骥's 2026-07-21 post-deploy review as one product/data-contract repair, not eleven isolated UI patches:

- establish a real multi-brand workspace boundary;
- make one uploaded operating snapshot persist across the home, series, store, product and data-health routes;
- make brand targets independent from a second upload foundation;
- repair home time, comparison and key-series interactions;
- remove stale/demo-data ambiguity and redundant UI.

## Allowed

- SaaS V2 UI, browser-local workspace configuration and safe aggregate persistence.
- Runtime adapters for home/series/store/product/data-health.
- Target-draft persistence and V2 target-center UI.
- Validators, task evidence, local build and isolated-browser regression.
- Existing controlled ECS deployment and public regression after local gates pass.

## Forbidden

- Secrets, tokens, cookies, passwords, private keys or raw browser storage inspection.
- Changing verified metric formulas or adding fake multi-platform adapters.
- Saving raw CSV/XLS/XLSX rows or sensitive after-sales details.
- Push or merge.
- Writing `visualAccepted=true` or `humanAccepted=true` without 宗骥's review.

## Done Criteria

1. A clean browser with no upload shows no operating data.
2. One upload produces one persisted safe aggregate dataset read consistently by five V2 routes.
3. Store and platform filters aggregate all available stores without double counting.
4. Brand workspaces are addable/switchable and their runtime data does not cross brands.
5. Target center opens without data and supports brand-level required monthly targets.
6. Series may exceed five; at most five explicitly selected series appear on home.
7. Custom date, comparison controls and trend layout are interactive and understandable.
8. TypeScript, relevant lint, build, data validators and isolated desktop/mobile browser checks pass.
9. Public deployment, service checks and public browser regression pass before handoff.

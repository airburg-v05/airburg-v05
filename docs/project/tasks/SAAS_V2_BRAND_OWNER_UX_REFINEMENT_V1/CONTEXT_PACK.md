# Context Pack

Task: `SAAS_V2_BRAND_OWNER_UX_REFINEMENT_V1`

Prepared: `2026-07-21T00:00:00+08:00`

## Latest direct request

宗骥要求在数据平台跑完后，以品牌负责人的角度逐页点击，检查瑕疵、使用不顺、是否简洁、无必要文案和点击体验，并根据实际体验优化调整。本轮必须完成审计、实现、验证、部署、公网页面二次逐页体验和证据收口。

## Current authority snapshot

- Repo: `/Users/zongji/Documents/电商数据分析平台/ecommerce-platform-optimized`
- Branch: `feature/saas-ui-v2-shell`
- Current evidence commit at task start: `6e1f8d7fb7961acc2a95847f095754d425948b6f`
- Current deployed implementation commit at task start: `4812e4db4d3398c2767c6e5449344ec1434f18f0`
- Current release at task start: `/opt/airburg/releases/saas-v2-xlsx0203-4812e4d-20260720T234805`
- Public entry: `http://123.57.49.121/v2/home`
- `visualAccepted=false`
- `humanAccepted=false`

## Relevant current truth

- `xlsx` high/critical audit findings are already resolved by official SheetJS 0.20.3 CDN tarball.
- Remaining Next/PostCSS moderate findings stay `BLOCKED_BY_UPSTREAM_STABLE_FIX_LOW_CURRENT_EXPOSURE`.
- Ten V2 routes are currently public E2E PASS after xlsx0203 and runtime cleanup.
- `/v2/upload` runtime 18-file path and V0.5F four-source target foundation are intentionally separate; do not bridge runtime snapshots into `airburg-v05`.
- Target center supports new/edit/pause/reactivate only; no hard delete.
- `/v2/exclusion-rules` is currently a safe blocked route.

## Owner-provided live UX audit evidence

宗骥 has already completed public Chrome ten-page and key-dialog walkthrough and identified the following product-owner issues:

1. Duplicate large workspace/page hero on secondary pages.
2. Series/store/product empty states look like audit documents due blank KPI/trend/table stacks and repeated `--`.
3. Home KPI cards repeat four blank target fields when no target exists.
4. Upload page repeats the same trust/scope information across too many levels.
5. Data health/import history empty states are oversized for a single action.
6. Target center exposes internal `TARGET CENTER`, `V0.5F`, schema/freeze language in the main path.
7. Exclusion rules is unavailable but appears in main nav and exposes internal missing-contract language.
8. Search assets exposes engineering status language and has an overlong modal with unstable footer. Latest 390x844 evidence: `document.scrollHeight=1761`, `scrollWidth=390`, no horizontal overflow but vertical flow is too long; first screen starts with repeated `P1/P2/P300/ZEN` cards; footer actions `取消/清空/保存` are not visible; group title and card title repeat.
9. Series/store/product pages expose defensive audit language in the main UI.
10. Keep restrained white/black/blue visual direction; optimize hierarchy/density/click friction rather than theme.
11. Secondary pages need one compact page title, not three stacked workspace titles.
12. Remove user-visible English dev status, snake_case, route path, schema, mock, and safe issue codes from business UI.
13. Recheck home period/compare/metric settings, upload primary button, search modal, target entry, and nav interactions on desktop and mobile.

## Lead and challenger expectations

Lead `ecommerce_data_platform_lead`:

- Preserve formulas, contracts and deployment evidence.
- Fix shared layout/copy density before page-local patching.
- Do not confuse automated validation with visual/human acceptance.

`brand_product_owner` challenger:

- First screen should answer “what can I do now?” with minimal explanation.
- Main UI should not sound like internal governance.
- Disabled/unavailable areas should either leave the main path or explain a business state briefly.

`senior SaaS UX reviewer` challenger:

- Avoid repeating same page identity in nav, topbar, header and content hero.
- Empty states should be short, action-oriented, and not render inactive data scaffolds.
- Modals need stable footer actions and scrollable content.
- Search configuration should edit one group at a time; header/footer remain fixed and content scrolls inside the dialog.

## Validation approach

- New static UX validator to lock key copy/layout constraints.
- Existing targeted validators to ensure data/target/security boundaries still hold.
- System Chrome isolated-profile local 18+4+target and ten-route regression.
- Public isolated-profile regression after deploy, followed by cleanup of test runtime/debug state.

## Owner gates

- Final public deployment does not equal owner visual acceptance.
- Final status must stay `PENDING_POST_DEPLOY_OWNER_REVIEW`.
- `visualAccepted=false` and `humanAccepted=false` remain until 宗骥 explicitly accepts.

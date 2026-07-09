# Airburg SaaS UI V2 Template Selection Plan

Task: `AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PLAN`

Status: `LOCAL_TEMPLATE_SELECTION_PLAN`

Branch: `feature/saas-ui-v2-shell`

Required next confirmation:

```text
APPROVE_TEMPLATE_SELECTION_V2
```

## 1. Current Design Path

Current path:

```text
product_design_plugin_unavailable
template_first_fallback
```

Confirmed facts:

- Product Design plugin is currently unavailable.
- Product Design prototype was not generated.
- Canva and Figma are not authorized substitutes for Product Design.
- Build Web Apps plugin is currently unavailable and must not be used for implementation.
- Vercel plugin is currently unavailable and must not be used for deploy.
- This stage is documentation only.
- No `/v2` page can be created before `APPROVE_TEMPLATE_SELECTION_V2`.

If Product Design plugin becomes available later, this plan does not automatically authorize prototype generation. A separate user decision is required to return to the Product Design prototype stage.

## 2. Formal Recommendation

Recommended main scheme:

```text
shadcn/ui blocks
+ shadcn-admin layout adaptation
+ Tremor-inspired chart/card semantics
```

Meaning:

- `shadcn/ui blocks` is the primary code and component ownership base.
- `shadcn-admin` is the dashboard-layout adaptation reference.
- Tremor is used for chart/card semantics and dashboard interaction ideas first, not as an immediate dependency.

This recommendation is based on the approved V2 blueprint, Product Design fallback report, license audit, and template preplan.

## 3. Why This Scheme Fits Airburg

Airburg SaaS V2 needs a product workspace, not another patched legacy dashboard. The chosen scheme supports:

- brand cockpit homepage with full 17 KPI grid
- compact scope controls for brand / platform / store / time
- data-dense cards without exposing engineering labels
- consistent list/detail workflows for series, store, product, target, search assets, and exclusion rules
- safe upload and data-health workflows
- future `/v2/*` preview routes while preserving legacy V1 routes

The scheme avoids:

- 5 KPI compression
- `Hidden KPI` chip
- visible `L1/L2/L3/L4`
- visible `Primary/Secondary/Hidden`
- uncontrolled third-party admin shell lock-in
- GPL code contamination
- dependency changes before user approval

## 4. Approved Direct-Code Sources

### shadcn/ui blocks

- license: MIT
- role: primary component and block source
- use mode: `use_code`
- suitable for:
  - layout primitives
  - cards
  - tables
  - forms
  - popovers
  - command/filter controls
  - dashboard block composition
- rule: preserve MIT notice obligations where required.

### shadcn-admin

- license: MIT
- role: dashboard shell and page-flow adaptation reference
- use mode: `use_code`
- suitable for:
  - sidebar / topbar density
  - dashboard workspace shell
  - list and settings flows
  - responsive admin page composition
- rule: adapt patterns into Airburg V2; do not wholesale import Vite app structure.

## 5. Approved Semantic Reference Sources

### Tremor

- license: Apache-2.0
- role: chart/card semantics and analytics interaction reference
- use mode: `needs_user_review`
- suitable for:
  - KPI card density
  - chart interaction patterns
  - data-health summaries
  - dashboard table/card hierarchy
- dependency policy: do not install or import Tremor until a later user-confirmed dependency task.
- current decision: use semantics and visual patterns only.

### TailAdmin React

- license: MIT
- role: admin density and forms/table visual reference
- use mode: `visual_reference_only`
- suitable for:
  - upload
  - data-health
  - target center
  - exclusion rules
- dependency policy: no dependency addition in this stage.

### Flowbite React Admin Dashboard

- license: MIT
- role: upload/data-health workflow visual reference
- use mode: `visual_reference_only`
- suitable for:
  - upload status
  - issue summary
  - safe table/drawer patterns
  - data-health operational views
- dependency policy: no Flowbite dependency unless explicitly confirmed later.

### Material Tailwind Dashboard React

- license: MIT
- role: polished card and nav visual reference only
- use mode: `visual_reference_only`
- suitable for:
  - card polish inspiration
  - spacing rhythm reference
  - chart-region visual comparison
- risk: Material visual language may not match the quieter Airburg operations product.

## 6. Rejected Direct-Code Sources

### GPL visual reference case - Chingu Admin Dashboard

- license: GPL-3.0
- direct code use: rejected
- allowed use: visual_reference_only
- rule:

```text
Do not copy GPL code into Airburg SaaS V2.
```

## 7. Dependency Decision

This template selection plan does not authorize dependency changes.

Current decision:

```text
NO_NEW_DEPENDENCIES_IN_THIS_STAGE
```

Future dependency candidates requiring user confirmation:

- Tremor
- Flowbite / Flowbite React
- Material Tailwind
- any new chart library
- any new table library
- any new drag/sort package

Required marker for future dependency work:

```text
requires_user_confirmation
```

## 8. Route-Level Template Mapping

| V2 route | selected structure | primary source | secondary reference | implementation stance |
|---|---|---|---|---|
| `/v2/home` | Brand cockpit, compact control bar, scope bar, full 17 KPI grid, key series GSV strip, MTD/DLY chart, anomaly panel | shadcn/ui blocks | shadcn-admin shell + Tremor semantics | implement after approval without compressing KPI |
| `/v2/series-board` | Series center with series list, create/edit flow, product ID maintenance, KPI grid, product contribution, search/trend panels | shadcn-admin layout adaptation | shadcn/ui cards/tables | keep productId-first; no all-runtime auto-series |
| `/v2/store-board` | Store operating center with store selector/list, store KPI, comparison, target entry, contribution panels | shadcn-admin layout adaptation | TailAdmin visual reference | store scope = platform + brand + store |
| `/v2/product-board` | Manual followed product list, product KPI, trend, search, after-sales, exclusion hint, safe empty state | shadcn/ui blocks | shadcn-admin list/detail pattern | no “所有宝贝”; productId-first only |
| `/v2/upload` | Platform selector, automatic recognition upload, standard template fallback, success/failed/skipped, safe issue code | shadcn/ui forms/tables | TailAdmin + Flowbite visual reference | do not show rawRows / previewRows / warning text |
| `/v2/data-health` | Coverage calendar, source coverage, missing reports, duplicate upload, skipped files, non-computable metrics | shadcn/ui blocks | Tremor semantics + Flowbite workflow reference | read-only safe summaries |
| `/v2/target-center` | Scope selector, required target inputs, derived target readouts, unsupported collapsed notes | shadcn/ui forms/dialogs | shadcn-admin settings pattern | no target formula change; no target in runtime |
| `/v2/search-assets` | Brand aliases, center-word groups, category words, series/product keyword comparison, brand-word paid share | shadcn/ui tables/forms | shadcn-admin list/detail pattern | do not expose resolver internals |
| `/v2/exclusion-rules` | Product ID exclusion, multi-text exclusion, source capability status, unsupported-field explanation | shadcn/ui forms/tables | Flowbite workflow reference | no persistence schema change |

## 9. Page Structure Rules For Implementation

Global V2 shell:

- left navigation or compact workspace nav can be adapted from shadcn-admin
- top scope control remains compact
- content pages use data-dense cards and tables
- mobile responsive behavior must be designed per page

Forbidden visible labels:

- `L1/L2/L3/L4`
- `Primary/Secondary/Hidden`
- `Hidden KPI`
- `IA`
- `StoreRecord`
- `ProductRecord`
- `TrackedProductRecord`

KPI rules:

- `/v2/home` default preserves 17 KPI grid.
- Derived KPI cards remain visible unless the user later approves a metric visibility preference feature.
- Unsupported target input does not hide the KPI card.
- Missing values display `--`, not `0`.
- UI must not calculate metrics.

Target rules:

- required targets: input
- derived targets: display only
- unsupported targets: hidden or collapsed explanation
- targets affect only target, delta, completion, and progress display
- targets never change true BI actuals

Upload/data safety rules:

- no raw rows
- no `rawRows`
- no `previewRows`
- no warning原文
- no after-sales sensitive details
- safe issue code only

## 10. Implementation Readiness After Approval

After `APPROVE_TEMPLATE_SELECTION_V2`, the next allowed task is:

```text
CREATE_AIRBURG_SAAS_UI_V2_SHELL
```

That task may create:

- `app/(workspace-v2)/**`
- `components/saas-v2/**`

But it still must not:

- modify legacy V1 routes
- change ETL
- change BI formulas
- change Target formulas
- change runtime append
- change search dedup
- change Brand/Center semantics
- change Persistence schema
- deploy without a later `APPROVE_DEPLOY_V2_PREVIEW`

## 11. Known Risks

1. Product Design prototype is still absent.
2. Template-first fallback reduces interruption but does not replace professional design review.
3. shadcn-admin is Vite-oriented, so later implementation must adapt patterns to Next.js App Router.
4. Tremor dependency is not approved; implementation should first reproduce compatible semantics with existing stack unless user approves dependency changes.
5. Visual consistency must be validated by screenshots and user human review after actual UI shell work.

## 12. Final Selection Decision

Formal selected path:

```text
template_first_fallback
```

Formal selected template strategy:

```text
shadcn/ui blocks
+ shadcn-admin layout adaptation
+ Tremor-inspired chart/card semantics
```

Direct code allowed after approval:

```text
shadcn/ui blocks
shadcn-admin MIT patterns
```

Reference only:

```text
Tremor semantics until dependency approval
TailAdmin React visual reference
Flowbite React Admin Dashboard visual reference
Material Tailwind Dashboard React visual reference
GPL templates visual reference only
```

Stop condition:

```text
Do not implement until APPROVE_TEMPLATE_SELECTION_V2.
```

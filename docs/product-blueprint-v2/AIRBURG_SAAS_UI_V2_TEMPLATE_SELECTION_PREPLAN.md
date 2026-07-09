# Airburg SaaS UI V2 Template Selection Preplan

Task: `AIRBURG_SAAS_UI_V2_AUTONOMOUS_PLUGIN_INSTALL_AND_DESIGN_PACKAGE_V1`

Status: `PREPLAN_ONLY`

Recommended design path:

```text
template_first_fallback
```

This is not the final template choice. Final selection still requires a separate task and confirmation:

```text
AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PLAN
APPROVE_TEMPLATE_SELECTION_V2
```

## Recommended Main Scheme

Use `shadcn/ui blocks` as the primary code ownership base, with `shadcn-admin` as a dashboard-layout reference and Tremor as chart/card semantic reference.

Why:

- closest fit to the blueprint's Next.js + Tailwind + component ownership direction
- avoids locking Airburg into a large third-party admin framework
- supports data-dense operating dashboards without returning to the V1 patch stack
- keeps 17 KPI grid visibility possible

## Backup Schemes

1. `TailAdmin React` as a visual reference for admin shell density, forms, and tables.
2. `Flowbite React Admin Dashboard` as a visual reference for upload/data-health workflows.
3. `Material Tailwind Dashboard React` as a visual reference for polished cards, but not as the visual identity default.
4. GPL templates as anti-pattern or visual reference only. Do not copy code.

## Page Mapping

| route | suggested structure | candidate source | copy policy | dependency note |
|---|---|---|---|---|
| `/v2/home` | brand cockpit shell, compact controls, 17 KPI grid, key-series GSV strip, MTD/DLY chart region, data anomaly panel | shadcn/ui blocks + shadcn-admin + Tremor visual semantics | shadcn MIT code can be adapted; Tremor semantics only until dependency approval | `requires_user_confirmation` if adding Tremor |
| `/v2/series-board` | series list, series cards, product ID maintenance, series KPI grid, contribution table, search/trend panels | shadcn-admin + shadcn/ui blocks | MIT code can be adapted | avoid new dependencies unless approved |
| `/v2/store-board` | store selector/list, store KPI grid, store comparison, store target entry, series/product contribution | shadcn-admin + TailAdmin visual reference | shadcn/admin MIT code can be adapted; TailAdmin primarily visual reference | no package change in this stage |
| `/v2/product-board` | manually followed product list, selected-product KPI, product trend, product search, after-sales panel, safe empty state | shadcn/ui blocks + shadcn-admin | MIT code can be adapted | do not restore all-products view |
| `/v2/upload` | platform selector, automatic upload, standard template fallback, success/failed/skipped summary, safe issue code panel | TailAdmin + Flowbite visual reference + shadcn form/table blocks | use shadcn code; TailAdmin/Flowbite visual reference unless dependency approved | no Flowbite dependency without approval |
| `/v2/data-health` | data coverage calendar, source coverage summary, duplicate upload, missing reports, non-computable metrics, safe issue code | Flowbite visual reference + Tremor-inspired analytics blocks | visual reference first | `requires_user_confirmation` for Tremor/Flowbite |
| `/v2/target-center` | scope selector, required target inputs, derived target readouts, unsupported collapsed explanation, target recovery status | shadcn/ui forms + shadcn-admin settings pattern | shadcn MIT code can be adapted | no target formula change |
| `/v2/search-assets` | brand aliases, center-word groups, category words, series/product keyword comparison, brand paid-share cards | shadcn/ui blocks + shadcn-admin list/table pattern | shadcn MIT code can be adapted | no resolver logic change |
| `/v2/exclusion-rules` | product ID exclusion, multi-text exclusion, source capability status, unsupported-field explanation | shadcn/ui forms/table blocks + Flowbite visual reference | shadcn MIT code can be adapted; Flowbite visual reference | no persistence schema change |

## What Can Be Copied

- MIT shadcn/ui blocks and shadcn-admin code can be adapted after the final template selection approval.
- MIT TailAdmin, Flowbite React Admin Dashboard, and Material Tailwind examples can be copied only after explicit user approval and dependency review.
- Apache-2.0 Tremor patterns can be used after notice/dependency review and user approval.

## What Is Visual Reference Only

- GPL templates.
- Commercial pages without explicit reuse rights.
- TailAdmin/Flowbite/Material Tailwind if their dependency stack would force a package change before approval.

## Dependencies

This preplan does not require dependency changes.

Any future dependency addition is:

```text
requires_user_confirmation
```

## Mapping To Product Blueprint

- Preserves `/v2/*` preview route strategy.
- Preserves full 17-metric home grid.
- Preserves V1 legacy routes.
- Preserves target required / derived / unsupported separation.
- Preserves upload safe `success / failed / skipped` status language.
- Preserves data-health safe summary boundary.

## Not Suitable For Airburg

- Templates that force 5 KPI dashboard compression.
- Templates that expose engineering labels such as `L1/L2/L3/L4`, `Primary/Secondary/Hidden`, or `Hidden KPI`.
- Templates that require GPL code copying.
- Templates that require a large UI dependency shift before user confirmation.
- Templates that turn `/v2/home` into a store-only or series-only page.

## Next Step

This design package can move to user review. Continue only after:

```text
APPROVE_DESIGN_PACKAGE_V2
```

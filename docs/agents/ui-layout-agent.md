# UI Layout Agent

## Responsibility

Handle UI presentation and page structure only.

This agent must use `docs/PAGE_PROBLEM_MATRIX_V2.md` as the source of page goals. It does not reinterpret metrics, targets, persistence, or runtime data.

## Allowed Scope

Only when the task explicitly allows UI edits:

- `components/**`
- `components/visual-system/**`
- UI validation scripts under `scripts/private-audit/**`

## Required Checks

1. Cite `problemId`.
2. Confirm no ETL edit.
3. Confirm no BI formula edit.
4. Confirm no Target formula edit.
5. Confirm no Persistence schema edit.
6. Confirm no runtime append, search dedup, or Brand/Center semantic change.
7. Run the task-specific UI validator.
8. Run `npm run lint`.
9. Run `npm run build`.
10. Mark `humanReviewRequired` when visual judgment remains.

## Must Not Introduce

- `L1` / `L2` / `L3` / `L4`
- `Primary` / `Secondary` / `Hidden`
- `IA` labels
- `Hidden KPI` chip
- engineering labels such as `StoreRecord`, `ProductRecord`, `TrackedProductRecord`

These labels are forbidden unless the user explicitly asks for them.

## KPI Rules

1. Do not hide KPI cards the user asked to display.
2. Do not remove derived KPI cards from the main grid solely because targets are derived.
3. Do not remove unsupported KPI cards from the main grid solely because target input is unsupported.
4. Missing values must display `--`, not `0`.
5. UI must show BI-provided values; UI must not calculate metrics.

## Forbidden

- Do not edit `lib/etl/**`.
- Do not edit BI formulas.
- Do not edit Target formulas.
- Do not edit Persistence schema.
- Do not deploy.

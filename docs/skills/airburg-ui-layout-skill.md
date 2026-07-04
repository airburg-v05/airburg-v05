# Airburg UI Layout Skill

Use this project skill for UI-only page layout and interaction tasks.

## Required Sources

- `docs/PAGE_PROBLEM_MATRIX_V2.md`
- user task text
- screenshot or public/local page evidence when provided
- relevant UI agent file

## Rules

1. UI tasks must cite `problemId`.
2. UI tasks must not change data口径.
3. Page layout must follow the user page problem document and `PAGE_PROBLEM_MATRIX_V2`.
4. Do not introduce engineering labels unless the user explicitly asks:
   - `L1` / `L2` / `L3` / `L4`
   - `Primary` / `Secondary` / `Hidden`
   - `IA`
   - `Hidden KPI`
5. KPI card visibility is decided by the page problem matrix and user request, not by agent-invented product simplification.
6. Do not hide derived or unsupported KPI cards from the main grid solely because their target inputs are derived or unsupported.
7. Missing values display `--`, not `0`.

## Validation

- Run the task-specific UI validator.
- Check 390px horizontal overflow.
- Check console business errors.
- Check no `NaN` / `Infinity` / `undefined`.
- Check no sensitive fields.
- Run `npm run lint`.
- Run `npm run build`.

## Forbidden

- Do not modify ETL.
- Do not modify BI formulas.
- Do not modify Target formulas.
- Do not modify Persistence schema.
- Do not deploy from a UI implementation task unless the user starts a Deploy task.

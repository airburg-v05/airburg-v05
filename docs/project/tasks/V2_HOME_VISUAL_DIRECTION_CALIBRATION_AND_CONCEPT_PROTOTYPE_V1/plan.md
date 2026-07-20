# V2 Home Visual Direction Calibration And Concept Prototype V1

## Goal

Use the current data and metric contracts to compare three genuinely different visual systems before production code changes. The purpose is faster operating judgment and a coherent Airburg product identity, not decoration.

## Scope

- Active route: `/v2/home` only.
- Output type: concept prototype and review evidence.
- Data: masked demonstration values; no raw merchant or buyer data.
- Runtime status remains `PREVIEW_DEPLOYED_PENDING_HUMAN_REVIEW`.
- Visual status remains `visualAccepted=false`, `humanAccepted=false`, `humanReviewRequired=true`.

## Steps And Gates

| Step | Action | Output | Pass condition |
|---|---|---|---|
| 1 | Lock evidence and business questions | gate manifest and contract | gate checker PASS |
| 2 | Define three visual systems | direction and token specifications | materially different but contract-compatible |
| 3 | Build one comparable review surface | interactive desktop/mobile concept board | all directions use the same labels and values |
| 4 | Validate design states | screenshots and validation report | 17 KPI, `--`, responsive, safety, interaction PASS |
| 5 | Human selection | handoff | owner chooses A, B, C, or rejects all |

## Execution Status

| Step | Status | Evidence |
|---|---|---|
| 1 | complete | `gate-manifest.json`, gate checker PASS |
| 2 | complete | `concept-directions.json` |
| 3 | complete | interactive three-direction review surface |
| 4 | complete | `validation-report.md`, `screenshot-manifest.json`, six PNG files |
| 5 | awaiting owner | `handoff.md`; no implementation authorization implied |

## Stop Boundary

No production implementation, Figma master claim, deployment, push, or visual acceptance state change is allowed in this package.

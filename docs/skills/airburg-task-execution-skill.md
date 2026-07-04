# Airburg Task Execution Skill

Use this project skill as the default workflow for Tmall V1 internal beta tasks.

## Step 1: Read State

Read:

- `docs/PROJECT_CURRENT_STATE.md`
- `docs/PAGE_PROBLEM_MATRIX_V2.md`
- `docs/TASK_EXECUTION_PROTOCOL_V1.md`

## Step 2: Map ProblemId

Map the user request to `problemId` values when the task touches UI, page behavior, data integrity, persistence, deployment, or feedback triage.

If no problemId fits, pause for a matrix update or explicitly classify the task as Docs/Audit.

## Step 3: Classify Layer

Classify the task as one or more of:

- `ETL`
- `BI`
- `Target`
- `UI`
- `Persistence`
- `Deploy`
- `Audit`
- `Docs`

Split cross-layer tasks unless the user explicitly authorizes the crossing.

## Step 4: Check Forbidden Files

Confirm allowed and forbidden paths before editing. If a required edit touches a forbidden path, output `BLOCKED`.

## Step 5: Implement Small Scope

Implement only the requested scope. Do not opportunistically refactor.

## Step 6: Validate

Run the task-specific validator first, then the required regression scripts, then `npm run lint` and `npm run build` when required.

## Step 7: Decide Deploy

If the task only reaches local validation, report `LOCAL_VALIDATED`. Do not call it deployed.

## Step 8: Public Regression

If deployment is required, execute a separate Deploy task and run public regression.

## Step 9: Human Review

Mark `humanReviewRequired` for page clarity, layout, visual taste, or user workflow acceptance.

## Step 10: Update State

Record the true state in the final response:

- `LOCAL_IMPLEMENTED`
- `LOCAL_VALIDATED`
- `PUBLIC_DEPLOYED`
- `SERVER_ALIGNED`

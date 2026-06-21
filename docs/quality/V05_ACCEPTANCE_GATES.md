# V0.5 Acceptance Gates

## Universal Gates

Every V0.5 task must pass:

1. Governance document read.
2. Scope check.
3. Contract compatibility check.
4. Privacy check.
5. No legacy data clearing.
6. No unauthorized AI, backend, database, API, or crawler work.
7. lint.
8. build.
9. A focused private validation script when data behavior changes.
10. Git baseline check.
11. Single-task contract check.
12. Instruction-file scan.
13. Immutable task authorization check.

PRE-FLIGHT must pass before edits. If PRE-FLIGHT fails, output `BLOCKED` and do not modify files.

## Data Ownership Gate

Any new imported or aggregated fact must include:

1. `platformCode`
2. `storeId`
3. `businessDate`
4. `sourceType`
5. `importBatchId`

Fail if any fact can exist without store ownership.

## Migration Gate

Migration must:

1. Preserve legacy keys.
2. Create Tmall default store.
3. Assign existing Tmall analysis, series, and targets to the default store.
4. Be idempotent.
5. Keep rollback or old snapshots.

Fail if migration relies on clearing old local data.

## Privacy Gate

Fail if any page, view model, script output, or storage writes after-sales sensitive detail names or values to user-facing output.

Allowed: safe aggregate counts, amounts, statuses, and product-level summaries.

## Design Gate

Fail if:

1. Page has whole-page horizontal overflow at 390px.
2. Page repeats large explanation blocks.
3. Page adds many duplicate cards instead of simplifying workflow.
4. Product lists are dumped by default when focus objects are required.

## Stage Gate

Each V0.5 stage may only start after the previous stage is PASS. If a task asks to skip a stage, output `BLOCKED`.

## Governance Enforcement Gate

Every V0.5 task must:

1. run from the Git root;
2. read `docs/project/current-task.json`;
3. verify the baseline commit exists;
4. verify the task authorization file exists, is Git-tracked, and is unchanged from its authorization commit;
5. verify the authorization hash using stable sorted JSON;
6. verify the governance contract hash recorded in `current-task.json` matches the immutable authorization file;
7. compare all changes after the authorization commit with `allowedModifyPaths`;
8. fail if any changed path matches `forbiddenModifyPaths`;
9. fail if nested `AGENTS.md` or any `AGENTS.override.md` exists without explicit lock authorization;
10. fail if private samples, env files, build output, logs, browser profiles, HAR files, or test reports are tracked by Git.

Forbidden paths override allowed paths. A task may not edit its task contract to hide a prior unauthorized modification.

The mutable fields of `current-task.json` are limited to `status`, `commandResults`, `startedAt`, and `completedAt`.

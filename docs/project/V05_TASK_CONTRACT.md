# V0.5 Task Contract

## Purpose

Each V0.5 task must have one machine-readable task contract at:

`docs/project/current-task.json`

Only one current task may be active at a time. The task contract binds the task to a Git baseline, governance hash, allowed paths, forbidden paths, required commands, and stop conditions.

## Required Fields

`current-task.json` must contain:

1. `taskId`: stable task identifier.
2. `stage`: governance stage or substage.
3. `dependsOn`: prior stages that must be complete.
4. `baselineCommit`: Git commit used as the comparison base.
5. `governanceContractHash`: SHA-256 hash of the fixed governance contract.
6. `requiredDocuments`: documents that must be read before work.
7. `allowedModifyPaths`: paths or glob-like prefixes the task may modify.
8. `forbiddenModifyPaths`: paths or glob-like prefixes the task may not modify.
9. `requiredCommands`: validation commands required before completion.
10. `commandResults`: command outcomes recorded before `complete`.
11. `stopConditions`: conditions that force `BLOCKED`.
12. `status`: `pending`, `in_progress`, `blocked`, or `complete`.

## Status Transitions

Allowed transitions:

1. `pending` -> `in_progress`
2. `in_progress` -> `blocked`
3. `in_progress` -> `complete`

`complete` is only valid after all required commands have recorded passing results.

## Path Rules

1. `allowedModifyPaths` must not be empty.
2. `forbiddenModifyPaths` must not be empty.
3. Forbidden paths override allowed paths.
4. Actual changes are compared against `baselineCommit`.
5. Any path outside `allowedModifyPaths` fails validation.
6. Any path inside `forbiddenModifyPaths` fails validation.
7. A task may not modify `current-task.json` to hide an already-created out-of-scope change.

## Governance Hash

The governance hash covers:

1. `AGENTS.md`
2. V0.5 fixed product, architecture, design, roadmap, quality, decision, and task-contract documents
3. `docs/project/v0.5-lock.json`

If any covered document changes, the hash changes. Existing task contracts with the old hash become invalid unless the task is explicitly authorized to update governance.

## Stop Conditions

A V0.5 task must stop with `BLOCKED` if:

1. project root or Git root cannot be confirmed;
2. baseline commit cannot be read;
3. governance hash does not match;
4. required prior stage is not complete;
5. a forbidden file would need modification;
6. private samples or env files are tracked by Git;
7. nested instruction files override the root governance unexpectedly;
8. the task cannot preserve legacy data.

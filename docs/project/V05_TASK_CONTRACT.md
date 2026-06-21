# V0.5 Task Contract

## Purpose

Each V0.5 task must have one machine-readable task contract at:

`docs/project/current-task.json`

Only one current task may be active at a time. The task contract binds the task to a Git baseline, immutable authorization file, governance hash, allowed paths, forbidden paths, required commands, and stop conditions.

Every task must also have one immutable authorization snapshot at:

`docs/project/task-authorizations/<taskId>.json`

The authorization file is committed before implementation work begins. It is the source of truth for task scope.

## Required Fields

`current-task.json` must contain:

1. `taskId`: stable task identifier.
2. `stage`: governance stage or substage.
3. `dependsOn`: prior stages that must be complete.
4. `baselineCommit`: Git commit before the authorization commit.
5. `authorizationFile`: immutable authorization snapshot path.
6. `authorizationHash`: stable SHA-256 hash of sorted authorization JSON.
7. `authorizedContractVersion`: authorization contract version.
8. `governanceContractHash`: SHA-256 hash of the governance contract at authorization time.
9. `requiredDocuments`: documents that must be read before work.
10. `allowedModifyPaths`: paths or glob-like prefixes the task may modify.
11. `forbiddenModifyPaths`: paths or glob-like prefixes the task may not modify.
12. `requiredCommands`: validation commands required before completion.
13. `commandResults`: command outcomes recorded before `complete`.
14. `stopConditions`: conditions that force `BLOCKED`.
15. `startedAt`: task start timestamp.
16. `completedAt`: completion timestamp or `null`.
17. `status`: `pending`, `in_progress`, `blocked`, or `complete`.

## Immutable Authorization Fields

The authorization file contains:

1. `taskId`
2. `stage`
3. `dependsOn`
4. `governanceContractHash`
5. `requiredDocuments`
6. `allowedModifyPaths`
7. `forbiddenModifyPaths`
8. `requiredCommands`
9. `stopConditions`
10. `authorizedAt`
11. `contractVersion`

The authorization file must not contain `commandResults`, `status`, `completedAt`, or run logs.

The following `current-task.json` fields must always match the authorization file:

1. `taskId`
2. `stage`
3. `dependsOn`
4. `governanceContractHash`
5. `requiredDocuments`
6. `allowedModifyPaths`
7. `forbiddenModifyPaths`
8. `requiredCommands`
9. `stopConditions`

During execution, only these current-task fields may change:

1. `status`
2. `commandResults`
3. `startedAt`
4. `completedAt`

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
4. Actual changes are compared against the authorization commit, not the mutable current-task baseline.
5. Any path outside `allowedModifyPaths` fails validation.
6. Any path inside `forbiddenModifyPaths` fails validation.
7. Allowed and forbidden path rules must not overlap.
8. A task may not modify `current-task.json` to hide an already-created out-of-scope change.

## Governance Hash

The governance hash covers:

1. `AGENTS.md`
2. V0.5 fixed product, architecture, design, roadmap, quality, decision, and task-contract documents
3. `docs/project/v0.5-lock.json`

If any covered document changes, the hash changes. A task that changes governance must be explicitly authorized to do so.

## Authorization Hash

`authorizationHash` is SHA-256 over stable sorted JSON for the authorization file. JSON key order and whitespace do not affect the hash.

Preflight must:

1. recompute `authorizationHash`;
2. compare it with `current-task.json`;
3. find the first Git commit that added the authorization file;
4. verify that commit is an ancestor of `HEAD`;
5. verify the current authorization file content matches the first committed version;
6. fail if the authorization file is later modified.

## Stop Conditions

A V0.5 task must stop with `BLOCKED` if:

1. project root or Git root cannot be confirmed;
2. baseline commit cannot be read;
3. authorization commit cannot be found;
4. authorization hash does not match;
5. current-task immutable fields differ from the authorization file;
6. required prior stage is not complete;
7. a forbidden file would need modification;
8. private samples or env files are tracked by Git;
9. nested instruction files override the root governance unexpectedly;
10. the task cannot preserve legacy data;
11. an authorization file is changed after its authorization commit.

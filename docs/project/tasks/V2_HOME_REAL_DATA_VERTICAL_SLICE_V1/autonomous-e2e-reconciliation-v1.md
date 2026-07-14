# V2 Home Autonomous End-to-End Reconciliation V1

## Scope

This pass audited the active Airburg SaaS V2 Home chain from project state through upload, persistence, adapter, targets, UI, browser validation, Git safety, and handoff evidence.

It did not authorize push, deployment, another V2 route, or human visual acceptance.

## Gate Result

- Product track: `SAAS_UI_V2`
- Current product task: `V2_HOME_REAL_DATA_VERTICAL_SLICE_V1`
- Current maturity state: `LOCAL_E2E_PASS`
- Latest validated executable commit: `8b69e46fee532379be5f5f0b2ef4fe44c87a87aa`
- Next gate: `V2_HOME_HUMAN_VISUAL_REVIEW`
- Push executed: `false`
- Deploy executed: `false`
- Visual accepted: `false`

## Findings And Resolutions

### 1. State drift

Before this pass, `PROJECT_SSOT.json` recorded `LOCAL_E2E_PASS`, while `current-task.json`, the task contract, `STATUS_MODEL_V1.json`, `V2_HOME_DATA_CONTRACT.json`, and `PROJECT_CURRENT_STATE.md` still described a not-started static shell.

Resolution:

- aligned the current task and task contract to `LOCAL_E2E_PASS`;
- recorded the implementation commit and the next human visual gate;
- updated the status model and data contract to the real adapter state;
- aligned the SSOT schema with the current SSOT instance;
- retained `visualAccepted = false`, `previewDeployed = false`, and `humanAccepted = false`.

### 2. Validator registry drift

Before this pass, the registry counted a helper as an independent validator and omitted the two active V2 Home validators.

Resolution:

- helper modules are no longer inventoried as validators;
- all top-level `validate-*.ts` scripts are represented exactly once;
- the two V2 Home gates and this current-state reconciliation gate are registered as Tier A;
- aggregate counts are derived and checked by the new reconciliation validator.

### 3. Browser validator nondeterminism

The active V2 Home and upload validators chose a random Chrome debugging port. A collision could connect to an unrelated local service and create a false failure.

Resolution:

- Chrome now owns an operating-system-assigned port through `--remote-debugging-port=0`;
- validators read Chrome's `DevToolsActivePort` file and verify the CDP identity before connecting;
- completed task-scope checks use their recorded Git completion ranges instead of unrelated future working-tree changes.

### 4. Safe skipped summary mismatch

The upload page reported `1` safe skipped input, but the persisted snapshot did not receive the preview-stage safe skip code, so V2 Home data health displayed `0`.

Resolution:

- preview-stage skipped inputs now contribute only safe issue codes and counts to the existing snapshot interface;
- no original filename, row, warning text, or file content is persisted;
- browser E2E now proves upload skipped `1` equals V2 Home safe skipped `1`.

### 5. Multi-month target ambiguity

The target draft key is monthly. A multi-month range previously reused only the end month's target against a multi-month actual, which could produce a misleading completion state.

Resolution:

- platform and series target overlays are shown only when the selected range belongs to one calendar month;
- multi-month ranges display missing target values rather than inventing an aggregation rule;
- returning to a single month restores its target draft.

## Reconciliation Evidence

The local real-data browser gate passed with:

- files: `18`
- import: `17 success / 0 failed / 1 safe skipped`
- GMV: `125596`
- GSV: `85455.96`
- visitors: `143076`
- paid buyers: `128`
- ad spend: `7625.95`
- clicks: `6692`
- refund amount: `29602.18`
- runtime dataset contains targets: `false`
- duplicate import doubles totals: `false`
- visible KPI count: `17`
- desktop layout: `6 x 3`
- mobile layout: `2` KPI columns with no page-wide overflow
- console business errors: `0`
- failed business requests: `0`
- invalid numeric text: `0`
- sensitive text: `0`

Temporary screenshots and manifests remain outside Git.

## Remaining Deliberate Gates

1. `brandKeywordPaidShare` remains explicit `--` because its dedicated implementation contract is not complete; it is not aliased to GEO search share.
2. The remaining eight V2 routes are static shells and are not authorized for data binding by this pass.
3. Human visual acceptance remains pending. Automated screenshots and layout measurements cannot promote the state to `VISUAL_ACCEPTED`.
4. No push or ECS deployment was performed. GitHub and public ECS remain unchanged.

Historical stage validators may retain their original harness choices. They are not current release claims and cannot override the active SSOT or the registered Tier A V2 Home gates.

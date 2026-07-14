# Project Single-Track Governance

`docs/project/PROJECT_SSOT.json` is the only machine-readable authority for current project state.

Before every task, Codex must read in this order:

1. `docs/project/PROJECT_SSOT.json`
2. `docs/project/current-task.json`
3. the `contract` named by `docs/project/current-task.json`
4. task-relevant specifications and historical evidence named by the SSOT or contract

Authority rules:

1. Exactly one `activeProductTrack` and one current task are allowed.
2. `docs/PROJECT_CURRENT_STATE.md` is a derived summary, not an independent state source.
3. `docs/PAGE_PROBLEM_MATRIX_V2.md` is a Legacy V1 historical problem ledger.
4. `docs/UI_BASELINE_LOCK_V2.md` applies only to the frozen Legacy V1 fallback.
5. `docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md` is a specification, not runtime or completion evidence.
6. V0.5 freeze documents are archived release evidence. They do not make every V0.5 command center route-bound.
7. `lib/state/system-state.ts` is not the project SSOT and is currently a deprecated unbound artifact.
8. Do not use one generic `PASS` as a product maturity state. Use `docs/project/STATUS_MODEL_V1.json`.
9. Deployment must come from a clean identified Git commit. Dirty-worktree rsync cannot be reported as `PUBLIC_ALIGNED`.
10. A deployment record must include commit SHA, schema version, and UI version. Until read-only build identity exists, a healthy public service with unknown commit is `PUBLIC_HEALTH_PASS_COMMIT_UNKNOWN`.

Current single track:

- Active product track: `SAAS_UI_V2`.
- Current state: `/v2/home` is `LOCAL_E2E_PASS` and data-bound through one canonical adapter; the other eight V2 routes remain `STATIC_SHELL`.
- Visual state: `visualAccepted = false`, `humanAccepted = false`, and `previewDeployed = false`.
- Frozen fallback: Tmall V1 public internal beta.
- Foundation candidate: V0.5 domain/persistence.
- Only next entry gate: `V2_HOME_HUMAN_VISUAL_REVIEW`; automated screenshots cannot satisfy it.

---

# V0.5 Project Governance (Historical / Foundation-Specific)

Before any explicitly authorized V0.5 foundation task, Codex must read:

1. `docs/product/V05_PRODUCT_NORTH_STAR.md`
2. `docs/product/V05_INFORMATION_ARCHITECTURE.md`
3. `docs/architecture/V05_PLATFORM_STORE_DATA_CONTRACT.md`
4. `docs/architecture/V05_STORAGE_AND_MIGRATION_CONTRACT.md`
5. `docs/design/V05_DESIGN_SYSTEM.md`
6. `docs/design/V05_REFERENCE_PLATFORM_MAP.md`
7. `docs/roadmap/V05_EXECUTION_SEQUENCE.md`
8. `docs/quality/V05_ACCEPTANCE_GATES.md`
9. `docs/decisions/ADR-001-platform-and-store-ownership.md`
10. `docs/project/v0.5-lock.json`
11. `docs/project/V05_TASK_CONTRACT.md`
12. `docs/project/current-task.json`
13. the `authorizationFile` named inside `docs/project/current-task.json`

Before edits, Codex must complete PRE-FLIGHT:

1. confirm project root and Git root;
2. confirm current task, baseline commit, governance hash, allowed paths, and forbidden paths;
3. scan for `AGENTS.md` and `AGENTS.override.md`;
4. output `BLOCKED` if PRE-FLIGHT fails.
5. confirm the task authorization file is Git-tracked, hash-matched, and unchanged from its authorization commit.

Rules:

1. Do not change the product direction without explicit user approval.
2. Do not expand task scope beyond the requested V0.5 stage.
3. If a task conflicts with these contracts, output `BLOCKED` and list the conflict. Do not work around it.
4. Every code change must include validation evidence.
5. Do not clear legacy local data to avoid migration work.
6. Do not expose after-sales sensitive details. Only safe aggregates may be shown.
7. Current V0.5 work must not add AI, backend, database, platform API, or crawler features unless a later locked document explicitly changes that boundary.
8. Forbidden paths override allowed paths.
9. Do not modify `current-task.json` to hide an out-of-scope change.
10. Do not modify immutable task fields after authorization. Only `status`, `commandResults`, `startedAt`, and `completedAt` may change during execution.
11. Only root `AGENTS.md` is allowed. Nested `AGENTS.md` and all `AGENTS.override.md` files are forbidden unless a later lock explicitly changes this rule.

---

# Tmall V1 Internal Beta Agent Protocol

This section governs the current **天猫 V1 内测排查版** work. It exists to prevent long-context drift, cross-layer edits, and false status reporting.

Before every Codex task in this project, read:

1. `docs/PROJECT_CURRENT_STATE.md`
2. `docs/PAGE_PROBLEM_MATRIX_V2.md`
3. `docs/TASK_EXECUTION_PROTOCOL_V1.md`
4. the task-relevant file under `docs/agents/*.md`
5. the task-relevant file under `docs/skills/*.md`

For every UI task, also read:

1. `docs/UI_BASELINE_LOCK_V2.md`
2. `docs/PAGE_PROBLEM_MATRIX_V2.md`
3. `docs/TASK_EXECUTION_PROTOCOL_V1.md`

Pre-flight is mandatory:

1. Decide the task layer: `ETL` / `BI` / `Target` / `UI` / `Persistence` / `Deploy` / `Audit` / `Docs`.
2. Bind the task to one or more `problemId` values when it touches UI, page behavior, data quality, persistence, or deployment.
3. Confirm allowed files before editing.
4. Confirm forbidden files before editing.
5. Distinguish the real status: `LOCAL_IMPLEMENTED`, `LOCAL_VALIDATED`, `PUBLIC_DEPLOYED`, or `SERVER_ALIGNED`.

Hard rules:

1. Do not use `PASS` as a substitute for public deployment.
2. Do not say a local result is online.
3. Do not say a deployed result is server-aligned until server alignment or public regression is done.
4. Do not modify UI without a `problemId`.
5. UI tasks must not modify ETL, BI formulas, Target formulas, runtime append, search dedup, Brand/Center semantics, or Persistence schema.
6. Data tasks must not modify page layout.
7. Deploy tasks must not modify business code.
8. Target tasks must not write target drafts into runtime dataset.
9. Persistence tasks must not save original Excel / CSV files, `rawRows`, `previewRows`, raw warning text, or after-sales sensitive details.
10. Screenshots and visual QA require `humanReviewRequired` when aesthetics or page clarity are part of acceptance.
11. UI tasks must preserve `docs/UI_BASELINE_LOCK_V2.md` unless the user explicitly authorizes changing the baseline.
12. If a task changes KPI display count, hides KPI cards, introduces `L1` / `L2` / `L3` / `L4`, or introduces `Primary` / `Secondary` / `Hidden` labels, output `BLOCKED` unless the user explicitly authorizes it.
13. Git baseline readiness gates must use `scripts/private-audit/validate-git-baseline-sensitive-scan-policy-v2.ts`; the V1 sensitive scan script is historical and must not be the current baseline blocker. V2 still hard-blocks real secrets, private keys, real samples, and forbidden paths.
14. Current final Git baseline readiness gates must use `scripts/private-audit/validate-project-execution-guardrails-current-state-v1.ts`, `scripts/private-audit/validate-ui-baseline-lock-current-state-v1.ts`, and `scripts/private-audit/validate-git-baseline-sensitive-scan-policy-v2.ts`.
15. Historical validators `scripts/private-audit/validate-project-execution-guardrails-v1.ts` and `scripts/private-audit/validate-ui-baseline-lock-after-restore-full-kpi-grid-v1.ts` are retained for historical stage checks and must not block the current final baseline after `PUBLIC_DEPLOYED = true`, `SERVER_ALIGNED = true`, and `HUMAN_REVIEW_PASS = true`.
16. `next-env.d.ts` is a Next.js generated file. If it only changes between `./.next/types/routes.d.ts` and `./.next/dev/types/routes.d.ts`, restore it before Git baseline readiness instead of committing the generated noise.

Recommended agent routing:

- State/status questions: `docs/agents/state-agent.md`
- User feedback triage: `docs/agents/problem-matrix-agent.md`
- Layer and scope gate: `docs/agents/layer-gatekeeper-agent.md`
- UI-only page layout work: `docs/agents/ui-layout-agent.md`
- ETL/runtime/data reconciliation: `docs/agents/data-integrity-agent.md`
- BI formulas and semantic metrics: `docs/agents/bi-semantic-agent.md`
- Target rules and drafts: `docs/agents/target-agent.md`
- ECS deployment and public regression: `docs/agents/deploy-agent.md`
- Screenshot, 390px, console, and sensitive-text QA: `docs/agents/qa-screenshot-agent.md`

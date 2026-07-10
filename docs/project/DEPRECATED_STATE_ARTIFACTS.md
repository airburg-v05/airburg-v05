# Deprecated State Artifacts

## `lib/state/system-state.ts`

- Classification: `DEPRECATED_UNBOUND_STATE_ARTIFACT`.
- Semantic status: `STALE_SEMANTICS`.
- Business import count at the 2026-07-10 audit: `0`.
- Current route usage: none.
- Persistence usage by current routes: none.

The file contains an IndexedDB state implementation and architectural constants, but no `app/**`, `components/**`, `lib/bi/**`, `lib/v05/**`, or active persistence workflow imports it. It therefore cannot be treated as the project SSOT or as evidence that page state is restored through this layer.

Stale declarations include:

1. `UI_ARCH_VERSION = UI_IA_L1_L2_L3_L4_KPI_CHART_UPLOAD_PRODUCTIZED_V1`.
2. KPI `primary` / `secondary` / `hidden` locks that conflict with the later Legacy V1 full-KPI-grid baseline.
3. A project-wide SSOT claim that was never wired into current route ownership.

## Disposition

Current decision: **retain as historical code, do not import into new work, and do not edit in this governance task**.

Before any future reuse, choose one explicit follow-up:

- delete it after dependency verification;
- migrate only still-valid serialization helpers;
- rewrite it behind the canonical V2 adapter contract;
- or move it to an archived namespace.

Until that follow-up is authorized, `docs/project/PROJECT_SSOT.json` is the only project-state authority.


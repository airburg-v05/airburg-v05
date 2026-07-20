# PLAN

1. Confirm the 18 real Tmall source files and isolate the failing file path. `DONE`
2. Reproduce the failure in the real `/upload` flow and identify the exact layer causing rejection. `DONE`
3. Implement the minimum fix so plan-level ad reports are accepted without faking `productId` or changing KPI semantics. `DONE`
4. Add regression coverage for same-day same-plan dedup and dual-granularity non-double-count. `DONE`
5. Re-run local validators, build, and real system-Chrome `/upload -> /v2/home` evidence. `DONE`
6. Run the ECS SSH BatchMode gate and continue the existing deploy protocol only if it passes. `BLOCKED`
7. If blocked remotely, write exact evidence, resume conditions, and handoff. `DONE`

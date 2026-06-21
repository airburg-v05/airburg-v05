# V0.5 Project Governance

Before any V0.5 task, Codex must read:

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

Rules:

1. Do not change the product direction without explicit user approval.
2. Do not expand task scope beyond the requested V0.5 stage.
3. If a task conflicts with these contracts, output `BLOCKED` and list the conflict. Do not work around it.
4. Every code change must include validation evidence.
5. Do not clear legacy local data to avoid migration work.
6. Do not expose after-sales sensitive details. Only safe aggregates may be shown.
7. Current V0.5 work must not add AI, backend, database, platform API, or crawler features unless a later locked document explicitly changes that boundary.

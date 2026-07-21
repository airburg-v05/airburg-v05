# Context Pack

## Authority

1. 宗骥's direct 2026-07-21 eleven-point review and request to reconcile historical GPT changes.
2. `docs/project/PROJECT_SSOT.json`, updated 2026-07-21 01:00 +08:00.
3. Current deployed public browser state at `http://123.57.49.121/v2/home`, inspected 2026-07-21.
4. Current project manager thread and historical implementation evidence.
5. Existing task handoffs and implementation source.

## Historical Facts Recovered

- The July 20 closure fixed V0.5 target-foundation fallback leaking 17 metrics into home after runtime cleanup.
- The latest UX task simplified secondary pages and added upload CTAs, but did not unify their data source.
- Public evidence kept runtime upload and V0.5 target foundation intentionally separate.
- Current deployed page now exposes the consequence: home has runtime data while series/store/product/data-health/target-center still read other state.

## Current Public Evidence

- Home shows Airburg/Tmall/store metrics for 2026-06-29 through 2026-07-05.
- Series center says no series data and routes to upload.
- Data health says no V2 import batch.
- Target center says the operating data exists but a separate target foundation is missing.
- Upload page contains a second four-file `目标中心数据底座` section.
- Home `自定义` is a details summary rather than a clear button flow.
- Trend bottom renders data-health counts as a separate row.

## Primary Owner And Expert Lens

- Project: `ecommerce-platform-optimized`
- Lead: `ecommerce_data_platform_lead`
- Challengers: brand product owner; senior SaaS data-product architect.

## Material Unknowns

- Whether 宗骥's visible home data came from an earlier upload in the same Chrome profile: `unknown` because browser storage is not inspected.
- Whether non-Tmall real adapters are available: no current evidence; keep disabled.
- Whether existing V0.5 target records should be migrated into the new brand target model: preserve read-only compatibility where safe; do not silently claim migration.

## Placement

Active source and browser-local data remain local-first. The existing project-scoped ECS deployment may be used after local validation. No secrets or raw source files are uploaded.

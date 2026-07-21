# Issue Matrix

Status: `IMPLEMENTED_AND_LOCAL_VALIDATED_PENDING_PUBLIC_REGRESSION`

| ID | User feedback | Implemented treatment | Local evidence |
|---|---|---|---|
| FB-01 | Future multi-brand support | Added add/switch brand workspace and brand-specific runtime, target and debug databases. This is current-browser isolation, not cloud account/organization multi-tenancy. | Static isolation checks and clean-profile route regression PASS. |
| FB-02 | Multi-platform/multi-store aggregation | All V2 boards read one active brand snapshot; explicit append merges store facts by platform/store keys. Only the verified Tmall file adapter is enabled. | Second-store append doubled GMV from `125596` to `251192` without duplicate loss; two-store scope PASS. |
| FB-03 | YoY/MoM controls | Replaced ambiguous duplicate controls with one Off/YoY/MoM group and explicit reference-range or unavailable state. | Browser interaction checks PASS. |
| FB-04 | Custom date has no response | Added an explicit panel with bounded start/end fields, Apply and Cancel. | Custom range remained inactive until Apply, then selected `2026-06-26` to `2026-06-30`; PASS. |
| FB-05 | Key series belongs with KPIs; max five selected | Moved key series into the KPI region; series count is unlimited and home selection is manually capped at five. | Created six series, selected five, and verified the selected series appears inside the metric panel; PASS. |
| FB-06 | Remove small row under trend | Removed trend footer health counters; data health remains a dedicated route. | DOM regression confirms the footer row is absent. |
| FB-07 | Data appears before current upload | Default import is Replace; Append is explicit; active/history snapshots and a confirm-gated clear action expose provenance. Existing user-profile origin remains `unknown`. | Clean profile showed no data before import and returned to empty after isolated cleanup; PASS. |
| FB-08 | Uploaded data not visible in series/store/product | Replaced legacy fallback reads with the active brand runtime adapter. Series configuration remains available when data exists but no series is configured. | Series/store/product all showed the uploaded runtime and no upload prompt; PASS. |
| FB-09 | Target center should not depend on upload | Brand monthly targets are writable before operating data; entity target levels activate only when their entities exist. | Save/read/pause/reactivate of a brand percent target before upload PASS. |
| FB-10 | Target foundation on upload is redundant | Removed the target-foundation block from V2 upload. | Static and browser absence checks PASS. |
| FB-11 | Uploaded data absent in data health | Data health and import history now read the same active brand runtime snapshot as home. | Active Replace snapshot, Append snapshot and audit-only prior snapshot all visible; PASS. |

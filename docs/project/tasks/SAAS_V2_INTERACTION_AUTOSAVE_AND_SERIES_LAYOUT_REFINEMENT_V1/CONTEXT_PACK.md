# Context Pack

## Latest Direct Request

Zongji requested five concrete refinements after reviewing the public cross-platform series version: metric cards should drive the chart primary metric; targets should auto-save and the two low-value target-center explainer/derived sections should be hidden; `DLY` should use a clearer three-letter daily label; custom-date selection should not leave a white box after Month; and the bottom brand-series breakdown should be removed while the two analysis lenses become more compact and attractive.

## Why Now

The exact public implementation `dface84eefdd87a55c819fd323626efb436b19b2` passed technical regression, but Zongji's post-deploy inspection exposed interaction and information-hierarchy gaps. This direct feedback supersedes the prior pending-owner-review gate for the affected surfaces.

## Current Truth

- Repository baseline: `c34e834b2a37ea6156cbdeba9a1110a32a47eaa1`.
- Public runtime implementation: `dface84eefdd87a55c819fd323626efb436b19b2`.
- Public route: `http://123.57.49.121/v2/home`.
- Public technical regression: 52/52 PASS; new changes are not deployed.
- Target drafts are brand-namespaced IndexedDB records. This proves same-browser persistence only, not cross-device synchronization.
- The chart's internal `dly` mode already computes one-day points; the requested change is a visible terminology change, not a data-formula change.
- The active V2 metric grid has 16 visible metrics but the current chart-pair list exposes only seven unique primary metrics.

## Authority And History

1. Latest direct instruction from Zongji on 2026-07-22.
2. Current code and project SSOT.
3. Current public deployment evidence and previous task handoff.
4. Existing target persistence and metric contracts.
5. Legacy V1 UI records only as historical regression context.

## Expert Standard

- Lead: `ecommerce_data_platform_lead`.
- Required lenses: ecommerce operations, data-product semantics and engineering release QA.
- Minimum quality: one action has one visible result; same metric/scope/month reads back after refresh; unknown or unsupported target semantics remain explicit; mobile layout has no page-wide overflow.

## Scope And Gates

- Local UI, target interaction and browser-local persistence edits: A2 authorized by the direct request.
- ETL and BI formulas: forbidden.
- Exact-commit commit, push and deployment to the existing public SaaS V2 runtime: A3 owner-authorized by Zongji on 2026-07-22.
- Merge remains forbidden; visual acceptance remains a post-deployment owner decision.
- Visual acceptance remains a post-implementation owner decision.

## Material Unknowns

- Cross-device target synchronization remains unavailable because no server account/persistence contract exists.
- The user's exact browser-local target state is not read; correctness must be proven in an isolated browser profile with controlled records.
- `DAY` is selected as the clearest requested three-letter label; internal storage remains `dly` for compatibility.

## Validation And Archive

- Focused source validator for pair coverage, terminology, custom-date structure, target auto-save and series-section removal.
- Existing metric/target validators plus TypeScript, lint and production build.
- Isolated desktop/mobile browser regression with target refresh readback and screenshots.
- Archive: this task directory; no reusable asset or public deployment claim.

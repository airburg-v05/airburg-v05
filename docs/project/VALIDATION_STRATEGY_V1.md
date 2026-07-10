# Validation Strategy V1

Machine-readable inventory: `docs/project/VALIDATOR_REGISTRY.json`.

## Independent Validation Layers

### Layer 1: Source And Structure

Checks files, imports, schemas, forbidden strings, route inventory, type contracts, and static component structure.

It can prove that a route or contract exists. It cannot prove real data is bound or correct.

### Layer 2: Real Logic And Data

Runs parsers, ETL/runtime merge, dedup, BI formulas, target isolation, and persistence against authorized real samples or controlled fixtures appropriate to the contract.

The real 18-file Tmall reconciliation is `TIER_A_RELEASE_CRITICAL`. Synthetic fixtures may test edge cases but may not replace real-file evidence.

### Layer 3: Browser Interaction E2E

Exercises the actual route in Browser/Playwright: upload or restore, selection, refresh, persistence, target overlays, charts, console, invalid-number checks, and responsive overflow.

HTTP 200, static source inspection, or `npm run build` cannot replace this layer.

### Layer 4: Human Visual And Copy Acceptance

Compares the complete rendered page with approved reference screenshots/PDF and the page specification. Automated screenshots support this review but cannot declare `VISUAL_ACCEPTED` or `HUMAN_ACCEPTED`.

## Validator Tiers

- `TIER_A_RELEASE_CRITICAL`: gates canonical state, real-data reconciliation, security, current-task integrity, or release/public alignment.
- `TIER_B_MODULE_REGRESSION`: protects a current module or cross-page contract.
- `TIER_C_STAGE_ONLY`: proves one historical implementation stage and may intentionally fail after later stages change expected state.
- `TIER_D_LEGACY_OR_SUPERSEDED`: retained for history or a superseded policy and must not block the current gate by itself.

## Validation Types

- `SOURCE_STRUCTURE`
- `REAL_LOGIC_DATA`
- `BROWSER_INTERACTION_E2E`
- `SECURITY`
- `STATE_GOVERNANCE`
- `VISUAL_MANUAL`

Each registry record has one primary type. Notes may list secondary coverage.

## Non-Substitution Rules

1. String presence does not prove data binding.
2. Build PASS does not prove business success or `DATA_BOUND`.
3. HTTP 200 does not prove browser interaction E2E.
4. Screenshot creation does not prove visual acceptance.
5. Git push does not prove the ECS runtime is aligned.
6. Static-shell validation proves only `STATIC_SHELL`.
7. A historical stage validator must not override current SSOT evidence.

## Current Tier A Minimum Gate

For the current reconciliation and the next `/v2/home` entry gate, Tier A includes at least:

1. Sensitive Scan V2.
2. Project SSOT/current-task/single-track validator.
3. Real 18-file Tmall pipeline reconciliation.
4. Missing-metric and after-sales reconciliation.
5. Target isolation and target draft acceptance.
6. Runtime persistence safety.
7. Current V0.5 completion/release evidence where used as a foundation claim.
8. Browser E2E and human visual acceptance once `/v2/home` moves beyond `STATIC_SHELL`.

The SaaS UI V2 static-shell validator remains source/structure evidence only and cannot promote the track to `DATA_BOUND`.


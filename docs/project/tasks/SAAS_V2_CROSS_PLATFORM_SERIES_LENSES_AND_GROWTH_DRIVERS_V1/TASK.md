# Task

Task ID: SAAS_V2_CROSS_PLATFORM_SERIES_LENSES_AND_GROWTH_DRIVERS_V1

Status: LOCAL_E2E_PASS_PENDING_OWNER_DEPLOY_DECISION

## Objective

Refine the SaaS V2 operating model for a brand with many platforms and stores while preserving the owner-approved visual baseline and the existing metric truth.

## In Scope

- Record the current deployed version as an owner-approved stable visual baseline.
- Add explicit brand-summary and single-store drilldown lenses to series center.
- Add a brand-series platform/store contribution breakdown based on current runtime facts.
- Add total visitors and paid buyers to the shared commercial metric surface.
- Remove unavailable turnover and regional-fulfillment placeholders from the visible 16-card surface without deleting them from the truth contract.
- Document the future brand-product and platform-listing identity contract.
- Run focused validators, TypeScript, lint, production build and local browser regression.

## Out of Scope

- Inventing cross-platform product identity mappings or brand-series targets.
- Adding unsupported paid-order, cart, favorite, inventory, profit or fulfillment metrics.
- New marketplace adapters, server-side tenancy or cross-device persistence.
- Editing raw business data or reading secrets.
- Deployment, push or merge without a separate owner decision.

## Acceptance Evidence

- The stable Git tag peels to the accepted repository evidence commit and the prior release remains named in task evidence.
- Series center makes the two scopes explicit and never presents a multi-store aggregate as a store target result.
- Brand-summary mode is fixed to all connected platforms and stores and shows a store contribution breakdown for the selected series.
- Store-drilldown mode requires exactly one store and uses the existing scoped target behavior.
- Home, series, store and product surfaces show total visitors and paid buyers and retain a balanced 16-card layout.
- Unsupported runtime facts remain absent or explicitly unknown.
- Local automated and browser gates pass with no deployment claim.

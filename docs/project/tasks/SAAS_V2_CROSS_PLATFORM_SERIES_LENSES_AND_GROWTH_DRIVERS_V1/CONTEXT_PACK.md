# Context Pack

## Direct Request

Zongji explicitly accepted the currently deployed SaaS V2 refinement as the latest stable visual baseline and asked for the next refinement to model one brand across multiple platforms and stores more precisely. The series center should distinguish brand-wide series performance from a single store's series execution, and useful missing indicators should be added to home, store and product surfaces when the current data source actually supports them.

## Current Truth

- Repository evidence baseline: 7f131274713608a98be35983e99b6ac2e4aa2696.
- Deployed business implementation: e25660c67539bc82405e00e4f354df855e82e05c.
- Owner-approved stable tag: stable/saas-v2-commercial-refinement-20260722.
- Preserved active release: /opt/airburg/releases/saas-v2-commercial-refinement-e25660c-20260722T003453.
- Current series records already bind one brand series to many platform, store and product references.
- Current manually managed product records are listing-level records. They do not prove a cross-platform brand-product identity.
- The current runtime has trustworthy total visitors and paidBuyers. Paid orders, cart additions, favorites, inventory turnover and regional fulfillment are not currently bound as reliable runtime facts.
- Existing series targets are scoped to one platform and one store. A brand-series target contract does not yet exist.

## Authority Order

1. Latest direct instruction from Zongji on 2026-07-22.
2. Current code, runtime facts and deployed release identity.
3. Current project SSOT and task evidence.
4. Cross-platform data-model roadmap and historical handoffs.
5. Public product-model references, used only for general identity design and never as private Airburg business truth.

## Interpretation

- Home remains the brand cockpit and defaults to all connected platforms and stores.
- A series is a brand-level product family. It can contain many platform and store listing references.
- Series center receives two analysis lenses: Brand summary and Store drilldown.
- Brand summary covers the selected series across all connected platforms and stores and includes contribution breakdown.
- Store drilldown covers the selected series in exactly one platform and store and uses the existing store-series target contract.
- Brand-summary mode must not silently add incomplete store-series targets. Until a brand-series target contract exists, its target state is explicitly unavailable.
- Product center will continue to show manually selected listing records. A future brand-product level requires an explicit master identity and listing mapping before aggregation is allowed.
- Total visitors and paid buyers replace two known unavailable commercial cards while keeping a balanced 16-card display.

## Material Unknowns

- Cross-platform identity mappings for the same physical product are unknown until an owner-managed brand-product master is implemented.
- JD, Douyin and other merchant data adapters are unknown; the current verified sample path remains Tmall.
- A brand-series monthly target and its allocation policy are unknown.
- Cross-device configuration persistence remains unknown because the current workspace is browser-local.

## Gates

- Source and local UI changes are A2_AUTHORIZED by the direct request.
- Deployment, push and merge remain A3_NOT_AUTHORIZED for this task.
- Technical validation cannot establish business completion.
- Owner review is required before the new implementation replaces the accepted public stable baseline.

# Dimension And Metric Decision

## Operating Hierarchy

The canonical analytical hierarchy is:

brand -> platform -> store -> brand series -> brand product -> platform/store listing

The runtime fact grain remains date + platform + store + product/listing. Higher levels are aggregations over explicit mappings, never name-based guesses.

## Surface Responsibilities

| Surface | Default question | Required scope | Current safe indicators |
|---|---|---|---|
| Brand cockpit | Is the whole brand growing efficiently? | All connected platforms and stores | GMV, GSV, total visitors, paid buyers, conversion, AOV, ads, search and after-sales facts currently bound |
| Series brand summary | How much does this brand series contribute and where? | One brand series across all mapped listings | Shared indicators plus platform/store contribution |
| Series store drilldown | How is this series executed in one store? | One platform, one store, one series | Shared indicators plus existing store-series target |
| Store center | Which store drives or drags brand performance? | Exactly one store for operational diagnosis | Shared indicators; future brand contribution delta is derivable |
| Product center | Which manually selected listing is performing? | One platform/store listing | Shared indicators; no brand-product rollup until a master mapping exists |

## Product Identity Decision

BrandProductRecord is currently a listing record. A future brand-product master needs a stable brandProductId and a separate mapping table containing platformCode, storeId, productId, effective dates and mapping status. The UI must not merge listings by title, image or similar IDs.

This follows the established primary/variant identity pattern rather than treating every marketplace listing as the master product. Public references used only for the general model are Google Cloud Retail's primary/variant catalog contract and Google Merchant Center's rule that variants keep separate product IDs while sharing an item group ID:

- https://docs.cloud.google.com/retail/docs/catalog
- https://support.google.com/merchants/answer/6324507

Airburg still needs its own owner-managed mapping. These public references do not prove any private cross-platform identity.

## Target Decision

- Brand, store, series and product targets remain separate records.
- A store-series target applies only to one platform/store/series combination.
- Brand-summary series mode does not sum store targets because store coverage may be incomplete and allocation semantics are not defined.
- A future brand-series target may be added only with an explicit monthly contract and allocation policy.

## Metric Decision

Add now because the runtime and reconciliation already contain them:

- Total visitors.
- Paid buyers.

Keep out of the commercial grid until a reliable source contract exists:

- Paid orders, units, cart additions and favorites.
- Inventory turnover and regional fulfillment.
- Profit, contribution margin and platform settlement metrics.

Total visitors and paid buyers replace the two unavailable visible placeholders. The full truth contract may retain unavailable fields for future compatibility, but unavailable fields must not consume commercial dashboard space.

# V0.5 Information Architecture

## Navigation Model

V0.5 must move toward this hierarchy:

1. Home: company and cross-store command center.
2. Upload: batch import and data quality repair.
3. Store Board: one store at a time.
4. Series Board: user-created series under a selected store.
5. Product Board: user-tracked products under a selected store or series.
6. Targets: company, store, series, and product target management.
7. Raw Data: safe aggregate inspection only.

## Page Responsibilities

### Home

Home answers: what should the operator inspect first today?

It should show:

1. Date range and current business date.
2. Cross-store GMV, GSV, visitors, buyers, conversion, refund, ad spend, and ROI.
3. Company target progress.
4. Store completion ranking.
5. Data status and import gaps.
6. Compact entry cards to store, series, product, targets, and upload.

Home should not show full product tables or detailed after-sales rows.

### Upload

Upload answers: what data is missing or broken, and what should be imported next?

Final V0.5 direction:

1. Select platform and store.
2. Batch choose multiple files.
3. Click one import button.
4. System identifies source, parses, validates, aggregates, and saves.

Upload should not require one card per source forever.

### Store Board

Store Board answers: is this store on track and where is the pressure?

It should focus on one `platformCode + storeId` context.

### Series Board

Series Board answers: how are user-defined product series performing?

Series must be user-created. The system must not create all possible series automatically.

### Product Board

Product Board answers: which tracked product needs action?

Tracked products must be user-created or user-selected. Do not default to a giant all-product workbench.

### Targets

Targets answers: how are goals distributed and where are gaps?

Target hierarchy:

1. Company total target.
2. Store target.
3. Series target.
4. Product target.

### Raw Data

Raw Data answers: what safe aggregate values were saved?

It must never display after-sales sensitive detail rows.

## Platform And Store Context

All operational pages must resolve a platform and store context before showing store, series, or product data. Company-level views may aggregate across stores, but each source fact remains owned by one platform and one store.

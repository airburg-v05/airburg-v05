# V0.5 Product North Star

## Product Goal

Build a local-first, multi-platform ecommerce operations analysis system for Airburg. The final system must support Tmall, JD, Pinduoduo, Douyin, Youzan, and later platforms, with multiple stores under the same platform.

中文方向：系统终局必须支持多平台、多店铺；同一平台允许多个店铺。

The product helps operators answer:

1. Which company, store, series, or product is off target?
2. Which data sources are missing or unreliable?
3. Which store, series, or product should be inspected first?
4. Which target layer needs action next?

## User Roles

1. Operator: uploads exported files, checks daily performance, reviews stores, series, and products.
2. Owner: reviews company-level targets, store completion, and major risks.
3. Analyst: maintains import mapping, quality checks, migration, and validation scripts.

## Product Direction

The terminal direction is:

1. Multi-platform.
2. Multi-store per platform.
3. Every imported fact must belong to `platformCode` and `storeId`.
4. Upload should become simple batch file selection plus one import action.
5. Import must automatically identify source, parse, validate, aggregate, and save.
6. Home focuses on cross-store core metrics, date range, target progress, and store completion.
7. Navigation drills down from company to store to series to product.
8. Series and tracked products are user-created focus objects, not automatic full product dumps.
9. Targets follow company total target -> store -> series -> product.
10. After-sales only shows safe aggregates, never sensitive detail rows.
11. Pages must be compact and decision-oriented, not long stacks of repeated cards.
12. Current V0.5 scope does not include AI.

当前 V0.5 scope does not include AI，任何 AI、千问、百炼、OpenAI 接入都必须等待后续锁定阶段。

## Simplicity Principles

1. Each page must have one primary decision.
2. Do not repeat the same metric block in multiple forms on one page.
3. Prefer summaries, filters, drilldowns, and drawers over endless page sections.
4. Do not show all products by default when the user has not chosen focus products.
5. Empty states must tell the next concrete action.

## Privacy Boundary

After-sales raw rows, order identifiers, transaction identifiers, contact details, addresses, logistics details, buyer explanations, seller notes, operators, subaccounts, and other sensitive details must not be rendered or stored in business view models. Only safe aggregates are allowed.

售后隐私边界：只允许 safe aggregates / 安全聚合，不允许展示敏感明细。

## Current Non-Goals

1. AI reports or AI advisor.
2. Backend API.
3. Server-side database.
4. SaaS payment.
5. Complex permissions.
6. Platform API integration.
7. Crawlers.
8. Automatic platform login.
9. Replacing legacy data by clearing localStorage.
10. IndexedDB during V0.5A-0.1.

Browser IndexedDB is not treated as a server database, but it is still a storage architecture change. It may only be introduced by a later task that explicitly authorizes IndexedDB and updates the storage contract. V0.5A-0.1 does not introduce IndexedDB, does not change storage, does not implement migration, and does not modify existing metrics, target, or trend rules.

## Direction Check For New Requests

A new request violates the direction if it:

1. Creates data without `platformCode` and `storeId`.
2. Adds a store-level feature that cannot support multiple stores.
3. Shows all products as a primary default page instead of user-selected focus objects.
4. Adds AI, backend, database, API, or crawler work before the locked stage allows it.
5. Exposes after-sales sensitive detail.
6. Changes frozen target, trend, or four-source business rules without a migration decision.
7. Increases page density with repeated cards instead of simplifying the workflow.

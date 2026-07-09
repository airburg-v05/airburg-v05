# Airburg SaaS Product UI Blueprint V2

Status: `LOCAL_BLUEPRINT`

Task: `AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_REBASE_FROM_LATEST_RULES`

This document is the product and UI source of truth for Airburg SaaS UI V2. It is rebased from the latest master task rules, not from the old V1 page-fix backlog. The old page problem documents remain useful as requirement evidence and negative examples, but V2 must be built as a product workspace, not as another patch layer on top of legacy UI.

## 0. Evidence, Scope, And Stop Rule

Evidence read:

- `AGENTS.md`
- `docs/PROJECT_CURRENT_STATE.md`
- `docs/PAGE_PROBLEM_MATRIX_V2.md`
- `docs/TASK_EXECUTION_PROTOCOL_V1.md`
- `docs/UI_BASELINE_LOCK_V2.md`
- `docs/agents/state-agent.md`
- `docs/agents/problem-matrix-agent.md`
- `docs/agents/layer-gatekeeper-agent.md`
- `docs/agents/ui-layout-agent.md`
- `docs/agents/data-integrity-agent.md`
- `docs/agents/bi-semantic-agent.md`
- `docs/agents/target-agent.md`
- `docs/agents/deploy-agent.md`
- `docs/agents/qa-screenshot-agent.md`
- `docs/skills/airburg-task-execution-skill.md`
- `docs/skills/airburg-ui-layout-skill.md`
- `docs/skills/airburg-data-integrity-skill.md`
- `docs/skills/airburg-deploy-skill.md`
- `docs/skills/airburg-regression-skill.md`
- User master task: `AIRBURG_SAAS_UI_V2_PAGE_LEVEL_PRODUCT_BLUEPRINT_AND_IMPLEMENTATION_PIPELINE`
- User master task: `AIRBURG_SAAS_UI_V2_PLUGIN_ASSISTED_PRODUCT_DESIGN_AND_IMPLEMENTATION_PIPELINE`
- Airburg execution gatekeeper project references.

Current stage is documentation only.

Allowed files:

- `docs/product-blueprint-v2/AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2.md`
- `scripts/private-audit/validate-airburg-saas-product-ui-blueprint-v2.ts`

Forbidden in this stage:

- No business code.
- No V2 routes.
- No V2 components.
- No ETL, BI, Target, Runtime, Search dedup, Brand/Center, or Persistence change.
- No dependency change.
- No deploy.
- No `git add`, `git commit`, or `git push`.

Completion rule:

- After this blueprint and validator pass, stop.
- Next stage requires explicit user token: `APPROVE_BLUEPRINT_V2`.

## 1. 产品定位

Airburg SaaS V2 is a multi-platform ecommerce operating analysis SaaS for brand owners.

The product exists to answer one business question:

```text
当前品牌经营是否健康，问题出在哪个平台、店铺、系列、商品、搜索资产、目标或数据源？
```

Current Tmall V1 is the verified data foundation. V2 must keep the proven data chain and build a new productized UI on top of it.

V2 is not:

- A blank rewrite.
- A patch of legacy V1 pages.
- A formal multi-user production SaaS yet.
- An AI advisor product yet.

V2 is:

- A preview SaaS workspace.
- A product-level UI shell and page system.
- A future-ready structure for Tmall, JD, Douyin, Youzan, Pinduoduo, and later adapters.

## 2. 用户对象

Primary users:

- Brand owner or founder.
- Ecommerce operator.
- Store operator.
- Growth or ad operator.
- Data reviewer who checks upload quality and metric reliability.

Current V2 does not implement complex roles. The product may reserve account, tenant, brand, and user-preference concepts, but it must not build owner/operator/read-only permission logic in this stage.

## 3. SaaS 租户模型

Reserved hierarchy:

```text
Tenant / Workspace
  -> Account
    -> Brand
      -> Platform
        -> Store
          -> Series
            -> Product
```

Rules:

- One account can manage multiple brands.
- Current default is one store belongs to one brand.
- A tenant/workspace is the future isolation unit.
- Role permission is out of scope for V2 preview.
- Browser-side persistence remains a V1/V2 preview boundary unless a later server persistence task explicitly changes it.

Future multi-brand store expansion must use binding records instead of overloading store fields:

```text
StoreBrandBinding {
  platformCode
  storeId
  brandId
  status
}

ProductBrandBinding {
  platformCode
  storeId
  productId
  brandId
  status
}
```

Current V2 only reserves `StoreBrandBinding` and `ProductBrandBinding`. It must not implement a new persistence schema or ETL branch in this blueprint stage.

## 4. 账号多品牌模型

The account model must support multiple brands later, but current UI should not over-emphasize brand switching because early Airburg operation is single-brand first.

Required product behavior:

- Home is a brand cockpit, not a store page.
- Brand range should be a weak top-level control or advanced selector.
- Store and platform are scope controls under the current brand.
- Brand-level settings must not be confused with store-level targets or series/product configuration.

## 5. 品牌别名组

Airburg brand aliases must unify into one brand identity.

Canonical group:

```text
空气堡
Airburg
AIRBURG
```

Rules:

- Aliases support Chinese/English/case variants.
- Aliases feed brand search asset logic.
- Brand alias grouping is different from center-word grouping.
- UI must explain that alias grouping affects search and attribution, not raw source data.

## 6. 默认店铺单品牌策略

Current assumption:

- One Tmall store maps to one brand.
- A store has `platformCode`, `storeId`, `storeName`, and `brandId`.

Future expansion:

- If one store contains multiple brands, brand scope must be explicit.
- Until source data supports multi-brand store separation, UI must not pretend precise brand split is available.
- Multi-brand store support should be modeled by `StoreBrandBinding`.
- Product-level brand correction should be modeled by `ProductBrandBinding`.
- Chinese and English brand aliases continue to merge through the brand alias group, not through duplicated brand records.

## 7. Brand / Platform / Store / Series / Product / Keyword 数据模型

Minimum V2 domain model:

```text
Brand {
  brandId
  brandName
  aliasGroup
}

Platform {
  platformCode
}

Store {
  platformCode
  brandId
  storeId
  storeName
}

Series {
  platformCode
  brandId
  storeId
  seriesId
  seriesName
  productIds
}

Product {
  platformCode
  brandId
  storeId
  productId
  displayName?
  aliases?
}

KeywordAsset {
  brandWords
  centerWords
  aliasWords
  categoryWords
}
```

Rules:

- Series cannot be only `seriesName + productIds`.
- Series needs stable `seriesId`.
- Product analysis remains productId-first.
- Brand / center / alias / category words are search assets, not UI-only labels.
- UI must read BI/domain results and must not redefine business formulas.

## 8. 首页品牌经营驾驶舱

Route: `/v2/home`

Home is the brand operating cockpit.

Default scope:

- Current brand.
- All platforms under the brand.
- All stores under the brand.

Home must include:

- Compact brand / platform / store / time control area.
- Weak brand filter entry.
- Platform/store scope bar.
- Series custom entry.
- Product exclusion entry.
- Brand search asset entry.
- Target center entry.
- Data health entry.
- Full 17 metric grid.
- Key series GSV module.
- MTD / DLY charts.
- Dual-metric comparison controls.
- Data anomaly reminder.

Home must not become:

- A store-only page.
- A series detail page.
- A product detail page.
- A place for engineering labels.

Forbidden visible abstractions:

- `L1/L2/L3/L4`
- `Primary/Secondary/Hidden`
- `Hidden KPI`
- 5 KPI compression

## 9. 首页 17 指标展示、勾选、排序

Home must preserve 17 operating metrics:

1. GMV
2. GSV
3. 投入产出比
4. 去退费比
5. 直接成交占比
6. 品牌词访客
7. 品牌词支付人数
8. 品牌词支付占比
9. 退货率（总）
10. 发货退货率
11. 已签收退货率
12. 客单价
13. 转化率
14. 推广花费
15. 推广点击单价
16. MTD周转
17. 同区履约率

Each KPI card must support:

- Current value.
- MTD target.
- Total target.
- Delta.
- Completion rate.
- Progress bar.

Rules:

- Derived KPI still stays visible in the main grid.
- Unsupported target input does not mean the KPI is hidden.
- Missing values display `--`.
- Never use `0` to fake missing data.
- UI does not calculate metric formulas.

Future metric library:

- Users can choose visible metrics with checkboxes.
- Users can sort metrics.
- Sorting and visible choices can later be saved per brand or user.
- This future preference system must not hide the 17 metrics by default.

## 10. 首页重点系列 GSV 模块

Home can show 3-5 focus series.

This module displays only GSV target status for key series:

- Series name.
- GSV current value.
- MTD target.
- Total target.
- Delta.
- Completion rate.
- Progress.

It must not convert the whole home page into series data.

Full series analysis belongs to `/v2/series-board`.

## 11. 系列中心

Route: `/v2/series-board`

Series center must include:

- Series list.
- Create series.
- Edit series.
- Platform / brand / store ownership.
- Product ID maintenance.
- Series cards shown in a clear list.
- Current store related series.
- Series GMV / GSV / ROI / target completion.
- Series product contribution.
- Series search performance.
- Series trend chart.
- Relationship to home key series GSV module.

Rules:

- Series is not a simple UI filter.
- Series must distinguish `platformCode`, `brandId`, `storeId`, `seriesId`, `seriesName`, and `productIds`.
- Do not automatically convert all runtime products into series.
- ProductId-first must not regress.

## 12. 店铺经营中心

Route: `/v2/store-board`

Store center must include:

- Store selector or store list.
- Store-level operating metrics.
- Weak brand filter.
- Store comparison.
- Store target entry.
- Store trend.
- Series contribution under store.
- Product contribution under store.

Rules:

- Store page must not become home.
- Store scope is `platformCode + brandId + storeId`.
- Do not expose engineering terms such as `StoreRecord`.
- Do not mix target scope across stores.

## 13. 商品经营中心

Route: `/v2/product-board`

Product center must include:

- Manually followed product list.
- Product KPI.
- Product trend.
- Product search performance.
- Product after-sales.
- Product exclusion relation hint.
- Safe empty state when no product is selected.

Rules:

- Do not restore “所有宝贝”.
- Do not show all runtime products by default.
- Product analysis must remain productId-first.
- Do not expose `ProductRecord` or `TrackedProductRecord`.

## 14. 商品排除中心

Route: `/v2/exclusion-rules`

Exclusion center owns product and text exclusion configuration.

Supported rule types:

- Product ID exclusion.
- Multi-text exclusion.

Use cases:

- Remove test products.
- Exclude internal products.
- Exclude abnormal products.
- Exclude transactions only when the source data supports reliable filtering.

Rules:

- Exclusion rules must not rewrite raw data.
- Unsupported fields must not be shown as effective filters.
- UI must show clear source capability status.
- Product ID exclusion affects product-level operating data and derived product / series / store / brand summaries only where supported by the BI/domain layer.
- Multi-text exclusion only takes effect when the uploaded source contains the relevant text field.
- If order or remark fields are absent, show `当前数据源不支持该过滤`.
- Exclusion configuration must never display or persist after-sales sensitive text.

## 15. 多文本排除和数据源可用性

Multi-text exclusion may refer to:

- Product title.
- Order detail.
- After-sales detail.
- Buyer note.
- Merchant remark.
- Logistics text.
- Other recognizable text fields.

But if the current uploaded data source does not contain a field, the UI must show:

```text
当前数据源不支持该过滤
```

Rules:

- Do not pretend a missing field is filtered.
- Do not display raw sensitive text.
- Do not persist raw note, remark, address, phone, logistics, order number, refund number, or transaction number.
- Multi-text exclusion must expose data-source availability before accepting a rule.

## 16. 品牌词支付占比

V2 user-facing name:

```text
品牌词支付占比
```

This replaces the confusing "GEO搜索占比" wording in V2 product copy.

Definition:

```text
品牌词支付占比 = 品牌词支付人数 / 总搜索词支付人数
```

Explanation:

- The denominator is search-keyword paid buyers.
- This is not necessarily full-store unique buyer share.
- The metric is a search asset signal, not a platform GEO capability label.

## 17. 品牌搜索资产

Route: `/v2/search-assets`

Search assets structure:

```text
Brand
  -> Series
    -> Product
      -> brand words
      -> center words
      -> alias words
      -> category words
```

Search assets page must include:

- Brand alias groups.
- Chinese and English alias unification.
- Brand words.
- Center words.
- Alias words.
- Category words.
- Brand-word paid share.
- Series keyword comparison.
- Product keyword comparison.

Rules:

- Brand words and center words must be distinct but unified under search asset management.
- Center word grouping must support P1 / P2 / P300 / ZEN and future product families.
- Do not expose resolver internals as user-facing engineering language.

## 18. 目标中心

Route: `/v2/target-center`

Target center centralizes:

- Brand targets.
- Platform targets.
- Store targets.
- Series targets.
- Product targets.

Pages display target results. Complex target configuration belongs in target center.

Rules:

- Required targets are input.
- Derived targets are displayed, not input.
- Unsupported target inputs are hidden or explained in a collapsed information area.
- Targets affect only MTD target, total target, delta, completion, and progress display.
- Targets never change real GMV, GSV, ROI, after-sales, search, or direct-transaction data.
- Target drafts must not enter runtime dataset.

## 19. MTD 自然日线性

Current MTD target uses natural-day linear progress.

Formula:

```text
MTD target = total target * elapsed days in current period / total days in current period
```

Rules:

- Day mode uses day target.
- Week mode uses week-to-date target.
- Month mode uses month-to-date target.
- Custom mode uses proportional target for the selected range.
- Activity targets are out of scope and should become a later activity module.

Custom-range target rule:

- Custom range can be at most 1 year.
- Custom target should first accumulate or proportionally convert targets that cover the selected period.
- If no target covers the selected period, display `--`.
- Do not generate target values from nowhere.
- Do not use `0` to fake a missing target.

## 20. 时间系统：日 / 周 / 月 / 最长 1 年自定义 / 同比 / 环比

V2 time system supports:

- Day.
- Week.
- Month.
- Custom range.
- Year-over-year comparison.
- Month-over-month or previous-period comparison.

Custom range rule:

- Max custom range is 1 year.

Time affects:

- Current value.
- MTD target.
- Completion rate.
- Charts.
- Comparison.
- Data health interpretation.

Controls must stay compact and must not occupy the main visual area.

Target behavior in custom time mode:

- Current value follows the selected date range.
- MTD target follows natural-day linear progress within the selected period.
- Total target uses the covered period target when available.
- Missing target stays `--`.

## 21. MTD / DLY 图表

Chart requirements:

- Keep MTD and DLY views.
- Hover by date.
- Tooltip responds quickly.
- Tooltip shows date and selected metric values.
- DLY must not overflow horizontal or vertical axes.
- Dates such as 6/26 must stay inside chart bounds.
- Missing values are not drawn as zero.
- Empty state must not draw a fake zero line.
- No `NaN`, `undefined`, or `Infinity`.
- Chart follows current `timeRange` and current scope.

## 22. 双指标图表可比性规则

Recommended pairs:

- GMV vs GSV.
- GSV vs 推广花费.
- GSV vs 退款金额.
- 访客 vs 支付买家.
- 品牌词访客 vs 品牌词支付人数.
- 点击量 vs 支付买家.
- 退货率 vs 去退费比.
- 发货退货率 vs 已签收退货率.

Possible dual-axis pairs:

- GSV vs 转化率.
- 推广花费 vs ROI.
- 访客 vs 转化率.

Not recommended:

- 客单价 vs 访客.
- 推广点击单价 vs GMV.
- ROI vs 支付买家.

Rules:

- UI may suggest pairings.
- UI must not invent metric formulas.
- Pairing controls must not duplicate values already shown in KPI cards.

## 23. 上传自动识别 + 标准模板兜底

Route: `/v2/upload`

Primary path:

- User uploads raw platform files.
- Runtime identifies source type.
- UI shows safe `success / failed / skipped`.
- Stable status phrase for validators and copy review: success / failed / skipped.
- UI shows safe issue codes.

Fallback path:

- Standard templates.
- Required and optional field explanations.
- Stable fallback phrase for validators and copy review: standard templates.

Standard template groups:

- Product operating template.
- Order detail template.
- After-sales detail template.
- Search keyword template.
- Promotion template.

Field rules:

- Required fields: missing means the file cannot be identified or used.
- Optional fields: missing means related metrics display `--`.

Upload must not show:

- Real raw file contents.
- Raw file rows.
- `rawRows`.
- `previewRows`.
- Raw warning text.
- After-sales sensitive detail.
- Original file-name history in persisted business data.

Future standard template contract deliverable:

```text
AIRBURG_STANDARD_TEMPLATE_FIELD_CONTRACT_V1
```

This deliverable must define required and optional fields, aliases, mappings, and missing-field impact for:

- Product operating template.
- Order detail template.
- After-sales detail template.
- Search keyword template.
- Promotion template.

This blueprint does not implement the contract. It only reserves the deliverable and prevents template fallback from becoming undocumented ETL behavior.

## 24. 数据覆盖健康中心

Route: `/v2/data-health`

The data coverage health center replaces continued patching of old history and quality pages.

It must show:

- Which day is missing data.
- Which report is missing for each day.
- Which day had duplicate upload.
- Which day had skipped files.
- Which day has non-computable metrics.
- Safe issue code.
- Data coverage calendar.
- Source coverage summary.
- Stable data health anchors: data coverage calendar, duplicate upload, non-computable metrics, safe issue code.

Duplicate upload V1 behavior:

- Show duplicate upload failure or warning.

Later capabilities:

- Overwrite upload.
- Version management.
- Rollback.

Current data health page is read-only and shows safe summaries only.

## 25. AI 顾问延期

V2 does not implement AI advisor now.

Reason:

- Basic pages and data chain must be stable first.
- Search assets, target center, upload, and data health must become reliable before advice automation.
- AI advice must not be connected to incomplete or ambiguous source data.

Later AI advisor must have separate evidence, official/platform source handling, and risk controls.

## 26. V2 路由规划

Create independent V2 routes:

- `/v2/home`
- `/v2/store-board`
- `/v2/series-board`
- `/v2/product-board`
- `/v2/upload`
- `/v2/data-health`
- `/v2/target-center`
- `/v2/search-assets`
- `/v2/exclusion-rules`

Implementation directories:

- `app/(workspace-v2)/**`
- `components/saas-v2/**`
- `docs/product-blueprint-v2/**`

Legacy routes remain:

- `/home`
- `/series-board`
- `/store-board`
- `/product-board`
- `/upload`
- `/upload/history`
- `/upload/quality`

Do not replace legacy routes until explicit user approval.

Actual Next.js route file plan:

- `app/(workspace-v2)/v2/home/page.tsx`
- `app/(workspace-v2)/v2/store-board/page.tsx`
- `app/(workspace-v2)/v2/series-board/page.tsx`
- `app/(workspace-v2)/v2/product-board/page.tsx`
- `app/(workspace-v2)/v2/upload/page.tsx`
- `app/(workspace-v2)/v2/data-health/page.tsx`
- `app/(workspace-v2)/v2/target-center/page.tsx`
- `app/(workspace-v2)/v2/search-assets/page.tsx`
- `app/(workspace-v2)/v2/exclusion-rules/page.tsx`

## 27. 开源模板使用原则

Before V2 shell implementation, run license audit.

Preferred sources:

- MIT / Apache / clearly commercial-allowed templates.
- shadcn/ui blocks.
- Tremor.
- TailAdmin or similar React + Tailwind commercial-allowed templates.

Rules:

- Do not scrape random website source code.
- Do not copy GPL template code into the commercial SaaS project.
- GPL templates are visual reference only unless the user explicitly accepts licensing risk.
- Do not copy unauthorized commercial website code.
- Do not add dependencies without user confirmation.
- Do not modify `package.json` without user confirmation.

Open-source template source for this stage:

- None used. Template selection is deferred to `OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2`.

Plugin-assisted design workflow:

- Product Design plugin is for prototype generation only.
- Product Design plugin must not directly modify production code.
- If Product Design plugin is unavailable in the current Codex environment, output `PRODUCT_DESIGN_PLUGIN_UNAVAILABLE` and stop the prototype stage.
- Build Web Apps plugin can be used only after user-confirmed prototype and template choice.
- If Build Web Apps plugin is unavailable, output `BUILD_WEB_APPS_PLUGIN_UNAVAILABLE` and continue only with ordinary Codex implementation after required confirmations.
- Vercel plugin can be used only after explicit preview-deploy authorization and must not replace ECS or legacy routes.
- Plugin output is not a substitute for this blueprint, license audit, template selection plan, validation, or user approval.

Template selection must be a separate stage:

```text
AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PLAN
```

Do not create V2 shell until `APPROVE_TEMPLATE_SELECTION_V2`.

## 28. Codex 实施边界

Codex is the engineering executor.

Codex is not:

- Product manager.
- Product designer.
- License decision owner.
- Business formula owner.

Codex must:

- Read the blueprint.
- Read and obey the UI Design Authority Lock.
- Read the template/license audit before UI implementation.
- Read the Product Design prototype result before implementation.
- Read the template selection plan before implementation.
- Read user confirmation results before each next phase.
- Preserve V1 legacy UI.
- Preserve ETL, BI, Target, Runtime, Search dedup, Brand/Center semantics, and Persistence schema unless explicitly authorized.
- Stop after each whole-page stage and wait for the matching approval token.

Codex must not invent:

- `L1/L2/L3/L4`
- `Primary/Secondary/Hidden`
- `Hidden KPI`
- 5 KPI compression
- New metric formulas
- New target formulas
- New data persistence schemas
- Page layout
- Template choice
- Dependency additions

UI Design Authority Lock:

- Codex does not own UI design decisions.
- Codex cannot autonomously decide page layout.
- Codex cannot autonomously choose templates and directly implement.
- Codex cannot skip Product Design prototype confirmation.
- Codex cannot skip license audit.
- Codex cannot skip template selection confirmation.
- Codex cannot hide KPI cards or compress metrics.
- Codex cannot replace legacy routes.
- Codex must output `BLOCKED` if asked to implement UI before required confirmation tokens.

Percent target format rule:

- Input may accept `92`, `92%`, or `0.92`.
- UI must display these consistently as `92%`.
- Internal normalized value may be stored as `0.92` where target logic needs normalized decimals.
- UI must not display `9.200%`.
- This applies to 直接成交占比、转化率、退货率、品牌词支付占比 and other percent targets.
- This is a display/input contract and must not change BI formulas in this blueprint stage.

## 29. 旧 UI legacy 策略

Legacy V1 remains the public safety baseline.

Legacy UI is not deleted, replaced, or silently redirected.

V2 starts as preview routes under `/v2/*`.

Route switching can happen only after:

1. V2 local full regression.
2. V2 preview deployment.
3. User page-by-page human review.
4. Explicit user authorization to replace or promote routes.

## 30. 后续实施阶段

The confirmed implementation pipeline:

1. `AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_REBASE_FROM_LATEST_RULES`
   - Output the initial latest-rules blueprint and validator.
2. `AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_CLARIFICATION_PATCH_AND_UI_DESIGN_AUTHORITY_LOCK`
   - Add StoreBrandBinding, target range, exclusion, route path, template contract, percent format, plugin workflow, template selection, deploy approval, and UI authority lock clarifications.
   - Stop for `APPROVE_BLUEPRINT_V2`.
3. `PRODUCT_DESIGN_PLUGIN_PROTOTYPE_FOR_AIRBURG_SAAS_V2`
   - Use Product Design plugin if available.
   - If unavailable, output `PRODUCT_DESIGN_PLUGIN_UNAVAILABLE` and stop.
   - Stop for `APPROVE_PRODUCT_DESIGN_PROTOTYPE_V2`.
4. `OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2`
   - Audit template licenses.
   - Stop for `APPROVE_TEMPLATE_AUDIT_V2`.
5. `AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PLAN`
   - Choose template strategy from blueprint, prototype, and license audit.
   - Stop for `APPROVE_TEMPLATE_SELECTION_V2`.
6. `CREATE_AIRBURG_SAAS_UI_V2_SHELL`
   - Create independent V2 shell.
   - Stop for `APPROVE_UI_SHELL_V2`.
7. `BUILD_AIRBURG_SAAS_HOME_V2_BRAND_COCKPIT`
   - Complete `/v2/home`.
   - Stop for `APPROVE_HOME_V2`.
8. `BUILD_AIRBURG_SAAS_SERIES_V2_CENTER`
   - Complete `/v2/series-board`.
   - Stop for `APPROVE_SERIES_V2`.
9. `BUILD_AIRBURG_SAAS_STORE_V2_CENTER`
   - Complete `/v2/store-board`.
   - Stop for `APPROVE_STORE_V2`.
10. `BUILD_AIRBURG_SAAS_PRODUCT_V2_CENTER`
   - Complete `/v2/product-board`.
   - Stop for `APPROVE_PRODUCT_V2`.
11. `BUILD_AIRBURG_SAAS_UPLOAD_AND_DATA_HEALTH_V2`
   - Complete `/v2/upload` and `/v2/data-health`.
   - Stop for `APPROVE_UPLOAD_DATA_HEALTH_V2`.
12. `BUILD_AIRBURG_SAAS_TARGET_CENTER_V2`
   - Complete `/v2/target-center`.
   - Stop for `APPROVE_TARGET_CENTER_V2`.
13. `BUILD_AIRBURG_SAAS_SEARCH_ASSETS_AND_EXCLUSION_RULES_V2`
    - Complete `/v2/search-assets` and `/v2/exclusion-rules`.
    - Stop for `APPROVE_SEARCH_ASSETS_EXCLUSION_V2`.
14. `AIRBURG_SAAS_UI_V2_LOCAL_FULL_REGRESSION`
    - Validate all V2 pages locally.
    - Stop for `APPROVE_V2_LOCAL_REGRESSION`.
15. `DEPLOY_AIRBURG_SAAS_UI_V2_PREVIEW`
    - Deploy `/v2/*` preview routes only.
    - Requires explicit `APPROVE_DEPLOY_V2_PREVIEW`.
    - Stop for user page-by-page human review.

Global rule:

- No confirmation token, no next stage.
- V2 local full regression cannot auto-deploy.
- Preview deployment requires explicit `APPROVE_DEPLOY_V2_PREVIEW`.

## 31. Validation Contract

This blueprint is valid only if:

- The validator passes.
- `npm run lint` passes.
- `npm run build` passes.
- Only the blueprint and validator files are changed.
- Business code remains untouched.

Expected output:

```text
AIRBURG_SAAS_PRODUCT_UI_BLUEPRINT_V2_CLARIFICATION_PATCH_STATUS:
PASS
```

Then stop and wait for:

```text
APPROVE_BLUEPRINT_V2
```

## 32. Autonomous Plugin Install And Design Package V1 Execution Record

Task:

```text
AIRBURG_SAAS_UI_V2_AUTONOMOUS_PLUGIN_INSTALL_AND_DESIGN_PACKAGE_V1
```

Execution status:

```text
DESIGN_PACKAGE_LOCAL_VALIDATED
```

Plugin discovery result:

- Product Design plugin: not available as a callable tool or exact install candidate in this Codex session.
- Build Web Apps plugin: not available as a callable tool or exact install candidate in this Codex session.
- Vercel plugin: not available as a callable tool or exact install candidate in this Codex session.
- Canva and Figma: visible as install candidates, but not installed or used because they are not Product Design substitutes and require user authorization for prototype-carrier use.

Fallback:

```text
template_first_fallback
```

Generated planning documents:

- `docs/product-blueprint-v2/PLUGIN_AVAILABILITY_REPORT_FOR_AIRBURG_SAAS_V2.md`
- `docs/product-blueprint-v2/PRODUCT_DESIGN_PROTOTYPE_FOR_AIRBURG_SAAS_V2.md`
- `docs/product-blueprint-v2/OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2.md`
- `docs/product-blueprint-v2/AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PREPLAN.md`

Generated validator:

- `scripts/private-audit/validate-airburg-saas-ui-v2-autonomous-plugin-install-and-design-package-v1.ts`

Boundary:

- No business code changed.
- No `/v2` routes created.
- No dependencies added.
- No deployment.
- No `git add`, `git commit`, or `git push`.

Next confirmation token:

```text
APPROVE_DESIGN_PACKAGE_V2
```

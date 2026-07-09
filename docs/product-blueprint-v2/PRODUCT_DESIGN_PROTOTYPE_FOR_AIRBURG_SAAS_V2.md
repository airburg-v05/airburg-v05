# Product Design Prototype For Airburg SaaS V2

Task: `AIRBURG_SAAS_UI_V2_AUTONOMOUS_PLUGIN_INSTALL_AND_DESIGN_PACKAGE_V1`

Prototype status:

```text
PRODUCT_DESIGN_PLUGIN_UNAVAILABLE_AFTER_INSTALL_ATTEMPT
```

## Decision

No Product Design-native prototype was generated in this session.

Reason:

- Product Design plugin was not exposed as a callable tool through `tool_search`.
- Product Design plugin was not present in `list_available_plugins_to_install`.
- No exact official/trusted Product Design install candidate was available, so `request_plugin_install` was not called.
- Ordinary Codex cannot substitute for Product Design plugin output because the blueprint explicitly separates product design authority from engineering execution.

## Attempts

| step | result |
|---|---|
| Search callable Product Design tools | no matching Product Design callable tool exposed |
| Search install candidates | Product Design not present |
| Install attempt | not executable because no exact Product Design candidate existed |
| Enable attempt | not executable because no installed Product Design plugin existed |
| External authorization | not applicable for Product Design; no plugin surfaced an auth flow |
| Fallback | entered `template_first_fallback` automatically |

## Required Prototype Pages If Product Design Becomes Available

Minimum Product Design prototype scope:

- `/v2/home`: 品牌经营驾驶舱
- `/v2/series-board`: 系列中心
- `/v2/upload`: 上传页
- `/v2/data-health`: 数据覆盖健康中心

Preferred extended prototype scope:

- `/v2/target-center`: 目标中心
- `/v2/search-assets`: 品牌搜索资产
- `/v2/exclusion-rules`: 商品排除规则
- `/v2/store-board`: 店铺经营中心
- `/v2/product-board`: 商品经营中心

## Fallback Flow

The session continues with:

- `OPEN_SOURCE_UI_TEMPLATE_LICENSE_AUDIT_FOR_AIRBURG_SAAS_V2`
- `AIRBURG_SAAS_UI_V2_TEMPLATE_SELECTION_PREPLAN`

This fallback is a planning package only. It is not a UI implementation and must not create `/v2` routes, add dependencies, or modify legacy pages.

## Risks

- No Product Design visual artifact, screenshot, or link exists for this stage.
- Template-first work may provide reliable implementation scaffolding, but it is not a replacement for a dedicated product design review.
- Human review remains required before V2 UI Shell implementation.

## Next Confirmation

Proceed only after:

```text
APPROVE_DESIGN_PACKAGE_V2
```

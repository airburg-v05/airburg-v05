# Context Pack

## Direct Request

宗骥 requested a compact redesign of the series center, pasted-product-ID series creation/editing, the home-aligned 17 metrics and chart for a selected series, equivalent simplification for store/product pages, investigation of a missing June target, and confirmation that comparison unavailability is caused by sparse data.

## Current Truth

- Public baseline: `http://123.57.49.121/v2/home`, deployed implementation commit `52cff7bc753743a6aca303c79adfcd1b6b2d29d0`.
- Repository baseline for this increment: `2cc99c5`.
- The current browser shows an active range of `2026-06-29` through `2026-07-05` and no targets on home.
- `targetMonthForRange` returns `null` whenever start/end months differ, so every target load is skipped for this range.
- Current operating data does not contain prior-year or immediately preceding reference-period dates; YoY/MoM unavailability is expected.
- Existing home 17-metric contracts and chart component are the required UI/data baseline.

## Authority Order

1. Latest direct request from 宗骥.
2. Current runtime, target and metric contracts in code.
3. `docs/project/PROJECT_SSOT.json` and current task evidence.
4. Historical summaries and older validators.

## Inferences

- “17 个数据同步筛选系列” means the selected series scopes the existing metric contracts; unsupported source metrics stay `--` rather than being fabricated.
- Cross-month target display must aggregate prorated monthly targets for MTD. A single monthly “总目标” is only truthful for one-month ranges.
- “多余没提到的全部先去除” authorizes removing supplementary contribution, status and target tables from the three board pages while preserving underlying data contracts.

## Open Owner Gate

The final visual density, wording and practical usefulness require post-deploy review by 宗骥. Technical checks cannot set `visualAccepted` or `humanAccepted`.

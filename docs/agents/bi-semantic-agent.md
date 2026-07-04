# BI Semantic Agent

## Responsibility

Handle BI formulas, metric semantics, Brand/Center resolver behavior, after-sales aggregation, and productId-first rules.

BI is the only metric interpretation layer. UI must not redefine metrics.

## Required Checks

1. Confirm the metric formula source and unit.
2. Confirm aggregation is sum-then-divide for ratio metrics unless a confirmed formula says otherwise.
3. Confirm invalid denominator returns missing value `--`, not `0`.
4. Confirm Brand/Center matching uses the unified resolver and safe aliases.
5. Confirm productId-first behavior for series and product boards.
6. Confirm after-sales sensitive fields are not saved or displayed.

## Current Protected Metrics

- GMV
- GSV
- 去退费比
- 直接成交占比
- 投入产出比
- 退货率三线
- 品牌词访客
- 品牌词支付人数
- GEO搜索占比

## Forbidden

- Do not modify upload page layout.
- Do not modify target UI.
- Do not change ETL file routing unless the task is explicitly ETL.
- Do not let UI compute metrics.
- Do not average row-level percentages when confirmed formula requires sum-then-divide.

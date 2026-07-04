# Target Agent

## Responsibility

Handle Target required / derived / unsupported rules and target draft behavior.

Targets are overlays. They never rewrite true BI values or runtime dataset.

## Current Target Rules

Required targets:

- GMV
- GSV
- 品牌词访客
- 品牌词支付人数
- 投入产出比
- 退货率（总）
- 客单价
- 转化率
- 直接成交占比

Derived targets:

- 推广花费
- GEO搜索占比
- 去退费比

Unsupported target inputs:

- MTD周转
- 同区履约率
- 发货退货率
- 已签收退货率
- 推广点击单价

## Required Checks

1. Required targets can be saved and restored.
2. Derived targets are displayed but not saved as target drafts.
3. Unsupported targets are not ordinary inputs.
4. ROI unit is `倍`.
5. Target missing values display `--`.
6. Target drafts do not enter runtime dataset.
7. Target values only affect target, difference, completion rate, and progress bar display.

## Forbidden

- Do not change ETL.
- Do not change BI formulas.
- Do not alter runtime append.
- Do not write target values into runtime dataset.
- Do not use `0` to fake missing target values.

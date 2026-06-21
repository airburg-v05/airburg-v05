# 天猫目标设置规则 V1

## 1. 当前定位

V0.4C-1 是天猫四源本地分析平台的“目标设置数据模型与本地存储基础版”。

当前阶段只建立目标配置、目标校验、目标实际值计算和目标完成率 ViewModel，不开发目标设置页面，不开发目标完成率 UI，不接 AI，不接数据库，不接后端接口，不接自动平台 API。

目标设置建立在 V0.4B 多日趋势基础版之后，不得修改 V0.4B 趋势口径，不得修改四源底层解析、聚合、关联和正式指标口径。

## 2. 目标 Scope

支持 3 类目标范围：

1. `store`：店铺目标。
   - 不需要 `productId`。
   - 不需要 `seriesId`。

2. `product`：宝贝目标。
   - 必须保存 `productId`。
   - `productId` 按字符串保存。
   - 不保存商品名称，不复制商品明细。

3. `series`：系列目标。
   - 必须保存 `seriesId`。
   - `seriesId` 对应 `airburg_tmall_series_groups_v1` 中的系列 id。
   - 不复制系列商品名称、商品列表或商品原始数据。

## 3. 目标周期

支持 2 类周期：

1. `daily`
   - `periodValue` 格式：`YYYY-MM-DD`。
   - 只匹配该日期数据。
   - 示例：`2026-06-18`。

2. `monthly`
   - `periodValue` 格式：`YYYY-MM`。
   - 汇总该月份已上传日期的数据。
   - 当前不做 MTD/DLY。
   - 当前不做月度预测。
   - 当前不按自然月天数补齐。
   - 当前不自动拆解日目标。
   - ViewModel 需要返回 warning：月度目标仅基于已上传日期计算。

## 4. 支持目标指标

当前支持以下目标指标：

1. GMV。
2. GSV。
3. 商品访客数。
4. 支付买家数。
5. 支付转化率。
6. 客单价。
7. 退款率。
8. 推广花费。
9. 推广投入产出比。
10. 推广费比。
11. 去退推广费比。

目标指标必须使用中文业务化定义，不向页面层暴露原始字段名、文件名、售后敏感字段或 localStorage key。

## 5. 指标方向

`higher_is_better`：

1. GMV。
2. GSV。
3. 商品访客数。
4. 支付买家数。
5. 支付转化率。
6. 客单价。
7. 推广投入产出比。

`lower_is_better`：

1. 退款率。
2. 推广花费。
3. 推广费比。
4. 去退推广费比。

## 6. 目标实际值来源

店铺目标：

1. 经营类指标来自 `productDailyFacts`。
2. 推广类指标来自 `adPlanDailyFacts`。

宝贝目标：

1. 经营类指标来自 `productDailyFacts`。
2. 推广类指标来自 `adProductDailyFacts`。
3. 必须按 `productId` 字符串过滤。
4. 不得使用 `adPlanDailyFacts` 计算宝贝推广目标。
5. 没有推广数据时返回 `null`，不得显示为 0。

系列目标：

1. 经营类指标来自系列商品 ID 对应的 `productDailyFacts`。
2. 推广类指标来自系列商品 ID 对应的 `adProductDailyFacts`。
3. `seriesId` 必须能匹配系列分组。
4. 未匹配到系列分组时返回 `null` 并给出 warning。
5. 不得使用 `adPlanDailyFacts` 计算系列推广目标。
6. 不复制商品名称，不删除未匹配商品 ID。

## 7. 指标公式

经营类：

1. GMV = `sum(gmv)`。
2. GSV = `sum(gsv)`。
3. 商品访客数 = `sum(visitors)`。
4. 支付买家数 = `sum(paidBuyers)`。
5. 支付转化率 = `sum(paidBuyers) / sum(visitors)`。
6. 客单价 = `sum(gmv) / sum(paidBuyers)`。
7. 退款率 = `sum(refundSuccessAmount) / sum(gmv)`。

推广类：

1. 店铺推广花费 = `sum(adPlanDailyFacts.adSpend)`。
2. 宝贝推广花费 = `sum(adProductDailyFacts.adSpend)`。
3. 系列推广花费 = `sum(系列商品 ID 对应 adProductDailyFacts.adSpend)`。
4. 店铺推广 ROI = `sum(adPlanDailyFacts.transactionAmount) / sum(adPlanDailyFacts.adSpend)`。
5. 宝贝推广 ROI = `sum(adProductDailyFacts.adTransactionAmount) / sum(adProductDailyFacts.adSpend)`。
6. 系列推广 ROI = `sum(系列商品 ID 对应 adProductDailyFacts.adTransactionAmount) / sum(系列商品 ID 对应 adProductDailyFacts.adSpend)`。
7. 推广费比 = 推广花费 / GMV。
8. 去退推广费比 = 推广花费 / GSV。

安全规则：

1. 分母为 0 返回 `null`。
2. 不返回 `NaN`。
3. 不返回 `Infinity`。
4. 不返回 `undefined`。
5. 比率类指标必须重算，不能平均。
6. 缺失数据返回 `null`，不用 0 伪装。

## 8. 完成率计算规则

`higher_is_better`：

1. `progressRate = actualValue / targetValue`。
2. `gapValue = targetValue - actualValue`。
3. `actualValue = null`：`missing_actual`。
4. `progressRate >= 1`：`achieved`。
5. `progressRate >= 0.8 且 < 1`：`in_progress`。
6. `progressRate < 0.8`：`at_risk`。

`lower_is_better`：

1. `progressRate = targetValue / actualValue`。
2. `gapValue = actualValue - targetValue`。
3. `actualValue = null`：`missing_actual`。
4. `actualValue <= targetValue`：`achieved`。
5. `actualValue <= targetValue * 1.2`：`in_progress`。
6. `actualValue > targetValue * 1.2`：`at_risk`。
7. `actualValue = 0` 时必须安全处理，不得返回 `Infinity`。

特殊规则：

1. `status = paused` 的目标直接返回 `paused`。
2. `targetValue` 非法返回 `invalid_target`。
3. `progressRate` 不得为 `NaN` 或 `Infinity`。
4. `gapValue` 不得为 `NaN` 或 `Infinity`。
5. 无法计算时返回 `null`。

## 9. 目标存储规则

目标设置使用独立 localStorage key：

`airburg_tmall_targets_v1`

目标存储只保存目标配置：

1. `version`。
2. `targets`。

目标存储不得保存：

1. 原始报表。
2. `rows`。
3. `previewRows`。
4. 售后敏感信息。
5. 四源分析结果副本。
6. 商品名称。
7. 系列商品列表副本。
8. API key。

损坏状态规则：

1. 空值返回 `empty`。
2. 非法 JSON 返回 `corrupted`。
3. 合法 JSON 但结构不对返回 `corrupted`。
4. `version` 不等于 `tmall_targets_v1` 返回 `corrupted`。
5. `targets` 不是数组返回 `corrupted`。
6. target 缺少必填字段返回 `corrupted`。
7. `targetValue` 非有限正数返回 `corrupted`。
8. 不自动删除损坏数据。

## 10. 当前不做

当前阶段不做：

1. 目标设置页面。
2. 目标完成率 UI。
3. 店铺目标设置页面。
4. 宝贝目标设置页面。
5. 系列目标设置页面。
6. MTD/DLY。
7. 月度预测。
8. AI 分析。
9. 数据库。
10. 后端接口。
11. 自动平台 API。
12. 新增图表库。

## 11. 冻结边界

目标设置阶段不得修改：

1. V0.4B 趋势口径。
2. 趋势状态规则。
3. 四源解析规则。
4. GB18030 解码。
5. 商品、计划、售后关联规则。
6. 正式指标口径。
7. `airburg_tmall_analysis_v2` 存储结构。
8. `airburg_tmall_series_groups_v1` 存储结构。
9. `runTmallFourSourceAnalysis`。
10. 四源解析器。
11. 四源聚合器。
12. package 依赖。

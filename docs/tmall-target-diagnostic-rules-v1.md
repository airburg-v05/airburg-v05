# 天猫目标诊断提示规则 V1

## 1. 规则定位

V0.4D-1 是目标诊断提示规则底层。它只把 V0.4C 已经计算好的目标完成情况转换成运营可读的规则提示，不修改目标完成率口径，不修改趋势口径，不修改四源解析和聚合逻辑。

本阶段不接入页面，不调用 AI，不做预测，不生成长篇报告。

## 2. 输入来源

目标诊断输入来自：

1. `TmallTargetProgress[]`
2. `buildTmallTargetProgress`
3. `getTmallTargetMetricDefinition`
4. `airburg_tmall_targets_v1` 中的目标定义
5. `airburg_tmall_analysis_v2` 中的安全聚合结果
6. `airburg_tmall_series_groups_v1` 中的系列 ID 与商品 ID 关系

诊断层不得直接读取 `localStorage`，不得访问 `window`、`document`、文件系统或网络。

## 3. 输出结构

输出为 `TmallTargetDiagnosticSummary`：

1. `scope`
2. `totalDiagnosticCount`
3. `criticalCount`
4. `warningCount`
5. `infoCount`
6. `successCount`
7. `items`
8. `notices`

单条诊断 `TmallTargetDiagnosticItem` 只允许输出：

1. `targetId`
2. `targetName`
3. `scope`
4. `metricKey`
5. `metricLabel`
6. `severity`
7. `category`
8. `status`
9. `title`
10. `message`
11. `suggestion`
12. `actualValue`
13. `targetValue`
14. `progressRate`
15. `gapValue`
16. `unit`

## 4. 诊断 Severity

1. `critical`：目标值异常，需要先修正目标。
2. `warning`：目标存在风险，需要运营关注。
3. `info`：暂无实际值、接近达成、暂停或待观察。
4. `success`：目标已达成。

## 5. 诊断 Category

1. `invalid_target`
2. `missing_actual`
3. `paused`
4. `sales`
5. `traffic`
6. `conversion`
7. `refund`
8. `ad_spend`
9. `ad_roi`
10. `ad_spend_rate`
11. `normal`

`target_gap` 保留给后续更细颗粒度的缺口诊断，本阶段不强制使用。

## 6. Status 到诊断的映射

1. `at_risk`：`severity = warning`，标题为“目标存在风险”，分类按指标决定。
2. `missing_actual`：`severity = info`，`category = missing_actual`，标题为“暂无实际值”。
3. `invalid_target`：`severity = critical`，`category = invalid_target`，标题为“目标值异常”。
4. `in_progress`：`severity = info`，`category = normal`，标题为“目标接近达成”。
5. `achieved`：`severity = success`，`category = normal`，标题为“目标已达成”。
6. `paused`：默认不进入诊断列表；`includePaused = true` 时输出 `severity = info`、`category = paused`。

## 7. MetricKey 到建议语的映射

1. `gmv` / `gsv`：检查核心商品销售、活动节奏、价格竞争力和转化承接。
2. `visitors`：检查搜索、推荐、付费引流和内容曝光。
3. `paidBuyers`：检查访客质量、成交路径、价格和活动门槛。
4. `conversionRate`：检查主图、价格、详情页、评价、优惠和客服承接。
5. `avgOrderValue`：检查套装、加购搭配、满减门槛和高客单商品曝光。
6. `refundRate`：检查售后原因、商品承诺、物流体验和详情页预期。
7. `adSpend`：推广花费超目标，检查高花费低成交计划、商品和人群。
8. `adRoi`：ROI 未达目标，检查点击成本、成交金额和转化效率。
9. `adSpendRate`：推广费比偏高，检查投放结构和自然成交占比。
10. `adSpendRateAfterRefund`：去退推广费比偏高，需同时关注退款和推广效率。

## 8. 无推广商品 / 无推广系列规则

宝贝和系列推广目标只使用商品推广报表。

当宝贝或系列推广类目标 `actualValue = null` 时：

1. `status = missing_actual`
2. `severity = info`
3. 文案说明暂无商品推广实际值
4. 不允许把暂无推广显示或解释为 0
5. 不允许建议使用计划推广数据补齐宝贝或系列目标

## 9. 排序规则

默认最多输出 8 条诊断。

排序优先级：

1. `invalid_target`
2. `at_risk`
3. `missing_actual`
4. `in_progress`
5. `achieved`
6. `paused`

同一状态内：

1. `progressRate` 越低越靠前。
2. `progressRate = null` 靠后。
3. `targetName` 按中文排序兜底。

## 10. 安全边界

诊断层不得输出：

1. 原始 rows
2. previewRows
3. 售后敏感字段
4. 售后敏感字段值
5. 文件名
6. localStorage key
7. 订单号
8. 退款编号
9. 手机号
10. 地址
11. 物流信息
12. 买家退款说明
13. 商家备注
14. 商品名称作为主键
15. 系列商品列表

所有数字必须是 finite number 或 `null`，不得输出 `NaN`、`Infinity` 或 `undefined`。

## 11. 当前不做

1. AI
2. 预测
3. MTD/DLY
4. 目标趋势联动
5. 页面接入
6. 导出
7. 数据库
8. 后端 API

## 12. 后续接入计划

1. V0.4D-2：首页诊断提示接入
2. V0.4D-3：店铺看板诊断提示接入
3. V0.4D-4：宝贝看板诊断提示接入
4. V0.4D-5：系列看板诊断提示接入

后续页面接入阶段不得修改本规则层的目标完成率来源，也不得把规则提示升级为 AI 诊断。

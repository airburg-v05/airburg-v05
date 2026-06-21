# 千问接入审计 V0.3A

生成时间：2026-06-19

审计范围：`app`、`components`、`lib`、`package.json`、`README.md`、`docs`

搜索关键词：`qwen`、`dashscope`、`aliyun`、`model-studio`、`openai`、`千问`、`百炼`、`DASHSCOPE_API_KEY`、`QWEN_API_KEY`

本阶段只做审计和方案设计，不实际调用千问，不发送真实报表，不修改千问配置。

## 1. 当前千问接入状态

当前项目未发现千问、通义千问、阿里云百炼、DashScope 或 OpenAI 兼容接口接入代码。

结论：

- 没有前端千问调用。
- 没有服务端千问调用。
- 没有模型名称配置。
- 没有 Function Calling。
- 没有结构化 JSON 输出实现。
- 没有检测到 `DASHSCOPE_API_KEY` 或 `QWEN_API_KEY`。
- 项目根目录未发现 `.env` 或 `.env.example`。

## 2. 相关代码文件

当前没有千问相关代码文件。

已确认的业务分析链路：

| 文件 | 当前作用 | 是否涉及千问 |
|---|---|---|
| `lib/analysis/run-analysis.ts` | 串联解析、清洗、指标、排行、异常识别 | 否 |
| `lib/data-source/parse-and-map.ts` | 文件解析和字段映射入口 | 否 |
| `lib/cleaning/basic-clean.ts` | 基础字段清洗 | 否 |
| `lib/metrics/calculate.ts` | 核心指标计算 | 否 |
| `lib/metrics/product-ranking.ts` | 商品排行 | 否 |
| `lib/metrics/anomaly.ts` | 异常商品识别 | 否 |
| `lib/storage/analysis-storage.ts` | 保存分析结果到 localStorage | 否，但后续接售后前存在隐私整改需求 |
| `app/(workspace)/upload/page.tsx` | 浏览器端上传并运行分析 | 否 |

## 3. 调用方式

当前无调用。

后续推荐方式：

1. 只允许服务端调用千问，不允许浏览器端直连。
2. API Key 只能放在服务端环境变量，例如 `DASHSCOPE_API_KEY`。
3. 禁止使用 `NEXT_PUBLIC_` 前缀保存密钥。
4. 前端只调用项目自己的服务端接口。
5. 服务端接口只接收脱敏后的聚合数据包。

## 4. 密钥安全情况

| 检查项 | 结果 |
|---|---|
| 是否存在 `.env` | 未发现 |
| 是否存在 `.env.example` | 未发现 |
| 是否存在 `DASHSCOPE_API_KEY` | 未发现 |
| 是否存在 `QWEN_API_KEY` | 未发现 |
| 是否存在 OpenAI key 相关代码 | 未发现 |
| 是否存在前端暴露密钥风险 | 当前未发现 |

注意：未发现密钥不等于后续天然安全。未来接入时必须保证密钥只在服务端读取。

## 5. 当前输入和输出结构

当前没有千问输入/输出结构。

现有本地分析输出 `AnalysisResult` 包含：

- `file`：文件名、大小、分析时间
- `data.headers`：表头
- `data.rowCount`：行数
- `data.previewRows`：前 50 行预览
- `data.mapping`：字段映射结果
- `data.fieldQuality`：字段质量
- `metrics`：核心指标
- `ranking`：商品排行
- `anomalies`：异常商品

隐私风险：

- `previewRows` 会保存到 localStorage。
- 当前页面尚未接入售后表，但如果后续允许售后表上传，这个结构会把售后明细前 50 行保存到浏览器本地。
- 后续接入售后前必须把 `previewRows` 改为脱敏字段或聚合预览。

## 6. 可以保留的能力

| 能力 | 是否建议保留 | 说明 |
|---|---|---|
| 本地解析 Excel / CSV | 保留 | 后续四表仍以手动上传为核心 |
| 字段映射 | 保留并扩展 | 需要增加四类天猫报表字段候选词 |
| 数据清洗 | 保留并扩展 | 增加 ID 字符串保护、时间字段、GB18030 |
| 指标计算 | 保留并拆分 | 后续拆成经营、推广、售后、AI 输入包 |
| 商品排行 | 保留 | 后续合并推广和售后字段 |
| 异常识别 | 保留并扩展 | 后续增加异常计划、售后异常 |
| localStorage 保存结果 | 小改后保留 | 只保存脱敏汇总，不保存售后明细 |

## 7. 需要整改的问题

1. 接入千问前必须先定义脱敏数据包，不允许直接发送 `rows` 或 `previewRows`。
2. 售后表的订单编号、支付宝交易号、电话、地址、物流单号、操作人等字段必须解析后立即删除。
3. 千问输入必须区分数据事实和推断结论，避免模型把缺失字段说成确定事实。
4. 比率类指标不能直接平均，要传入汇总后的分子和分母。
5. 商品 ID、主体 ID、计划 ID 必须按字符串传递，防止精度丢失。
6. 需要在 AI 报告中显式列出数据缺口和口径歧义。
7. 需要给千问输出加 JSON schema 校验，避免页面渲染自由文本失控。

## 8. 推荐脱敏数据包

后续千问只应接收如下聚合结构：

```json
{
  "meta": {
    "platform": "tmall",
    "dateRange": {
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD"
    },
    "dataSources": [
      "business_product",
      "ad_product",
      "ad_plan",
      "after_sales_aggregated"
    ],
    "knownGaps": []
  },
  "storeMetrics": {
    "gmv": 0,
    "gsv": 0,
    "refundAmount": 0,
    "refundRate": null,
    "visitors": 0,
    "paidBuyers": 0,
    "conversionRate": null,
    "avgOrderValue": null,
    "adSpend": 0,
    "roi": null
  },
  "productMetrics": [
    {
      "productId": "string",
      "productName": "脱敏或业务可展示商品名",
      "gmv": 0,
      "gsv": 0,
      "visitors": 0,
      "paidBuyers": 0,
      "conversionRate": null,
      "adSpend": 0,
      "refundSuccessAmount": 0,
      "refundSuccessCount": 0
    }
  ],
  "planMetrics": [
    {
      "planId": "string",
      "sceneName": "string",
      "adSpend": 0,
      "impressions": 0,
      "clicks": 0,
      "transactionAmount": 0,
      "roi": null,
      "newBuyers": 0,
      "memberJoinCount": 0
    }
  ],
  "afterSalesSummary": {
    "byProduct": [],
    "reasonDistribution": [],
    "statusDistribution": [],
    "overduePendingCount": 0
  },
  "anomalies": {
    "products": [],
    "plans": [],
    "dataQuality": []
  }
}
```

## 9. 千问不得接收的数据

1. 手机号
2. 电话
3. 地址
4. 收件人
5. 订单号
6. 退款编号
7. 支付宝交易号
8. 物流单号
9. 操作人
10. 完整客户信息
11. 原始售后明细
12. 未脱敏的 Excel / CSV 原始行

## 10. 推荐结构化输出格式

建议千问输出 JSON，至少包含：

```json
{
  "facts": [
    {
      "title": "数据事实",
      "evidence": "来自哪个聚合指标",
      "confidence": "high|medium|low"
    }
  ],
  "diagnosis": [
    {
      "issue": "运营判断",
      "level": "high|medium|low",
      "reason": "基于哪些指标",
      "affectedProducts": [],
      "affectedPlans": []
    }
  ],
  "risks": [
    {
      "risk": "风险提示",
      "dataGap": "是否存在数据缺口"
    }
  ],
  "actions": [
    {
      "action": "行动建议",
      "owner": "运营|投放|客服|商品",
      "due": "建议复盘时间",
      "metricToWatch": "复盘指标"
    }
  ],
  "dataGaps": [
    {
      "field": "缺失字段或口径",
      "impact": "影响什么判断"
    }
  ]
}
```

输出要求：

- `facts` 只写数据事实。
- `diagnosis` 写运营判断，必须能追溯到输入指标。
- `risks` 写不确定性和风险。
- `actions` 写行动建议和负责人。
- `dataGaps` 写缺失字段、口径歧义和不能判断的内容。

## 11. 后续接入页面建议

后续不要先做“AI 大报告页”，建议先按以下顺序接入：

1. 上传页：增加四源文件健康检查。
2. 首页：只展示本地计算结果，不直接展示 AI 文本。
3. 商品看板：提供商品聚合指标和异常商品给 AI。
4. 计划看板：提供计划聚合指标和异常计划给 AI。
5. 售后看板：只展示聚合售后指标和原因/状态分布。
6. AI 诊断面板：读取脱敏数据包，展示结构化 JSON 结果。
7. AI 输出校验：若 JSON schema 不通过，页面显示“报告生成失败，请重试”，不渲染自由文本。

## 12. 当前结论

当前项目没有千问接入代码，因此没有把真实报表发送给千问的现存风险。

但后续接入前必须先完成两件事：

1. 把售后原始明细从页面和 localStorage 中隔离，只保留聚合结果。
2. 设计服务端千问接口，保证 API Key 不进入浏览器。


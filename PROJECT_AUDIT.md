# 电商数据分析平台项目盘点报告

生成时间：2026-06-19  
项目路径：`/Users/zongji/Documents/电商数据分析平台/airburg-ecom-data-lab`  
项目名称：`airburg-ecom-data-lab`

## 1. 项目基本信息

这是一个基于 Next.js App Router 的本地电商数据分析原型项目。当前核心能力集中在首页：用户手动上传 Excel / CSV 文件后，前端直接调用本地分析流程 `runAnalysis(file)`，完成文件解析、字段映射、基础清洗、总量指标、商品排行和异常商品识别。

当前项目不包含真实后端、数据库、登录认证、平台 API、爬虫或 SaaS 付费系统。

## 2. 技术栈

| 类别 | 当前使用 |
|---|---|
| 前端框架 | Next.js 16.2.9 |
| 路由模式 | App Router |
| UI 框架 | React 19.2.7 |
| 语言 | TypeScript 6.0.3 |
| 样式 | Tailwind CSS 4.3.1 |
| Excel 解析 | `xlsx` 0.18.5 |
| CSV 解析 | `papaparse` 5.5.3 |
| 代码检查 | ESLint 9.39.4 + eslint-config-next 16.2.9 |
| 包管理 | npm 11.13.0 |
| Node 环境 | Node v24.16.0 |

## 3. 目录结构

当前实际存在的主要目录：

```text
airburg-ecom-data-lab/
  app/
    page.tsx
    layout.tsx
    globals.css
    upload/page.tsx
    dashboard/page.tsx
  components/
  docs/
    project-plan.md
    field-dictionary.md
    phase-1-checklist.md
  lib/
    analysis/run-analysis.ts
    cleaning/basic-clean.ts
    data-source/parse-and-map.ts
    metrics/anomaly.ts
    metrics/calculate.ts
    metrics/field-map.ts
    metrics/product-ranking.ts
    parsers/csv.ts
    parsers/excel.ts
    mapping-test.ts
  samples/
    4051124186_1781241108234_860.csv
  types/
    metrics.ts
    papaparse.d.ts
    platform.ts
  package.json
  package-lock.json
  next.config.ts
  tsconfig.json
  eslint.config.mjs
  postcss.config.mjs
```

当前不存在：`src/`、`pages/`、`public/`、`styles/`、`prisma/`、接口目录、数据库迁移目录。

## 4. package.json 运行命令

| 命令 | 作用 | 当前检查结果 |
|---|---|---|
| `npm run dev` | 启动本地开发服务，脚本为 `next dev --webpack` | 可启动，`http://localhost:3000` 返回 200 |
| `npm run build` | 生产构建 | 通过 |
| `npm run start` | 启动生产构建后的服务 | 未单独检查，需要先 build |
| `npm run lint` | ESLint 检查 | 当前失败，属于 ESLint/Next 配置兼容报错 |

## 5. 主要依赖

生产依赖：

- `next`
- `react`
- `react-dom`
- `xlsx`
- `papaparse`

开发依赖：

- `typescript`
- `tailwindcss`
- `@tailwindcss/postcss`
- `eslint`
- `eslint-config-next`
- `@eslint/eslintrc`
- `@types/node`
- `@types/react`
- `@types/react-dom`

## 6. 当前页面和路由

| 路由 | 文件 | 当前状态 |
|---|---|---|
| `/` | `app/page.tsx` | 已有真实上传与分析展示逻辑 |
| `/upload` | `app/upload/page.tsx` | 占位页，仅显示“上传页面占位” |
| `/dashboard` | `app/dashboard/page.tsx` | 占位页，仅显示“数据分析页面占位” |

没有发现登录页、注册页、后台管理页、API 路由或动态路由。

## 7. 已完成功能

### 手动文件上传入口

首页包含文件选择框，支持 `.csv`、`.xls`、`.xlsx` 文件选择，并通过按钮触发分析。

### Excel / CSV 解析

- `lib/parsers/excel.ts` 支持读取第一个 sheet。
- `lib/parsers/csv.ts` 使用 `papaparse` 解析 CSV 文本。
- 两者都实现了“前 10 行自动识别表头”的基础规则。

### 字段映射

`lib/metrics/field-map.ts` 已实现标准字段候选词匹配，支持：

- 完全匹配
- 忽略大小写和空格
- 包含关系模糊匹配
- `matched / ambiguous / missing` 状态

当前标准字段包括：

- `platform`
- `product_id`
- `product_name`
- `visitors`
- `sales_amount`
- `paid_buyers`
- `conversion_rate`
- `avg_order_value`
- `favorites`
- `cart_additions`

### 基础数据清洗

`lib/cleaning/basic-clean.ts` 已支持：

- 数字字段去逗号、转数字
- 金额字段去 `¥`、`￥`、逗号、空格
- 百分比字段转小数
- 空字符串转 `null`
- 字段质量状态：`valid / missing / invalid`

### 核心指标计算

`lib/metrics/calculate.ts` 已计算：

- 总销售额
- 总访客
- 总买家
- 总转化率
- 客单价

### 商品排行

`lib/metrics/product-ranking.ts` 已按 `product_name` 分组，输出：

- 销售额排行
- 访客排行
- 转化率排行

### 异常商品识别

`lib/metrics/anomaly.ts` 已支持基础规则：

- 高访客低转化
- 高加购低支付
- 数据缺失

### 统一分析流程

`lib/analysis/run-analysis.ts` 已串联：

```text
parseAndMap
-> cleanBasicData
-> calculateMetrics
-> calculateProductRanking
-> detectAnomalies
```

## 8. 半完成功能

| 功能 | 当前状态 | 说明 |
|---|---|---|
| 首页分析页 | 半完成 | 可上传和展示结果，但 UI 仍偏原型，含调试文字 |
| `/upload` 页面 | 半完成偏占位 | 有路由但没有上传逻辑 |
| `/dashboard` 页面 | 半完成偏占位 | 有路由但没有看板逻辑 |
| 字段映射 | 可用但需扩展 | 已有天猫/京东/抖音常见候选词雏形，覆盖面还不完整 |
| 异常识别 | 可用但较粗 | 规则版本很基础，没有可配置阈值 |
| 数据质量 | 可用但较粗 | 只做字段级状态，没有行级错误详情 |

## 9. 未完成功能

- 登录页面
- 登录认证
- 用户权限
- 顶部导航
- 侧边导航
- 宝贝看板
- 系列看板
- 店铺看板
- 独立数据上传页面
- 原始数据页面
- 数据表格展示
- 后端接口
- 数据库存储
- Prisma 或数据库迁移
- SaaS 付费系统
- 平台 API 对接
- 爬虫
- 自动登录
- AI 分析报告
- 文件上传历史
- 多文件合并
- 数据导出

## 10. 当前公共组件

`components/` 目录存在，但目前为空。没有可复用公共组件。

建议下一阶段再拆：

- 上传组件
- 指标卡片组件
- 排行列表组件
- 异常列表组件
- 页面布局组件

## 11. Mock 数据、接口、数据库、上传代码

### Mock / 样本数据

`samples/4051124186_1781241108234_860.csv` 存在，并疑似包含真实订单/退款类数据。该文件不应进入对外压缩包，不应提交到公开仓库。

### 接口

没有发现 `app/api`、`route.ts` 或其他真实接口代码。

### 数据库

没有发现 Prisma、数据库迁移、数据库连接配置或 ORM。

### 文件上传代码

当前只有浏览器端文件选择与本地解析，没有上传到服务器，也没有文件持久化。

## 12. 登录、首页、导航和看板状态

| 模块 | 是否存在 | 完成度 |
|---|---|---|
| 登录页面 | 否 | 未开始 |
| 首页 | 是 | 已有上传、分析、指标卡片、排行和异常列表 |
| 顶部导航 | 否 | 未开始 |
| 侧边导航 | 否 | 未开始 |
| 宝贝看板 | 否 | 未开始 |
| 系列看板 | 否 | 未开始 |
| 店铺看板 | 否 | 未开始 |
| 数据上传页 | 是 | 只有占位 |
| 原始数据页面 | 否 | 未开始 |

## 13. 能正常运行的页面

通过 `npm run build` 的路由：

- `/`
- `/upload`
- `/dashboard`

其中 `/` 是可用功能页；`/upload` 和 `/dashboard` 是静态占位页。

## 14. 静态页面和无功能按钮

静态页面：

- `/upload`
- `/dashboard`

首页按钮：

- “提交分析”按钮有真实功能，会调用 `runAnalysis(file)`。
- 目前没有发现其他业务按钮。

首页仍有调试展示：

- `按钮状态`
- `selectedFile`
- `状态`

这些可以在下一阶段改成更正式的提示区。

## 15. 可直接保留复用代码

建议直接保留：

- `lib/analysis/run-analysis.ts`
- `lib/data-source/parse-and-map.ts`
- `lib/parsers/excel.ts`
- `lib/parsers/csv.ts`
- `lib/metrics/field-map.ts`
- `lib/cleaning/basic-clean.ts`
- `lib/metrics/calculate.ts`
- `lib/metrics/product-ranking.ts`
- `lib/metrics/anomaly.ts`
- `types/metrics.ts`
- `types/platform.ts`
- `docs/project-plan.md`
- `docs/field-dictionary.md`
- `docs/phase-1-checklist.md`

这些文件已经形成了清晰的第一阶段分析管道。

## 16. 建议小改后复用代码

| 文件 | 建议 |
|---|---|
| `app/page.tsx` | 拆分 UI 组件，移除调试文字，增加字段映射结果和数据质量提示 |
| `lib/parsers/csv.ts` | 整理缩进和类型，当前可构建但可读性较差 |
| `lib/metrics/product-ranking.ts` | 去掉 `any` 排序写法，补充稳定类型 |
| `lib/metrics/anomaly.ts` | 整理缩进，移除永远不需要的 `item.cart_additions !== null` 判断 |
| `types/papaparse.d.ts` | 后续可以安装 `@types/papaparse` 替代手写声明 |
| `eslint.config.mjs` | 修复 lint 配置兼容问题 |

## 17. 建议重做代码

当前没有必须立刻废弃重做的核心业务代码。

更适合重做的是页面组织方式：

- 把首页从“大文件原型页”拆成正式页面结构。
- 将上传、数据概览、排行、异常识别拆成组件。
- 将 `/upload` 和 `/dashboard` 从占位路由改成真实工作流。

## 18. 当前错误和风险

### `npm run lint` 无法运行

当前报错：

```text
TypeError: Converting circular structure to JSON
property 'plugins' -> object
property 'react' closes the circle
```

初步判断是 ESLint 9、`@eslint/eslintrc`、`eslint-config-next` 当前组合的 flat config 兼容问题。没有在本次任务中修复，因为用户要求不修改业务代码、不重构。

### 样本 CSV 可能包含真实客户数据

`samples/4051124186_1781241108234_860.csv` 疑似包含真实订单、退款、物流、地址或联系方式等数据。该文件已在本次安全打包中排除。

### 首页仍是原型页面

首页虽然能跑，但 UI 和代码组织仍是原型状态，不适合作为长期 SaaS 后台基础直接堆功能。

### 字段识别覆盖面有限

当前字段候选词只是第一版，不足以覆盖所有天猫、京东、抖音导出表。

### 数据清洗和指标计算仍缺测试

当前没有单元测试或样本回归测试。后续扩字段时容易误改计算结果。

### 没有真实数据存储

刷新页面后分析结果丢失，这是当前阶段预期限制。

## 19. 是否支持 Excel / XLS / CSV

已支持：

- `.xlsx`
- `.xls`
- `.csv`

当前解析方式是浏览器端读取文件，不上传到服务器。

## 20. 是否存在天猫字段映射或指标计算逻辑

已存在第一版字段映射和指标计算逻辑。

字段映射候选词里包含天猫常见字段，如：

- `宝贝ID`
- `宝贝名称`
- `支付金额`
- `支付买家数`
- `商品访客数`
- `支付转化率`

但还不是完整平台字段库，需要结合真实后台导出文件继续扩展。

## 21. 是否包含真实后端、数据库或登录认证

不包含。

当前项目是纯前端本地分析原型：

- 无后端 API
- 无数据库
- 无 Prisma
- 无认证
- 无真实登录
- 无服务器端文件上传

## 22. 没有使用的组件和依赖

### 组件

`components/` 目录为空，没有未使用组件。

### 依赖

当前依赖都与项目方向相关：

- `xlsx` 用于 Excel 解析。
- `papaparse` 用于 CSV 解析。
- Next / React / Tailwind / TypeScript 是项目基础。

没有发现明显多余的业务依赖。

## 23. 推荐后续开发顺序

1. 修复 lint 配置，让 `npm run lint` 可稳定运行。
2. 清理首页调试文字，把首页整理成正式“上传 + 指标 + 排行 + 异常”页面。
3. 拆分公共组件：上传区、指标卡、排行列表、异常列表。
4. 增加“字段识别结果”展示，让用户知道哪些字段匹配成功、哪些缺失。
5. 增加“原始数据预览”页面，展示前 50 行解析结果。
6. 完善字段字典，优先基于真实天猫/京东/抖音导出表扩候选词。
7. 增加基础测试样本，保护解析、清洗、指标计算逻辑。
8. 再建设 `/upload`、`/dashboard`、宝贝看板、店铺看板等正式页面。
9. 后续再考虑本地存储、数据库、登录和 AI 报告。

## 24. 当前最适合从哪里继续开发

最适合从首页继续拆分和增强。

原因：

- 首页已经跑通完整分析管道。
- 分析层代码已经有第一版结构。
- `/upload` 和 `/dashboard` 只是占位，直接在它们上写业务会造成重复。

建议下一步把 `app/page.tsx` 的 UI 拆成组件，同时保留现有 `runAnalysis(file)` 作为数据入口。

## 25. 文件级说明

| 文件 | 作用 |
|---|---|
| `app/page.tsx` | 当前首页，包含文件选择、提交分析、核心指标卡片、销售额 TOP5、访客 TOP5、异常商品列表 |
| `app/layout.tsx` | 全局 HTML 布局和页面元信息 |
| `app/globals.css` | Tailwind 引入和全局基础样式 |
| `app/upload/page.tsx` | 上传页占位 |
| `app/dashboard/page.tsx` | 数据分析页占位 |
| `lib/analysis/run-analysis.ts` | 统一分析流程入口 |
| `lib/data-source/parse-and-map.ts` | 根据文件扩展名选择解析器，并调用字段映射 |
| `lib/parsers/excel.ts` | Excel 解析，读取第一个 sheet 并自动识别表头行 |
| `lib/parsers/csv.ts` | CSV 解析，读取文本并自动识别表头行 |
| `lib/metrics/field-map.ts` | 标准字段与平台导出表头的候选词匹配 |
| `lib/cleaning/basic-clean.ts` | 字段级基础清洗 |
| `lib/metrics/calculate.ts` | 总量指标计算 |
| `lib/metrics/product-ranking.ts` | 商品维度排行 |
| `lib/metrics/anomaly.ts` | 异常商品识别 |
| `lib/mapping-test.ts` | 临时字段映射测试函数 |
| `types/metrics.ts` | 指标字段和字段映射类型 |
| `types/platform.ts` | 平台类型 |
| `types/papaparse.d.ts` | `papaparse` 最小模块声明 |
| `docs/project-plan.md` | 项目规划文档 |
| `docs/field-dictionary.md` | 统一字段字典 |
| `docs/phase-1-checklist.md` | 第一阶段验收清单 |
| `package.json` | 项目依赖和 npm scripts |
| `package-lock.json` | npm 锁文件 |
| `next.config.ts` | Next.js 配置 |
| `tsconfig.json` | TypeScript 配置 |
| `eslint.config.mjs` | ESLint 配置 |
| `postcss.config.mjs` | Tailwind/PostCSS 配置 |

## 26. 本次运行检查结果

| 检查项 | 结果 |
|---|---|
| 依赖完整性 | `npm ls --depth=0` 可正常输出 |
| `npm run dev` | 可启动 |
| 首页 HTTP 检查 | `http://localhost:3000` 返回 200 |
| `npm run build` | 通过 |
| `npm run lint` | 失败，疑似 ESLint 配置兼容问题 |

## 27. 本次安全打包说明

本次打包会包含：

- `PROJECT_AUDIT.md`
- `package.json`
- `package-lock.json`
- `app/`
- `components/`
- `docs/`
- `lib/`
- `types/`
- Next.js / TypeScript / Tailwind / ESLint 配置文件

本次打包会排除：

- `node_modules`
- `.next`
- `dist`
- `build`
- `coverage`
- `.git`
- `.env` / `.env.*`
- `samples/*.csv`
- `samples/*.xls`
- `samples/*.xlsx`
- `.DS_Store`
- 任何疑似真实客户数据文件


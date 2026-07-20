# A+ 商用母版基准研究

## 结论

A+ 不等于给 Direction A 增加渐变、阴影或玻璃，而是把它收束成一套可长期使用的 Airburg 产品语言：

> 高端空气产品品牌为自身建立的精密经营操作系统。

设计关键词为 `清晰 / 精密 / 安静 / 自信 / 克制的生命力`。反向边界为 `通用蓝色 SaaS / AI 紫色渐变 / 黑色数据大屏 / 卡片墙 / 假科技光效 / 所有数字同权 / 以高级感牺牲可读性`。

推荐母版名为 **A+1 瓷白钛影 / Porcelain Titanium**。其差异不依赖装饰，而来自决策层级、材质比例、数字排版、精细对齐、状态诚实和一条克制的 Airburg“空气流线”。

## 一手基准

| 来源 | 可迁移原则 | A+ 转译 | 禁止照搬 |
|---|---|---|---|
| [Linear — Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh) | 界面不争夺尚未赢得的注意力；结构应被感受到，而非被看到 | 降低导航、筛选和结构线权重，只让当前经营问题成为主角 | Linear 的具体侧栏、图标和灰阶 |
| [Linear — How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | 先定义行为与压力测试，再完成视觉刷新 | 用长值、空值、错误、390px 和 200% 字体缩放压力测试母版 | 把单张理想截图当成设计系统 |
| [IBM Carbon — Dashboards](https://carbondesignsystem.com/data-visualization/dashboards/) | 优先级、空白和一致颜色应引导用户聚焦与探索 | 首屏只保留一个主经营问题；17 KPI 分级而不删减 | 多色告警墙和重复说明 |
| [IBM Carbon — Chart anatomy](https://carbondesignsystem.com/data-visualization/chart-anatomy/) | 标题、轴、网格和标签应服务解释 | 主趋势最多两条线、直接标注、轴与单位完整 | 装饰性仪表盘、伪 3D、无意义面积填充 |
| [IBM Carbon — Axes and labels](https://carbondesignsystem.com/data-visualization/axes-and-labels/) | 缺失周期不能插值成连续事实 | 缺失点断开；不可用 KPI 始终显示 `--`，不合成 0 | 用平滑曲线掩盖缺失数据 |
| [Vercel — Web Interface Guidelines](https://vercel.com/design/guidelines) | 键盘、焦点、触达面积、精确文案和可行动错误属于界面质量 | 采用原生控件、可见焦点、移动触达目标 44px、明确状态文案 | 只追求截图效果而忽略交互质量 |
| [Stripe — Dashboard basics](https://docs.stripe.com/dashboard/basics) | 首页应直接支持经营分析与表现判断 | 将范围、时间、核心表现、差距和数据健康放在同一决策路径 | 把首页做成营销落地页 |
| [Stripe Apps — Design](https://docs.stripe.com/stripe-apps/design?locale=en-GB) | 一致组件与克制品牌色支持可读性和信任 | 品牌青只用于选中、主趋势和关键操作 | 大面积品牌色与装饰性彩色图标 |
| [Apple — Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) | 层级、和谐与一致性共同建立质量感 | 两类字体角色、少量尺度、跨状态一致的语义 token | 用平台拟物替代 Airburg 自有身份 |
| [W3C — Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | WCAG 2.2 AA 的目标尺寸最低门为 24 CSS px | 商用品质内部目标采用 44×44px，24×24px 仅作最低合规线 | 把最低合规误写成顶级体验 |
| [W3C — Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) | 正文 4.5:1，大文字 3:1 | 文字、单位、辅助说明分别做对比度校验 | 用极浅灰制造“高级感” |
| [W3C — Non-text Contrast](https://www.w3.org/WAI/WCAG21/understanding/non-text-contrast.html) | 关键图形与控件边界至少 3:1 | 图表主线、焦点、选中和控件边界保持可辨识 | 仅靠微弱色差表达状态 |

## A+ 可执行规则

1. 1440px 首屏只允许一个主经营区域，导航、筛选和数据健康为从属层级。
2. 17 KPI 全部保留且可访问；4 项一级指标，13 项进入三组连续经营台账。
3. 色彩遵循 85/10/5：中性画布与数据表面约 85%，材质层次约 10%，品牌色不超过 5%。
4. 只允许三种材质层级：画布、静止表面、浮层；普通 KPI 与图表不使用阴影。
5. 每屏只有一个 Airburg 视觉签名：2px 空气流线连接当前一级 KPI 与主趋势。
6. 字体角色不超过两类；所有数字使用 tabular figures；正文不低于 13px。
7. 4px 基础间距，圆角仅使用 8 / 12 / 16 三档；连续台账不为每个指标创建独立圆角卡片。
8. 单图只回答一个问题，最多两条曲线；主线实线、目标/对比线虚线，并直接标注重要值。
9. 正常、空、缺失、待接入、暂无源、读取失败各有独立状态；`--` 不得被解释为 0。
10. 动效只承担反馈；交互 160–220ms，面板 240–320ms，支持 `prefers-reduced-motion`。
11. 首屏工程文案、装饰性彩色图标背景和循环动画数量均为 0。
12. 去掉 Airburg 名称后如果仍像任意分析 SaaS 模板，则真人品牌评审不通过。

## 为何不选“曜石空气舱”作为主母版

深色外壳在演示时冲击更强，但更容易落入汽车中控、金融终端或黑色 BI 大屏的既有记忆；它在 390px 上也更容易产生深浅碎裂，并增加长期使用和无障碍成本。A+1 更能把“空气、洁净、精密”变成可持续的产品资产。

## 证据边界

- 本研究支持 `CONCEPT_REVIEW_READY`，不支持 `visualAccepted=true`。
- masked demo 只用于比较层级、密度、品牌感和交互，不支持经营结论。
- 生产实现仍需独立授权、视觉契约修订、实际路由对稿、可访问性/性能验证和真人整页验收。

# V2 Home Textual Visual Reference V1

Task: `V2_HOME_TEXTUAL_REFERENCE_VISUAL_REBASE_AND_MINIMALISM_V2`

Role: stable visual specification for `/v2/home`. This document is not the
project runtime SSOT and does not change data, metric, target, or persistence
semantics.

Reference mode: `TEXTUAL_REFERENCE_CONTRACT`

Contract id: `TEXTUAL_VISUAL_REFERENCE_CONTRACT`

Canonical scope labels: `17 个 KPI`, `经营趋势`, `数据治理`, `禁止复制`.

## A. Operating Metric Matrix

1. Put all operating metrics inside one complete white panel.
2. Do not render 17 visually detached cards with large gaps or shadows.
3. Use subtle 1px internal dividers to form consistent metric cells.
4. Keep cell spacing near zero while preserving internal padding.
5. The matrix must feel dense, ordered, and easy to scan.
6. Desktop uses approximately six columns; 1440px targets a 6 + 6 + 5 layout.
7. Every metric cell uses the same information hierarchy.
8. Metric titles are small and secondary.
9. The current value is the strongest element.
10. MTD and total target values are secondary.
11. Difference and completion stay near the bottom.
12. A thin progress bar anchors the cell.
13. Red and green are reserved for difference, completion, and risk states;
    never color the whole cell.
14. Hover may use a very light blue background.
15. The selected metric may use an approximately 3px blue top accent.
16. Unselected metrics stay white.
17. The outer panel uses a light border and a 10px to 12px radius.
18. Individual metric cells have no visible shadow.
19. Explanatory copy inside cells is kept to an absolute minimum.
20. Hierarchy comes from numbers, spacing, and typography, not paragraphs.

Cell structure:

```text
Metric name
Current value
MTD | Target | Difference
Completion value
Thin progress bar
```

Cell dimensions and typography:

- Desktop cell width: approximately 210px to 245px when space permits.
- Cell height: approximately 132px to 150px.
- Cell padding: 14px to 16px.
- Metric title: 13px to 14px, medium weight.
- Current value: 26px to 32px, weight 600 to 700.
- Target label: 11px to 12px, gray.
- Target and difference values: 12px to 13px.
- Completion value: 12px to 13px, right aligned.
- Progress bar: 4px to 6px.

Reference colors:

- Main text: near `#1F2937`.
- Secondary text: near `#6B7280`.
- Divider: near `#EDF0F4`.
- Primary blue: the Airburg enterprise blue, near `#2563EB`.
- Positive green: near `#16A34A`.
- Risk red: near `#DC2626`.
- Selected background: very light blue gray, near `#F4F7FF`.

Responsive rules:

- Content width at least 1320px: 6 columns.
- Content width 1100px to 1319px: 5 columns.
- Content width 900px to 1099px: 4 columns.
- Content width 640px to 899px: 2 columns.
- Below 640px: prefer 2 columns; use 1 only when content cannot remain clear.
- The last incomplete row stays left aligned and has no placeholder cells.

Visible metric-cell copy is limited to the metric name, actual value, `MTD`,
`目标`, `差值`, and the completion value. Full target semantics stay in
accessible labels or tooltips. `brandKeywordPaidShare`, unavailable metrics,
and pending metrics show `--`, never synthetic zero. Their short tooltip is
`数据待接入` or another equally concise safe reason.

## B. Operating Trend Chart

1. Use one full-width white chart panel.
2. The chart panel is wider and taller than ordinary content blocks.
3. Place the title at top left.
4. Keep the active date range near the chart controls.
5. Use compact `MTD / DLY` segmented controls.
6. Keep the legend concise and above the plot.
7. Actual data uses the enterprise blue.
8. An allowed comparison uses light blue or blue gray.
9. A very light actual-area fill is permitted.
10. Grid lines are extremely light.
11. Tooltip uses a dark floating panel.
12. Tooltip contains only date, series or metric name, and value.
13. Keep left and right data points away from plot edges.
14. Curves and axes cannot touch or overflow the panel boundary.
15. Remove chart instructions and repeated explanations.
16. Chart controls must not occupy a separate large region.
17. Missing values are not drawn as zero.
18. Empty data produces one concise empty state without a fake zero line.
19. Recommended panel height is 380px to 440px.
20. Title and control area is approximately 44px to 56px; legend is 28px to
    36px; the remaining space belongs to the plot.

The chart may expose only contract-approved metric pairs. It must preserve MTD,
DLY, time range, safe comparison behavior, tooltip responsiveness, and internal
mobile scrolling without page-wide overflow.

## C. Data Governance Reference Boundary

The governance reference belongs to future `/v2/data-health`. Home keeps only
a summary and entry.

1. Governance pages use a light gray workspace and a complete white content
   area.
2. A narrow source selector may be 180px to 220px.
3. The content header shows source identity and coverage.
4. Missing dates may be grouped in a light yellow warning area.
5. Date coverage can use dense date cells showing date, full date, and count or
   status.
6. Day, month, and custom range switches remain compact.
7. Actions are grouped in the top toolbar.
8. Tables and date cards preserve high information density.
9. Do not create many standalone explanation cards.
10. The Home page shows only `缺失`, `安全跳过`, `重复`, and `不可计算` counts.
11. Clicking the summary enters `/v2/data-health`.
12. The full data-health table, source calendar, raw rows, source file names,
    and sensitive details never appear on Home.

## D. Explicit Non-Copy Boundary

Do not copy:

1. A reference site's board-list business module.
2. A reference site's large store overview card.
3. Raw-data edit, delete, or export capabilities.
4. Account navigation or menu names from another product.
5. All metrics from another product.
6. Metrics outside the Airburg 17-metric contract.
7. Reference dates, data values, brand names, store names, or chart data.
8. Reference source code or unlicensed commercial code.
9. Data-health detail structures into the Home page.
10. Any feature that does not answer the Airburg brand operating decision.

The existing Airburg V2 shell remains. This reference controls only the Home
content area's density, hierarchy, chart clarity, and minimal visible copy.

## Home Structure Lock

The page has exactly four primary regions:

1. Compact header and filters, 72px to 96px with a 104px hard limit.
2. One white 17-metric matrix panel.
3. One compact key-series GSV panel with up to five real series.
4. One full-width operating-trend panel with the four data-health counts.

The long-lived page must not expose engineering states, adapter names,
persistence names, preview copy, complete target rules, complete search asset
configuration, complete exclusion configuration, or complete data-health
tables. Those capabilities stay behind tooltips, popovers, drawers, dialogs,
or their dedicated routes.

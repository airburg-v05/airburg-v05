# V2 Home Visual Analysis V2

Task: `V2_HOME_TEXTUAL_REFERENCE_VISUAL_REBASE_AND_MINIMALISM_V2`

Round: `ROUND_0_BEFORE_CHANGE`

Before artifact: `before-v2`. Its temporary manifest path is reported in the
task completion output and is not committed to Git.

## Current Problems

1. Visible explanatory/status copy: at least 7 persistent snippets outside
   necessary labels, including dataset restore status, metric-grid explanation,
   series explanation, chart explanation, data-summary explanation, parse
   summary, and safe-issue summary.
2. Repeated explanation pattern: every main section adds a sentence beneath its
   title even when the numbers and controls already explain the section.
3. Semantic primary regions: 4, but the analysis region is visually split into
   two equal card types, producing 5 top-level white surfaces before counting
   KPI and series cells.
4. KPI spacing: 17 detached cards use 12px gaps, individual borders, shadows,
   hover shadows, and 5 columns at 1440px.
5. KPI hierarchy: target labels and whitespace compete with the current value;
   the cards are approximately 176px high instead of the 132px to 150px target.
6. Header height: approximately 120px in the captured 1440px page, above the
   104px hard limit. Five tool links and disabled scope controls carry too much
   visual weight.
7. Empty-space issue: a single configured series occupies one small card inside
   a large panel, leaving most of the row unused.
8. Chart weight: the chart is constrained by a separate 25% data-summary card;
   the trend therefore reads as one card among many instead of the primary
   analysis surface.
9. Mobile issue: the KPI grid collapses to one column, creating a very long 17
   card stream with repeated shadows and labels.
10. Selection hierarchy: the selected chart metric does not visually connect
    to the KPI matrix.

## Delete Or Move Plan

- Delete persistent dataset status, section explanations, parse summary, safe
  issue text, and repeated navigation prompts from the Home surface.
- Move series, exclusion, search assets, and target center into one `经营设置`
  popover.
- Keep data health as one direct entry and four numeric summary items only.
- Move metric visibility and ordering into a right-side overlay.
- Replace detached KPI cards with a single matrix panel and internal dividers.
- Make the selected primary chart metric use a blue top accent in the matrix.
- Turn the key-series panel into compact equal-width cells with internal
  horizontal scrolling on mobile.
- Give the trend chart the full content width and move health counts into its
  footer.
- Preserve all real data, target overlay, approved interactions, restore
  behavior, and safe missing-value semantics.

## Round 0 Gate

- Real 18 files: `PASS` (`17 success / 0 failed / 1 safe skipped`).
- Core reconciliation: unchanged.
- Console business errors: `0`.
- 390px page-wide overflow: `false`.
- Visual acceptance: `false`; human review remains required.

## Round 1 - Structure Rebuild

Artifact label: `visual-v2-round1`.

1. Home became exactly four primary regions: toolbar, KPI matrix, key series,
   and operating trend.
2. The 17 detached shadow cards became one bordered matrix with internal
   dividers and a 6 + 6 + 5 desktop layout.
3. The actual value became the strongest type level and targets moved into a
   compact three-column row.
4. Operating actions moved into one popover; metric controls moved into a
   drawer; data health became four counts.
5. Persistent explanations and engineering-state copy were removed.
6. The page was materially easier to scan, but metric settings appeared twice,
   the one-series panel was too tall, and the chart panel carried too much
   vertical weight.

## Round 2 - Density And Hierarchy

Artifact label: `visual-v2-round2`.

1. The duplicate metric-settings entry was removed from the toolbar and kept
   beside the KPI title.
2. The toolbar exposed a compact mobile scope summary and remained within the
   desktop height contract.
3. The key-series panel was reduced to the intended compact range.
4. Target values received content-aware sizing for the 390px two-column grid.
5. The 390px page retained two KPI columns with no page-wide overflow.
6. Screenshot review found two final issues: the series title could clip and
   the operating-trend panel measured about 566px, above the reference range.

## Round 3 - Final Candidate

Artifact label: `visual-v2-round3`.

1. The series name and GSV were combined into one stable first row, eliminating
   clipping.
2. Large target values use compact Chinese display units while complete values
   remain available through accessible text and titles.
3. The chart coordinate system was widened and shortened; the complete panel
   now measures `398.3125px`.
4. The final desktop toolbar is `103px` high.
5. The KPI matrix is 6 columns and 3 rows at 1440px.
6. All 17 KPI cells are exactly `148px` high.
7. The key-series panel is `147px` high.
8. Persistent explanation count is `0`; engineering-copy count is `0`.
9. Desktop and 390px screenshots show no mixed layout, overlap, or page-wide
   overflow.
10. Console business errors and failed business requests are both `0`.

## Three-Round Conclusion

- Round 1 fixed composition and reduced surface count.
- Round 2 fixed toolbar, series density, and mobile target readability.
- Round 3 fixed final clipping and chart dominance, then passed measured DOM,
  interaction, data, responsive, and safety gates.
- Visual state remains `PENDING_HUMAN_REVIEW`; screenshots are evidence for
  review, not proof of user acceptance.

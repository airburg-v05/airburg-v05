# V0.5 Design System

## Layout

1. Default content max width: `1440px`.
2. Dense operational pages may use full available workspace width inside the existing app shell.
3. Mobile-first layout must collapse to one column at 390px.
4. No page may create whole-page horizontal overflow.

## Spacing

1. Page section gap: 24px desktop, 20px mobile.
2. Card inner padding: 16px to 24px.
3. Compact controls should use 8px to 12px gaps.

## Card Limits

1. A single page should not show more than 6 primary cards in one viewport.
2. Repeated metric cards should be grouped and limited.
3. Use tables, tabs, drawers, or drilldowns instead of endless repeated cards.

## Status Colors

1. Normal: emerald.
2. Watch: blue.
3. Risk: amber.
4. Critical or corrupted: rose.
5. Empty or disabled: slate.

Do not invent new status color systems per page.

## Drawer Rules

1. Use drawers for target creation, focused detail, and secondary setup.
2. Drawers must not replace primary page navigation.
3. Drawers must have a clear close action.
4. Forms in drawers must not save until user confirms.

## Table Rules

1. Tables may scroll horizontally inside their own container.
2. Tables must not cause whole-page horizontal overflow.
3. IDs must use `whitespace-nowrap`.
4. Long product names must truncate or wrap safely.
5. Empty table states must explain the current filter and next action.

## Mobile Rules

1. 390px width is a required acceptance viewport.
2. Navigation chips may scroll horizontally inside their own container.
3. Primary actions must remain reachable without horizontal page scroll.
4. Metric grids collapse to one or two columns.

## Empty State Rules

1. Empty states must say what is missing.
2. Empty states must point to the next action.
3. Empty states must not imply zero performance when data is missing.

## Explanation Rules

1. Do not repeat long explanatory copy across cards.
2. Prefer concise helper text and one source-of-truth doc link.
3. Do not display internal project status language to ordinary users.

## Reference Platform Boundary

When reference platform screenshots or product examples are not provided, do not visually imitate Tmall, JD, Pinduoduo, Douyin, or Youzan. Use the Airburg design system until real references are supplied.

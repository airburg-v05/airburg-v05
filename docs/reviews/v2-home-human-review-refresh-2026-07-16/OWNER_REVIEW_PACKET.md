# Owner Review Packet

## One-Line Current Truth

`/v2/home` remote preview is reachable, but this browser session currently shows the upload-required empty state; local preview at `127.0.0.1:3010` is not running.

## What This Packet Is For

Use this packet to answer the smallest current owner questions quickly:

1. Is the current remote route reachable and visually sane?
2. Is the current empty-state wording and CTA acceptable?
3. Do we need a follow-up same-browser real-data review?

This packet does not replace final owner acceptance.

## Review Items

- `VR-01` Remote route opens at `http://123.57.49.121/v2/home` and renders the Airburg V2 shell.
- `VR-02` The current visible state is correctly represented as `当前尚未导入经营数据`, not a fabricated real-data state.
- `VR-03` The empty-state guidance and `前往上传` CTA are acceptable for the current preview stage.
- `VR-04` The current remote mobile capture remains readable at `390 x 844`.
- `VR-05` Local preview at `http://127.0.0.1:3010/v2/home` is currently unavailable and should not be referenced as an available review route.
- `VR-06` If the goal is real-data visual review, the required next step is to upload data in the same browser session and re-open `/v2/home`.

## Evidence Files

- Current remote desktop screenshot:
  `docs/reviews/v2-home-human-review-refresh-2026-07-16/screenshots/remote-preview-desktop.png`
- Current remote mobile screenshot:
  `docs/reviews/v2-home-human-review-refresh-2026-07-16/screenshots/remote-preview-mobile-390.png`
- Capture manifest:
  `docs/reviews/v2-home-human-review-refresh-2026-07-16/screenshot-manifest.json`

## Optional Context Only

These are not acceptance evidence for the current preview. They are concept context if the owner wants to reference the pending A/B/C visual direction work:

- `CONCEPT-A`: `V2_HOME_VISUAL_DIRECTION_CALIBRATION_AND_CONCEPT_PROTOTYPE_V1/screenshots/direction-a-desktop.png`
- `CONCEPT-B`: `V2_HOME_VISUAL_DIRECTION_CALIBRATION_AND_CONCEPT_PROTOTYPE_V1/screenshots/direction-b-desktop.png`
- `CONCEPT-C`: `V2_HOME_VISUAL_DIRECTION_CALIBRATION_AND_CONCEPT_PROTOTYPE_V1/screenshots/direction-c-desktop.png`
- Direction summary: `V2_HOME_VISUAL_DIRECTION_CALIBRATION_AND_CONCEPT_PROTOTYPE_V1/concept-directions.json`

## Minimal Reply Contract

Reply with one of these:

1. `V2_HOME_REVIEW: ACCEPT_VISIBLE_EMPTY_STATE`
2. `V2_HOME_REVIEW: NEED_REAL_DATA_REVIEW`
3. `V2_HOME_REVIEW: REQUEST_CHANGES [item-id] [change request]`

Optional concept reply in the same message:

- `CONCEPT: A`
- `CONCEPT: B`
- `CONCEPT: C`
- `CONCEPT: REJECT_ALL`

## Example Replies

- `V2_HOME_REVIEW: ACCEPT_VISIBLE_EMPTY_STATE`
- `V2_HOME_REVIEW: NEED_REAL_DATA_REVIEW`
- `V2_HOME_REVIEW: REQUEST_CHANGES VR-03 空态文案太硬，需要更像正式工作台`
- `V2_HOME_REVIEW: NEED_REAL_DATA_REVIEW | CONCEPT: B`

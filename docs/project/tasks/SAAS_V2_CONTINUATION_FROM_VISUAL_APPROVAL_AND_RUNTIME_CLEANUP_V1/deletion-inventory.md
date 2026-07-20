# Deletion Inventory

Status: `UPDATED_WITH_EXTERNAL_EXECUTED_DELETION_EVIDENCE`

No deletions executed yet.

## 2026-07-20 inventory result

Confirmed candidate classes checked:

1. Historical local screenshot-temp manifest path recorded in SSOT:
   - path: `/var/folders/j6/vhyptpld7zl0dd14qmjpthrr0000gn/T/airburg-v2-home-upload18-local-oZrlE3/manifest.json`
   - result: already absent
   - dependency / risk: none
   - post-check state: nothing to delete

2. Historical temp directories matching prior local V2 home validation patterns under `/var/folders/*/T/airburg-v2-home-*`
   - result: no matches
   - dependency / risk: none
   - post-check state: nothing to delete

3. Browser-runtime / IndexedDB / session-backed historical imports
   - initial local conclusion in this task: not deleted by this agent turn at filesystem level
   - dependency / risk: mixed with active browser state and current review context; deleting without a browser-surface inventory would risk removing active, not-obsolete data
   - post-check state at that time: leave untouched until a browser-surface-specific cleanup task or validated deletion path exists

## External executed deletion evidence received later the same day

Authority source:

- `/Users/zongji/Documents/个人助手搭建/AI_ASSISTANT_OS/jobs/2026-07-20_platform_visual_approved_continuation_and_p1c_material_v9/EXECUTION_LOG.md`

This continuation task records the result below as already executed external evidence and must not repeat the deletion.

### Pre-delete read-only inventory at the public origin

Observed in 宗骥 current Chrome at `http://123.57.49.121` origin:

- `airburg-runtime-dataset-v1`
  - `runtimeDatasetSnapshots=1`
  - `runtimeDatasetActivePointer=1`
- `airburg-debug-context-v1`
  - `debugContext=1`
- `airburg-target-drafts-v1`
  - `targetDrafts=0`
- `airburg-v05`
  - all business object stores `=0`
- localStorage
  - only `airburg:demo-session`

### Explicit deletion list that was actually executed elsewhere

- deleted: `airburg-runtime-dataset-v1`
- deleted: `airburg-debug-context-v1`

Deletion result returned by the external Chrome/CDP route:

- `airburg-runtime-dataset-v1`: `deleted`
- `airburg-debug-context-v1`: `deleted`

### Explicit retained objects

Must remain retained and outside this deletion scope:

- `airburg-target-drafts-v1`
- `airburg-v05`
- `airburg:demo-session`
- source code
- Git history
- deployment release material
- rollback material
- original 18 source files
- task evidence and audit artifacts

### Post-delete observed state

- Refreshing `/v2/home` showed `当前尚未导入经营数据`
- Previous June operating values disappeared from the page
- The empty-state CTA currently still points to legacy `/upload`

### Follow-up boundary

- Do not change the empty-state CTA to `/v2/upload` based on guesswork alone
- Re-evaluate that link only when `/v2/upload` reaches a real vertical slice and the blueprint/route truth for the data-entry path is updated

Conclusion:

- No safe filesystem-level historical runtime/import artifact was confirmed deletable by this agent turn.
- Later, a separate externally executed browser-origin cleanup was completed and is now recorded here as authoritative evidence.
- This task must preserve the distinction between:
  - local filesystem inventory performed here, and
  - browser-origin deletion already executed elsewhere.

This inventory will list only:

- obsolete runtime import snapshots,
- obsolete import-history summaries,
- obsolete preview runtime data,
- valueless temporary artifacts.

Every deletion candidate must record:

- path or storage surface,
- count or size,
- dependency/risk check,
- reason it is safe,
- post-delete expected state.

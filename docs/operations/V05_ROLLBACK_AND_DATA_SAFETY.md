# V0.5 Rollback And Data Safety

## Release Commit Source

The valid release commit is read from:

```text
docs/project/task-completions/V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE.json
```

Current release commit:

```text
7f8db73d05f5f05599590dac77729e69775a5b9e
```

Do not manually guess the release commit during rollback.

## Rollback Rules

1. Record the currently deployed commit before release.
2. Roll back by redeploying the previous valid immutable release commit.
3. Do not delete IndexedDB.
4. Do not delete legacy localStorage keys.
5. Do not change domain, subdomain, protocol, or port as a rollback shortcut.
6. Run production smoke after rollback.
7. Do not use "clear browser data" as a standard rollback method.

## Data Safety Boundary

V0.5 stores business data in the operator browser. Browser storage is scoped by origin.

Changing from `localhost` to a production domain creates a different storage area. Users must import data again on the production origin.

中文边界：localhost 数据不会自动出现在正式域名；不同 origin 的 IndexedDB 和 localStorage 相互隔离。

运行模型：`SINGLE_BROWSER_OPERATOR_READY`；限制：`SHARED_MULTIUSER_NOT_SUPPORTED`。

## Compatibility Check

Before rolling back to any older release, confirm the older release can read the current IndexedDB schema. If schema compatibility is unknown or fails, rollback is BLOCKED and must be handled by a separate migration or compatibility task.

## Standard Rollback Procedure

1. Identify the previous valid immutable release commit.
2. Deploy that commit to the same origin.
3. Keep the same protocol, domain, subdomain, and port.
4. Start the app with the same production database name:

```text
NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME=airburg-v05
```

5. Open `/login`.
6. Open `/home`.
7. Open `/upload/history`.
8. Open `/raw-data`.
9. Confirm no data loss warning appears.
10. Confirm no business console error appears.

## Forbidden Rollback Actions

1. Clearing IndexedDB.
2. Clearing localStorage.
3. Changing origin to hide a broken local database.
4. Downgrading to a release that cannot read current local data.
5. Editing production data manually in browser devtools.

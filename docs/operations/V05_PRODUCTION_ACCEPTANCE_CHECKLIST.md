# V0.5 Production Acceptance Checklist

Release commit:

```text
7f8db73d05f5f05599590dac77729e69775a5b9e
```

Completion record:

```text
docs/project/task-completions/V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE.json
```

Origin boundary:

```text
localhost 数据不会自动出现在正式域名；不同 origin 的 IndexedDB 和 localStorage 相互隔离。
```

Operating model:

```text
SINGLE_BROWSER_OPERATOR_READY
SHARED_MULTIUSER_NOT_SUPPORTED
```

## Build And Runtime

- [ ] `npm ci` completed.
- [ ] `npm run lint` PASS.
- [ ] `npm run build` PASS.
- [ ] `npm run start -- -p <port>` starts successfully.
- [ ] `/login` opens as health check.
- [ ] No business console error or warning.
- [ ] No hydration error.
- [ ] No runtime exception.

## Pages

- [ ] `/login`
- [ ] `/home`
- [ ] `/upload`
- [ ] `/upload/history`
- [ ] `/upload/quality`
- [ ] `/raw-data`
- [ ] `/targets`
- [ ] `/store-board`
- [ ] `/series-board`
- [ ] `/series-board/manage`
- [ ] `/product-board`
- [ ] `/product-board/tracked`

## Real Import Smoke

- [ ] Open `/upload`.
- [ ] Select four private Tmall source samples.
- [ ] Click the real `导入` button.
- [ ] Import completes for default store.
- [ ] `/home` opens after import.
- [ ] `/store-board` opens after import.
- [ ] `/upload/history` shows an import batch.
- [ ] `/upload/quality` opens.
- [ ] `/raw-data` shows safe aggregate data only.

## Mobile

- [ ] 390px viewport has no whole-page horizontal overflow.
- [ ] Main navigation is usable.
- [ ] Primary actions remain reachable.

## Privacy And Safety

- [ ] Sensitive after-sales fields and values are absent.
- [ ] No `rawRows`.
- [ ] No `previewRows`.
- [ ] No file content.
- [ ] No warning raw text.
- [ ] No technical stack trace.
- [ ] No `NaN`, `Infinity`, or `undefined`.

## Storage Boundary

- [ ] Audit database is not `airburg-v05`.
- [ ] Audit database can be deleted after smoke.
- [ ] Production database `airburg-v05` is not touched by tests.
- [ ] Legacy localStorage keys are not cleared.

## Acceptance Status

Production acceptance can pass only when all mandatory items above are checked.

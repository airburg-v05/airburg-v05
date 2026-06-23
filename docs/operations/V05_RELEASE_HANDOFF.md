# V0.5 Release Handoff

状态：READY FOR DEPLOYMENT TARGET SELECTION

## Release Identity

- Release candidate task: `V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE`
- Release commit: `7f8db73d05f5f05599590dac77729e69775a5b9e`
- Completion record: `docs/project/task-completions/V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE.json`
- Freeze document: `docs/releases/v0.5-final-release-candidate-freeze.md`
- Post-freeze handoff task: `V0.5G_4_POST_FREEZE_RELEASE_HANDOFF_AND_DEPLOYMENT_READINESS`

The release commit is read from the G3-R2 immutable completion record. Do not replace it with a guessed commit.

## Operating Model

- `OPERATING_MODEL_STATUS`: `SINGLE_BROWSER_OPERATOR_READY`
- `OPERATING_MODEL_LIMIT`: `SHARED_MULTIUSER_NOT_SUPPORTED`
- `PRODUCTION_USE_CASE_STATUS`: `NOT_READY_FOR_SHARED_MULTIUSER`

V0.5 is a local-first browser application. It is ready for a single operator using one browser origin. It is not a shared multi-user system and does not synchronize data between accounts, browsers, computers, or domains.

## Runtime Requirements

- Verified Node.js: `v24.16.0`
- Verified npm: `11.13.0`
- Next.js: `16.2.9`
- Lockfile: `package-lock.json`
- Build command: `npm run build`
- Production start command: `npm run start -- -p <port>`
- Node server runtime: required
- Static export: not configured or supported for this release
- Health check route: `/login`

## Browser Requirements

The browser must support:

1. IndexedDB.
2. localStorage.
3. File API.
4. Web Crypto.
5. TextEncoder.

Recommended browsers are current Chrome or Chromium-based browsers. The production smoke test is validated with Chrome.

## Environment Variables

No private server environment variables are required for V0.5.

Public variable used by browser persistence:

```text
NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME
```

Production default database name:

```text
airburg-v05
```

Audit and smoke tests must use isolated names such as:

```text
airburg-v05-release-handoff-audit
```

## Local Data Boundary

1. IndexedDB and localStorage belong to a specific browser and origin.
2. `localhost`, a production domain, a subdomain, HTTP, HTTPS, and a different port can each create separate storage.
3. Data imported on `localhost` will not automatically appear on the production domain. localhost 数据不会自动出现在正式域名；不同 origin 的 IndexedDB 和 localStorage 相互隔离。
4. First use on the production domain requires importing the four Tmall source files again.
5. V0.5 has no server data sync.
6. V0.5 has no account-to-account sharing.
7. Switching computers or browsers does not automatically transfer data.
8. Clearing browser data can remove local operating data.
9. Rollback must not clear IndexedDB or legacy localStorage keys.

## Deployment Target Status

`DEPLOYMENT_TARGET_STATUS`: `SELECTION_REQUIRED`

The deployment target must support:

1. Node runtime for `next start`.
2. Persistent same-origin browser access.
3. HTTPS for production use.
4. Static assets served from the same application origin.
5. No forced clearing of browser storage during deploy or rollback.

No Vercel, Netlify, Docker, Nginx, cloud provider, Git remote, or domain configuration is created by this handoff task.

## Known Non-Blocking Issue

`favicon.ico` 404 may appear as a non-business resource issue and is not a release blocker under the existing V0.5 convention.

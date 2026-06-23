# V0.5 Deployment Runbook

## Purpose

This runbook describes how to deploy the V0.5 release candidate after a deployment target is selected. It does not select or configure a provider.

## Release Inputs

- Release commit: `7f8db73d05f5f05599590dac77729e69775a5b9e`
- Completion record: `docs/project/task-completions/V0.5G_3_R2_V05_RELEASE_CANDIDATE_FINAL_REGRESSION_AND_STAGE_FREEZE.json`
- Freeze document: `docs/releases/v0.5-final-release-candidate-freeze.md`

## Pre-Deploy Checks

1. Confirm the working tree is clean.
2. Confirm `V0.5G` remains `complete`.
3. Confirm `releaseCandidateStatus=READY`.
4. Confirm `package.json` and `package-lock.json` are unchanged from the release candidate.
5. Confirm deployment target supports Node runtime.
6. Confirm no production domain or provider config is added without a separate task.

## Build

```bash
npm ci
npm run lint
npm run build
```

## Start

```bash
NEXT_PUBLIC_AIRBURG_V05_DATABASE_NAME=airburg-v05 npm run start -- -p <port>
```

Use `/login` as the health check route.

## First Production Use

1. Open the production origin.
2. Log in with the local demo login.
3. Go to `/upload`.
4. Select the four Tmall source files.
5. Click the real `导入` button once.
6. Confirm `/home`, `/store-board`, `/upload/history`, `/upload/quality`, and `/raw-data` open correctly.

Data from `localhost` will not automatically appear on the production origin.

中文边界：localhost 数据不会自动出现在正式域名；不同 origin 的 IndexedDB 和 localStorage 相互隔离。

运行模型：`SINGLE_BROWSER_OPERATOR_READY`；限制：`SHARED_MULTIUSER_NOT_SUPPORTED`。

## Deployment Target Requirements

The target must provide:

1. Node runtime.
2. Stable HTTPS origin.
3. Support for browser IndexedDB and localStorage.
4. Static resource serving for Next.js build output.
5. No forced browser storage reset between deploys.

The target does not need:

1. Backend API.
2. Server database.
3. WebSocket.
4. Server-side file upload.
5. AI service.

## Not Supported In V0.5

1. Shared multi-user data.
2. Cross-device synchronization.
3. Server-side imported data storage.
4. Automatic platform API collection.
5. Formal account permission system.

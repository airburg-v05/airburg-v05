# ECS Out-of-Band SSH Recovery And V2 Home Preview Deployment

## Task Meaning

Recover trusted SSH BatchMode through an authenticated Alibaba Cloud out-of-band channel, then deploy only the already validated `/v2/home` runtime commit for public human review. Legacy V1 remains the frozen fallback.

## Evidence Read

- `docs/project/PROJECT_SSOT.json`
- `docs/project/STATUS_MODEL_V1.json`
- `docs/project/current-task.json`
- Previous deployment blocker contract, evidence, and handoff
- V2 Home data and metric semantic contracts
- Current Git, SSH client configuration, deployment agents, and project skills

## Proposal Audit

The GPT plan is directionally correct. Execution uses five corrections: no speculative MaxStartups diagnosis, no authentication claim from `ssh-keyscan`, no premature SSOT deployment state, no configuration backup until immediately before an edit, and no assumed Alibaba Cloud connection product capability.

## Current Gate

- Branch: `feature/saas-ui-v2-shell`
- Branch HEAD at authorization: `388a57c6f2ece2416e5f921a69317e258f3c208c`
- Deployment candidate: `a293db7e75b14853d68d9711e131cc348d2f3ea0`
- Git divergence: behind `0`, ahead `0`; working tree clean before task records
- SSH: port 22 reachable, connection closed before authentication; root cause unconfirmed
- `/v2/home`: not deployed

## Console Authentication Blocker

Both the Codex in-app browser and the user's Chrome reached the official Alibaba Cloud login page. No authenticated ECS console session is currently available, so instance identity, Cloud Assistant support, Workbench, VNC, and the SSH root cause cannot yet be inspected.

Required user action: complete Alibaba Cloud console sign-in and any MFA or QR confirmation in the retained Chrome login tab, leave the ECS console open, and tell Codex that authentication is complete. Do not enter credentials into this task or send them in chat.

## Unsafe Shortcuts Avoided

No guessed login secret, authentication bypass, broad firewall relaxation, extreme SSH limit change, whole-instance reboot, dirty-worktree deployment, sample upload to ECS, legacy `/home` replacement, or automatic visual acceptance.

## Resume Rule

Use Cloud Assistant or Session Manager when the instance actually supports it, otherwise Workbench or VNC. If login, MFA, QR confirmation, CAPTCHA, or an operating-system login secret is required, stop at that exact user-authentication boundary and preserve this checkpoint.

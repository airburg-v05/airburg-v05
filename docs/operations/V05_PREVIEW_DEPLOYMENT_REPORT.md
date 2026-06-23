# V0.5 Preview Deployment Report

Status: BLOCKED

Preview deployment status: NOT_READY

Generated at: 2026-06-23T18:44:49+08:00

## Scope

This task attempted G6 preview deployment after the user approved:

- selectedTarget: vercel
- selectedPlan: pro
- environment: preview
- useProviderDefaultDomain: true
- customDomain: null
- gitRemoteAuthorization: false
- deploymentProjectAuthorization: true

The task boundary explicitly forbids production deployment, `--prod`, custom domain binding, `ailianshou.com` binding, Git remote creation or use, and credential persistence.

## Evidence

Local Vercel login was confirmed with `npx --yes vercel whoami`.

Local checks passed before deployment:

- `npx tsx scripts/private-audit/validate-v05-task-authorization.ts`: PASS
- `npx tsx scripts/private-audit/validate-v05-task-completion-ledger.ts`: PASS
- `npx tsx scripts/private-audit/validate-v05-task-preflight.ts`: PASS
- `npx tsx scripts/private-audit/validate-v05-governance-lock.ts`: PASS
- `npm run lint`: PASS
- `npm run build`: PASS

The deployment command used was:

```bash
VERCEL_TELEMETRY_DISABLED=1 npx --yes vercel deploy --yes --target=preview --logs
```

The command did not include `--prod`.

## Blocking Result

Vercel returned a ready deployment, but the deployment metadata reports:

- deployment id: `dpl_FiyjG4HZoXYyfd55PWZnEBfo4E8r`
- deployment url: `https://ecommerce-platform-optimized-ciz03jd72-zongji.vercel.app`
- inspector url: `https://vercel.com/zongji/ecommerce-platform-optimized/FiyjG4HZoXYyfd55PWZnEBfo4E8r`
- target: `production`
- readyState: `READY`

Because the returned target is `production`, this does not satisfy the G6 Preview-only requirement.

Vercel also reported production aliases:

- `https://ecommerce-platform-optimized.vercel.app`
- `https://ecommerce-platform-optimized-zongji.vercel.app`
- `https://ecommerce-platform-optimized-jizong549-1822-zongji.vercel.app`

No custom domain was bound, and `ailianshou.com` was not bound.

## Public Access Check

Unauthenticated HTTPS check against:

`https://ecommerce-platform-optimized-ciz03jd72-zongji.vercel.app/login`

returned:

- HTTP status: `401`
- server: `Vercel`
- Vercel SSO nonce cookie present

Therefore the URL was not confirmed as a publicly accessible Preview URL from another computer.

## Boundary Check

- Used `--prod`: no
- Created Git remote: no
- Bound `ailianshou.com`: no
- Bound custom domain: no
- Wrote credentials to Git/docs/logged reports: no
- Modified business code: no
- Modified storage or IndexedDB schema: no
- Added dependencies: no
- Left local `.vercel` project metadata in workspace: no

## Conclusion

G6 cannot be marked PASS because the Vercel CLI produced a deployment whose target is `production`, not an approved Preview deployment.

Recommended next decision:

1. Decide whether to remove the accidentally created Vercel project/deployment from the Vercel dashboard.
2. Decide whether to adjust Vercel project protection/settings or deployment workflow before retrying G6.
3. Re-run G6 only after confirming a workflow that produces a true Preview deployment and a publicly reachable preview URL.

# Airburg Deploy Skill

Use this project skill for ECS deployment and public regression.

## State Distinctions

1. Local PASS is not public PASS.
2. Public PASS is not server aligned unless alignment checks pass.
3. Route 200 is not data regression.
4. PM2 online is not business acceptance.

## Required Deployment Flow

1. Local validation PASS.
2. SSH BatchMode PASS.
3. rsync with exclusions:
   - `.git`
   - `.vercel`
   - `node_modules`
   - `.next`
   - `private-samples`
   - `*.xls`
   - `*.xlsx`
   - `*.csv`
   - `*.pem`
   - `*.key`
4. Remote `npm ci` PASS.
5. Remote `npm run build` PASS.
6. PM2 `airburg-tmall-v1` online.
7. Nginx active and `nginx -t` PASS.
8. Port 3000 only listens on `127.0.0.1`.
9. Public 3000 is not reachable.
10. Public route checks PASS.
11. Public regression checks PASS.

## Forbidden

- Do not modify business code in a deploy task.
- Do not upload private samples or real Excel / CSV files.
- Do not open 3000 to the public.
- Do not commit or push.

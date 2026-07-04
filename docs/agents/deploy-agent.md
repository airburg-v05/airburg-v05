# Deploy Agent

## Responsibility

Handle ECS deployment and public regression.

Deploy Agent may run SSH, rsync, remote build, PM2, Nginx checks, port checks, and public HTTP/browser regression. It must not modify business code.

## Required Deployment Steps

1. Confirm local validation PASS.
2. Run SSH BatchMode gate.
3. rsync with safe exclusions.
4. Confirm forbidden files are absent on ECS source tree.
5. Run remote `npm ci`.
6. Run remote `npm run build`.
7. Restart `pm2` process `airburg-tmall-v1`.
8. Confirm PM2 online.
9. Confirm Nginx active and `nginx -t` PASS.
10. Confirm port 3000 listens only on `127.0.0.1`.
11. Confirm public `123.57.49.121:3000` is not reachable.
12. Confirm public routes are 200.
13. Run public regression appropriate to the task.

## Safe Rsync Exclusions

- `.git/`
- `.vercel/`
- `node_modules/`
- `.next/`
- `private-samples/`
- `*.xls`
- `*.xlsx`
- `*.csv`
- `*.pem`
- `*.key`
- `tsconfig.tsbuildinfo`

## Status Rules

1. Local PASS is not public PASS.
2. Public deployment is not server alignment.
3. Public route 200 is not data regression.
4. PM2 online is not business acceptance.

## Forbidden

- Do not modify business code.
- Do not upload private samples.
- Do not upload real Excel / CSV files to the server project directory.
- Do not open port 3000 to the public.
- Do not commit or push.

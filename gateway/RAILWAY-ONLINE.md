# NEXO online gateway candidate — 14 November 2026

This branch prepares an online trial. Do not merge to main or accept deployment yet.
The existing public Pages application, CORE/Discord, Gmail and all 12 services are unchanged.

## Candidate
- Dedicated service: nexo-owner-gateway, project NEXO HUB, production environment, region sfo.
- Source: this reviewed branch, pinned to the final tested commit; no automatic deploys.
- Root /gateway, Dockerfile, start node online-server.mjs, PORT=8080.
- One replica; limits 0.25 GB RAM and 0.25 vCPU; no volume, database, cron, public proxy, CDN or tracing.
- Healthcheck /health, timeout 60 seconds; ON_FAILURE, 2 retries; overlap 0; draining 5 seconds.
- Explicit HTTPS GATEWAY_ORIGIN, exact /auth/callback, owner ID 353932686.
- Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET privately on the new service only.
- Set NEXO_PRIVATE_RAILWAY_HEALTH=1. No Railway API token: online startup rejects all three common Railway token variables.
- Railway injected project and environment IDs must match this project/production.
- Session/state storage is bounded in memory. Restart signs the owner out; use one replica. This is a limited trial, not a highly available deployment.
- Global login/callback limits: 20 each per minute per process; no trust in forwarded IP headers. This bounds outbound work but an attacker can temporarily prevent login.
- Fixed GET /health probes do not follow redirects, discard bodies and coalesce concurrent status requests. No mail, task or mutation routes.
- healthcheck.railway.app is accepted only for exact GET /health, never OAuth or private API.

## Isolation and limitations
A separate process is not a separate trust boundary from production networking. Railway private networking is per project/environment; placing the gateway elsewhere prevents direct internal DNS access. Code-level GET allowlisting does not protect production from a fully compromised gateway process. No existing credentials or volumes are copied.
Public HTTPS exposes the login endpoint; private data requires the owner session.
Eight HTTP service candidates use port 8080. Actual connectivity and endpoint authorization remain to be verified after approved deployment. Three cron jobs plus one bootstrap remain not_monitored. Deployment states remain UNKNOWN.
The Pages app stays on its current origin. Do not proxy its mutable HTML into the authenticated origin or enable cross-origin credentials.

## Cost and approval
Official pricing checked 2026-11-14: RAM $10/GB-month, CPU $20/vCPU-month, outbound traffic $0.05/GB. At both proposed resource limits continuously, the compute envelope is about $7.50/month, plus traffic/tax and existing subscription. Actual usage may be lower. This is not a hard spending cap; overlap, restarts and billing accounting need attention.
No current workspace plan, remaining credits or invoice was verified. Do not promise a free deployment.
Do not change workspace-wide spending limits: they can affect existing production services.
Before accept-deploy, obtain explicit user approval for the concrete staged diff, shared production-network risk and incremental cost.
Docs: https://docs.railway.com/pricing/plans and https://docs.railway.com/networking/private-networking

## Activation sequence
1. Verify GitHub-hosted tests and image build for final commit. Simulations are not real OAuth proof.
2. Verify pending Railway changes contain only the new gateway. Configure resource limits before starting it.
3. Obtain cost/risk approval. Only then materialize/deploy the new service and allocate its HTTPS domain.
4. Register that exact origin and /auth/callback in the existing dedicated GitHub OAuth App, or use a separate online app; enter its secret directly in Railway. No secrets in chat, source, image or workflow.
5. Confirm anonymous status is 401, spoofed Host 421, HTTPS cookies and no CORS. Owner completes real GitHub login. Verify non-owner rejection using an authorized test account.
6. Check eight private probes without changing existing services; distinguish reachability from workload correctness.
7. Stop/remove only the new gateway if validation fails. Existing services and Pages remain untouched.

The Railway tool currently rejected configuration of the staged-only service with "Service Instance not found". Do not accept the patch to work around this before approval. This document is the reviewable configuration specification; the staged placeholder alone is not deployment-ready.

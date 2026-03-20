# Setup & operations

For **who does what** and the **hire flow**, see [Workflow](workflow.md).

## Prerequisites

1. **Masumi Registry + Payment** (HTTP APIs the bridge calls)
   - Local: [masumi-services-dev-quickstart](https://github.com/masumi-network/masumi-services-dev-quickstart) — registry and payment via Docker Compose (e.g. ports **3000** / **3001**). You can set `MASUMI_SERVICES_ORIGIN=http://localhost` and align API keys with compose `ADMIN_KEY` so you do not duplicate host strings.
   - Hosted: [Railway template](https://railway.com/deploy/masumi-payment-service-official) or your own deployment.

2. **Tempo (operator):** address for **`MPP_RECIPIENT`** (where MPP settlement lands). **Tempo (clients):** their own wallet / `mppx` — never your `.env`.

3. **At least one Masumi agent** registered with a reachable MIP-003 `apiBaseUrl`.

## Install & run

```bash
git clone <this-repo>
cd masumi-mpp-bridge
npm install

cp .env.example .env
# Edit .env on the server only — never give this file to hirers.

npm run dev          # development
npm run build && npm start   # production (after build)
```

Match **`PAYMENT_SERVICE_URL`**, **`PAYMENT_API_KEY`**, **`NETWORK`** with your Masumi agent / payment service (`/api/v1`). Set MPP: **`MPP_SECRET_KEY`**, **`MPP_RECIPIENT`** (or dev 402 stub per your config).

See [Architecture](architecture.md) for **`AGENT_CATALOG`** and Sokosumi vs registry keys.

## Troubleshooting

- **`Cannot find package '@hono/node-server'`** — Incomplete `node_modules` (e.g. interrupted `npm ci`). Run `npm ci` or `npm install` to completion.
- **`eslint: command not found`** — DevDependencies did not finish installing.
- **`EADDRINUSE` on port 3002** — Another process owns the port. `lsof -i :3002`, then `kill <PID>`.
- **`curl …/health` returns `404`** — Wrong process on that port; restart the bridge until logs show “listening on port …”. Healthy response is JSON like `{"ok":true,"service":"masumi-mpp-bridge",…}`.
- **`EBADENGINE` from npm** — Prefer Node **≥22.13** or **≥20.19** (see `package.json` `engines`); slightly older 22.x may warn but run.

## Production (Node)

```bash
npm ci
npm run build
npm start
```

Set **`PORT`** and full **`.env`** on the host. Scripts: `npm run lint`, `npm run typecheck`, `npm run clean`.

## Docker

```bash
docker build -t masumi-mpp-bridge .
docker run --rm -p 3002:3002 --env-file .env masumi-mpp-bridge
```

Image runs as user `node`, exposes **3002**, and includes a `HEALTHCHECK` on `GET /health`.

## Repository layout

| Path | Role |
|------|------|
| `src/index.ts` | Process entry (`serve`, startup warnings) |
| `src/app.ts` | `createApp()` — CORS, services, routes |
| `src/http/routes.ts` | HTTP handlers |
| `src/catalog/` | Agent listing (registry, Sokosumi, merge) |
| `src/lib/` | Logger, MPP pricing, version |
| `src/middleware/` | MPP 402 gate |
| `src/proxy/` | MIP-003 client |
| `src/cli/` | Optional `masumi-hire` helper |

## Optional: `masumi-hire` CLI

Not required for hirers. For local smoke tests with this repo checked out:

```bash
export BRIDGE_URL=https://your-bridge.example.com

npm run hire -- agents
npm run hire -- schema AGENT_ID
npm run hire -- suggest "summarize a research paper"
npm run hire -- run AGENT_ID --prompt "Your task here"
```

`run` shells out to `npx mppx` for the 402 flow.

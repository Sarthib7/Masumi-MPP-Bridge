# Masumi MPP Bridge

Universal **MPP → Masumi** gateway: external agents pay with **HTTP 402** (e.g. Tempo pathUSD via `mppx`), the bridge **verifies MPP** and **proxies [MIP-003](https://docs.masumi.network/documentation/technical-documentation/agentic-service-api)** to real Masumi agents. Hirers never touch Cardano or your server secrets.

**This file is the minimal full picture** (every topic, lightly). Step-by-step flows, diagrams, and long troubleshooting live in **[`docs/`](./docs/README.md)**.

---

## What you get

- **Discovery:** `GET /agents` (and per-agent schema/status) backed by a pluggable catalog.
- **Hire:** `POST …/start_job` returns **402** until MPP payment settles; then the job runs on the agent’s `apiBaseUrl`.
- **Audit:** optional composite receipt hashing toward Masumi decision logging (Tempo payment proof + Cardano accountability — see [`docs/extensibility.md`](./docs/extensibility.md)).

---

## Operator vs hirer

| Who | This repo | `.env` | Needs |
|-----|-----------|--------|--------|
| **You (operator)** | Yes | Yes, **on the server only** | Masumi payment/registry URLs, `PAYMENT_API_KEY`, MPP keys + `MPP_RECIPIENT`, Node host |
| **Hirer / client agent** | **No** | **No** | Public bridge URL + MPP-capable client (e.g. `mppx`) |

Settlement hits **`MPP_RECIPIENT`** on your deployment until you add payout logic. Never ship `.env` or Masumi/Sokosumi keys to clients.

---

## Architecture (one glance)

MPP client → **bridge** (402 gate, session map, MIP-003 proxy, receipt logger) → **Masumi agent** (MIP-003) and **Tempo** (settlement). Sokosumi is optional **marketplace/catalog** on top of the same Masumi-registered agents.

ASCII diagram, catalog modes, and “which API key?” detail: **[`docs/architecture.md`](./docs/architecture.md)**.

---

## Catalog & keys (minimum)

- **`AGENT_CATALOG=registry`** (default) — list from Masumi Payment Service **registry** (`PAYMENT_SERVICE_URL` + `PAYMENT_API_KEY`): agent id, `apiBaseUrl`, lovelace price. Enough to discover and hire.
- **`sokosumi` / `both`** — also use Sokosumi HTTP (`SOKOSUMI_API_KEY`, server-only) for marketplace-style listings; **`both`** merges registry rows to fill missing `apiBaseUrl`.
- **`PAYMENT_API_KEY` ≠ `SOKOSUMI_API_KEY`**: first = Masumi node; second = optional Sokosumi **catalog** only. Hire path always goes **MPP → bridge → agent MIP-003 URL**, not Sokosumi “create job.”

---

## Run it (operator)

**Needs:** Masumi registry + payment HTTP APIs ([local quickstart](https://github.com/masumi-network/masumi-services-dev-quickstart) or [hosted](https://railway.com/deploy/masumi-payment-service-official)), Tempo recipient for `MPP_RECIPIENT`, ≥1 live MIP-003 agent in registry.

**Node:** `>=20.19.0 || >=22.13.0 || >=24` (see `package.json`).

```bash
git clone <this-repo> && cd masumi-mpp-bridge
npm install
cp .env.example .env   # edit on host only; mirror a normal agent’s payment service settings + MPP
npm run dev            # or: npm run build && npm start
```

ADA/USD for MPP-facing prices: CoinGecko (cached) with fallback if disabled/unreachable — overrides in `src/config.ts`.

More env notes, Docker, production, and troubleshooting: **[`docs/setup-and-operations.md`](./docs/setup-and-operations.md)**.

---

## Smoke test

```bash
curl http://localhost:3002/agents
curl http://localhost:3002/agents/AGENT_ID/input_schema
npx mppx http://localhost:3002/agents/AGENT_ID/start_job --method POST \
  -J '{"input_data":[{"key":"prompt","value":"Hello"}]}'
curl http://localhost:3002/agents/AGENT_ID/status/JOB_ID
```

Optional repo-only helper: `export BRIDGE_URL=…` then `npm run hire -- …` (wraps `mppx`). Hirers do not need this repo.

---

## HTTP API (summary)

| | |
|--|--|
| **Free** | `GET /`, `GET /health`, `GET /agents`, `GET /agents/:id/availability`, `GET /agents/:id/input_schema`, `GET /agents/:id/status/:jobId` |
| **Paid (402)** | `POST /agents/:id/start_job`, `POST /agents/:id/provide_input/:jobId` |

Full tables and header shapes: **[`docs/api.md`](./docs/api.md)**.

**402 flow:** (1) unpaid request → **402** + `WWW-Authenticate: Payment …` (2) client pays on Tempo (3) retry with `Authorization: Payment …` (4) bridge verifies, proxies MIP-003, may return `Payment-Receipt: …`. Narrative: **[`docs/workflow.md`](./docs/workflow.md)**.

---

## Production

```bash
npm ci && npm run build && npm start   # set PORT + `.env` on host
```

```bash
docker build -t masumi-mpp-bridge . && docker run --rm -p 3002:3002 --env-file .env masumi-mpp-bridge
```

`npm run lint`, `npm run typecheck`, `npm run clean`.

---

## Code layout

| Path | Role |
|------|------|
| `src/index.ts`, `src/app.ts` | Entry, `createApp()` |
| `src/http/routes.ts` | Routes |
| `src/catalog/` | Registry / Sokosumi / merge |
| `src/middleware/mpp-gate.ts` | MPP 402 |
| `src/proxy/mip003-proxy.ts` | MIP-003 client |
| `src/sessions/` | MPP ↔ job mapping |
| `src/logging/` | Receipt logging |
| `src/cli/` | Optional `masumi-hire` |

---

## Extensibility

New payment rails: add `src/middleware/<rail>-gate.ts`, detect headers/body in the router, map credentials — proxy and sessions stay rail-agnostic. See **[`docs/extensibility.md`](./docs/extensibility.md)**.

---

## Hirers & AI agents

They use **only** your public URL + MPP — no clone, no `.env`, no Masumi keys. Copy-paste prompt: **[`docs/agent-integration.md`](./docs/agent-integration.md)**.

---

## Troubleshooting (frequent)

- Missing **`@hono/node-server` / eslint** → finish `npm ci` or `npm install` without interrupting.
- **`EADDRINUSE` :3002** → `lsof -i :3002`, kill PID, restart bridge until logs show listening.
- **`/health` 404** → wrong process on the port; expect JSON `{"ok":true,"service":"masumi-mpp-bridge",…}`.

More: **[`docs/setup-and-operations.md`](./docs/setup-and-operations.md)**.

---

## Docs index

| | |
|--|--|
| [Workflow](./docs/workflow.md) | Roles, hire sequence, 402 detail |
| [Architecture](./docs/architecture.md) | Diagram, Sokosumi vs registry |
| [Setup & operations](./docs/setup-and-operations.md) | Longer setup, Docker, hire CLI |
| [API](./docs/api.md) | Endpoint reference |
| [Agent integration](./docs/agent-integration.md) | System prompts |
| [Extensibility](./docs/extensibility.md) | Receipts, new rails |
| [PRD](./docs/prd.md) | Product requirements (proposal) |

---

## License

MIT — see [LICENSE](./LICENSE).

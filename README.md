# Masumi MPP Bridge

**Universal payment gateway that lets any MPP-enabled agent hire Masumi Network agents.**

External agents pay via HTTP 402 (Tempo/Stripe) → Bridge proxies to Masumi agents (MIP-003) → Results return with payment receipt. The external agent never touches Cardano.

## Hosted MPP provider model

**Only you (the operator)** clone this repository, run `npm install`, and configure **`.env` on the server** (or your host’s secret store). Every variable in `.env.example` is **operator-only**. You do **not** give hirers a copy of `.env`, and they do **not** download this repo to use your bridge.

**Everyone else (Tempo agents, apps, automations, end users)** only need:

1. The **public bridge base URL** you publish (e.g. `https://bridge.yourcompany.com`) — a string in their config or system prompt, not a “project env file”
2. A **Tempo wallet** (or other MPP client) that can pay **HTTP 402** challenges

They call **`GET /agents`**, **`GET …/input_schema`**, **`POST …/start_job`** (MPP handles payment), **`GET …/status/…`** — **no Masumi API keys, no Sokosumi keys, no bridge API key, no bridge `.env`.** You are the **MPP provider**: Tempo settlement hits **`MPP_RECIPIENT`** on your deployment until you add separate payout logic.

| Role | Clone this repo? | Bridge `.env`? | Needs |
|------|------------------|----------------|-------|
| **Operator (you)** | Yes | Yes (server only) | Masumi node, MPP secret, Tempo recipient, infra |
| **Hirer / client** | **No** | **No** | Public `BRIDGE_URL` + MPP-capable wallet |

## Architecture

```
┌──────────────────────┐
│  External MPP Agent  │  ← Any agent with a Tempo wallet
│  (mppx client SDK)   │     or Stripe account
└──────────┬───────────┘
           │ HTTP request
           ▼
┌──────────────────────────────────────────┐
│         Masumi MPP Bridge                │
│                                          │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │ MPP Gate    │  │ Session Manager  │  │
│  │ (402/verify)│  │ (MPP→job map)    │  │
│  └──────┬──────┘  └────────┬─────────┘  │
│         │                  │             │
│  ┌──────▼──────────────────▼──────────┐ │
│  │      MIP-003 Proxy Layer           │ │
│  │  /start_job  /status  /input_schema│ │
│  └──────┬─────────────────────────────┘ │
│         │                               │
│  ┌──────▼──────────────────────────────┐│
│  │  Receipt Logger (MPP→Cardano hash) ││
│  └─────────────────────────────────────┘│
└──────────┬───────────────┬──────────────┘
           │               │
           ▼               ▼
┌──────────────┐  ┌────────────────┐
│ Masumi Agent │  │   Tempo L1     │
│ (MIP-003)    │  │ (settlement)   │
│ on Cardano   │  └────────────────┘
└──────────────┘
```

## Goal: hire Sokosumi-listed agents via Masumi (MPP on the outside)

**Target picture:** Agents that pay with **Tempo / MPP** (or other MPP clients) can treat **Sokosumi marketplace** agents as **sub-agents**. **Masumi** stays the main spine: **MIP-003** HTTP on each agent, **registry + payment service** for identity and (native) Cardano flows. Sokosumi is the **shop window** that lists those same services and adds marketplace UX (credits, orgs, API keys).

| Layer | Role |
|--------|------|
| **Client** | Pays with MPP (e.g. Tempo pathUSD), talks only to **this bridge**. |
| **This bridge** | HTTP 402 + verify MPP, then **proxy MIP-003** (`/start_job`, `/status`, …) to the agent’s real URL. |
| **Masumi** | Protocol: [MIP-003 Agentic Service API](https://docs.masumi.network/documentation/technical-documentation/agentic-service-api), payment/registry node, on-chain registration. Native A2A hiring is described in [Enable agent collaboration](https://docs.masumi.network/documentation/how-to-guides/how-to-enable-agent-collaboration) (Cardano `purchase` path). |
| **Sokosumi** | Marketplace: discovery, billing, [list agents on Sokosumi](https://docs.masumi.network/documentation/how-to-guides/list-agent-on-sokosumi) (still **Masumi-registered + MIP-003**). Public HTTP API: **`GET /agents`** on **`https://api.sokosumi.com/v1`** — [Sokosumi API reference](https://docs.sokosumi.com/api-reference). Programmatic access often uses **coworker API keys** (see *Coworkers → api-keys* in that reference); those keys are **not** the same as **`PAYMENT_API_KEY`** on the Masumi node. |

**This repo today:** discovery uses a pluggable **catalog**:
- **`AGENT_CATALOG=registry`** (default) — Masumi Payment Service `registry` API (`PAYMENT_SERVICE_URL` + `PAYMENT_API_KEY`), same idea as pip-masumi.
- **`AGENT_CATALOG=sokosumi`** — list/detail from **Sokosumi** (`SOKOSUMI_API_KEY` as `Authorization: Bearer …`, server-side only). Requires each row to carry a **Masumi agent id** and preferably **`apiBaseUrl`** for MIP-003.
- **`AGENT_CATALOG=both`** — merge Sokosumi + registry by agent id: marketplace copy for names/prices, registry fills **missing `apiBaseUrl`** (recommended if Sokosumi payloads omit the agent URL).

Optional: **`SOKOSUMI_CREDITS_TO_USD`** — when the API returns credit-style `price` without USD, MPP charge uses `price ×` this factor (default `0.01`).

**Why Sokosumi API key is optional (this confuses people — read once):**

- **You already have an API key for the important part:** **`PAYMENT_API_KEY`** talks to **your Masumi payment service**, which exposes the **registry** (`GET …/registry/…`). That response includes each agent’s **Masumi id**, **MIP-003 base URL** (`apiBaseUrl`), and **on-chain price in lovelace**. The bridge uses that to **`GET /agents`** and to **`POST …/start_job`** by **proxying HTTP to the agent’s own server** — not by calling Sokosumi’s “create job” API.
- **Sokosumi** is mainly the **marketplace layer** (nicer listing, credits, org features). The same agents are supposed to be **Masumi-registered** with a live MIP-003 endpoint; the bridge’s hire path goes **MPP → bridge → that endpoint**.
- **`SOKOSUMI_API_KEY`** is only needed if you want the bridge’s **catalog** to be **fed from Sokosumi’s HTTP API** as well (or instead of) the registry — e.g. marketplace copy, credit-style prices, or coworker-scoped listings. Without it, **registry-only mode is complete** for discovery + hire, as long as your agents show up in the Masumi registry.
- **Live Sokosumi HTTP** may require auth (Bearer or similar); that’s why the key exists when you turn on `AGENT_CATALOG=sokosumi` / `both`. It is **not** a substitute for **`PAYMENT_API_KEY`** — different service, different purpose.

**Local doc clones (offline):** `masumi/masumi-docs`, `masumi/sokosumi-docs` — same content as [docs.masumi.network](https://docs.masumi.network) and [docs.sokosumi.com](https://docs.sokosumi.com).

### Masumi skill (Cursor, Claude Code, etc.)

When you work on this codebase in an editor that supports **agent skills**, enable the **Masumi** skill (*Masumi Network Developer*). It is the right depth for **MIP-003**, payment/registry nodes, Sokosumi, decision logging, and Cardano basics — the same ecosystem this bridge proxies and logs against.

Use the skill for **you** (operator): node setup, registration, marketplace listing, troubleshooting. **Hiring agents** that only call your deployment should still follow the bridge-only flow below (`BRIDGE_URL` + MPP, no Masumi/Sokosumi keys).

## Quick Start (operator only)

The steps below are for **you**, the person hosting the bridge. **Hirers do not run them** and do not set any bridge environment variables.

### Prerequisites

1. **Masumi Registry + Payment services** (HTTP APIs the bridge calls for agent listing and receipt logging)
   - Local dev: [masumi-services-dev-quickstart](https://github.com/masumi-network/masumi-services-dev-quickstart) runs both via Docker Compose — **same host**, **ports 3000** (registry) and **3001** (payment). It is still two URLs under the hood; set `MASUMI_SERVICES_ORIGIN=http://localhost` and `MASUMI_API_KEY` to your compose `ADMIN_KEY` so you do not duplicate the host or keys.
   - Hosted: deploy via [Railway template](https://railway.com/deploy/masumi-payment-service-official) or run services separately as needed.

2. **Tempo (operator):** an address for **`MPP_RECIPIENT`** — where MPP settlement lands on your deployment. **Tempo (clients):** only a wallet that can pay 402s (e.g. `npx mppx account create` on *their* side); they never use your `.env`.

3. **At least one Masumi agent** registered and running (reachable MIP-003 URL in the registry)

### Masumi Payment Service vs Sokosumi (which API key?)

The bridge **`GET /agents`** implementation calls the **Masumi Payment Service** HTTP API — the same **`/api/v1/registry/...`** surface that [pip-masumi](https://github.com/masumi-network/pip-masumi) uses (on-chain registry data: agent id, `apiBaseUrl`, lovelace pricing). You authenticate with **`PAYMENT_API_KEY`** from the **payment service admin** (same *kind* of key as on a normal agent `.env`).

**[Sokosumi](https://www.sokosumi.com)** is the **marketplace** (discovery UX, credits, billing). A **Sokosumi API key** is **not** the same as **`PAYMENT_API_KEY`**. You can keep **both** on the server: Masumi node for payments/receipt logging, Sokosumi for **catalog** and coworker-facing listings when you set `AGENT_CATALOG` and `SOKOSUMI_API_KEY`.

**Summary:** **`PAYMENT_API_KEY`** = Masumi node (registry + payment). **`SOKOSUMI_API_KEY`** = optional marketplace HTTP catalog (never given to MPP clients).

### Setup

```bash
# Operator: clone and install (hirers never need this repo)
git clone <this-repo>
cd masumi-mpp-bridge
npm install

# Operator: configure secrets on the deployment host only
cp .env.example .env
# Edit `.env` — **only you**; never distribute to clients. They have no bridge env vars to set.
# Same `PAYMENT_SERVICE_URL`, `PAYMENT_API_KEY`, `NETWORK` as a Masumi agent (`/api/v1`).
# MPP: `MPP_SECRET_KEY` + `MPP_RECIPIENT` (or dev stub 402).
# ADA/USD for MPP pricing is fetched from CoinGecko with TTL caching; a built-in fallback
# applies if the oracle is disabled or unreachable (optional env overrides in `config.ts`).

# Run in development
npm run dev

# Build for production
npm run build
npm start
```

### Troubleshooting

- **`Cannot find package '@hono/node-server'`** — `node_modules` is incomplete (often **`npm ci` was interrupted** with Ctrl+C). Run `npm ci` (or `npm install`) again and let it finish before `npm start`.
- **`eslint: command not found`** — Same as above: devDependencies never finished installing.
- **`EADDRINUSE` on port 3002** — Something else is bound to that port. Run `lsof -i :3002`, note the **numeric** PID in the second column, then `kill 12345` (replace with your real PID — do not type the characters `<PID>`).
- **`curl …/health` returns `404`** — The bridge is **not** the process listening on that port (often an old `node` still running from a previous start). Fix `EADDRINUSE` first, start the bridge until you see **“listening on port …”**, then curl again. A successful health check looks like JSON: `{"ok":true,"service":"masumi-mpp-bridge",…}`.
- **`EBADENGINE` from npm** — Prefer Node **≥22.13** or **≥20.19** so ESLint’s dependencies match; the app may still run on slightly older 22.x with only a warning.

### Test the Bridge (operator or local)

```bash
# 1. List available agents (free)
curl http://localhost:3002/agents

# 2. Check an agent's input schema (free)
curl http://localhost:3002/agents/AGENT_ID/input_schema

# 3. Hire an agent (requires MPP payment)
# Using mppx CLI (auto-handles 402 challenge):
npx mppx http://localhost:3002/agents/AGENT_ID/start_job \
  --method POST \
  -J '{"input_data": [{"key": "prompt", "value": "Analyze AI market trends"}]}'

# 4. Poll for results (free)
curl http://localhost:3002/agents/AGENT_ID/status/JOB_ID
```

### Optional: `masumi-hire` CLI

**Not required for hirers.** Most clients will use **`curl`**, **`npx mppx`**, or an HTTP client from their agent runtime — still **no** clone of this repo and **no** bridge `.env`.

The `masumi-hire` script is mainly for **you** (smoke tests) or for publishing later as a **standalone** tool. If someone uses it, they only set **`BRIDGE_URL`** in the shell (your public URL) plus their own **mppx** wallet — never the operator `.env`.

```bash
export BRIDGE_URL=https://your-bridge.example.com

# Only if you have this repo checked out (operator dev / optional tool)
npm run hire -- agents
npm run hire -- schema AGENT_ID
npm run hire -- suggest "summarize a research paper"
npm run hire -- run AGENT_ID --prompt "Your task here"
```

`run` shells out to `npx mppx` so the 402 flow matches the `curl` example above.

## Repository layout

| Path | Role |
|------|------|
| `src/index.ts` | Process entry (`serve`, startup warnings) |
| `src/app.ts` | `createApp()` — wires CORS, services, routes |
| `src/http/routes.ts` | All HTTP handlers |
| `src/catalog/` | Agent listing backends (registry, Sokosumi, merge) |
| `src/lib/` | Logger, MPP pricing helpers, version read from `package.json` |
| `src/middleware/` | MPP 402 gate |
| `src/proxy/` | MIP-003 client |
| `src/cli/` | Optional `masumi-hire` helper |

## Production

**Node (operator host)**

```bash
npm ci
npm run build   # clean + tsc
npm start       # node dist/index.js — set PORT and full `.env` on the host
```

**Scripts:** `npm run lint`, `npm run typecheck`, `npm run clean`.

**Docker**

```bash
docker build -t masumi-mpp-bridge .
docker run --rm -p 3002:3002 --env-file .env masumi-mpp-bridge
```

Image runs as user `node`, exposes `3002`, and includes a `HEALTHCHECK` on `GET /health`.

## API Reference

### Free Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Bridge metadata + agent instructions |
| GET | `/health` | Liveness JSON (`ok`, `version`) for load balancers / K8s |
| GET | `/agents` | List all available Masumi agents |
| GET | `/agents/:id/availability` | Health check for an agent |
| GET | `/agents/:id/input_schema` | Input format for an agent |
| GET | `/agents/:id/status/:jobId` | Poll job status + results |

### Paid Endpoints (MPP 402)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/:id/start_job` | Hire an agent (pays agent's price) |
| POST | `/agents/:id/provide_input/:jobId` | Send additional input ($0.001) |

### Payment Flow

1. Client sends request without payment
2. Bridge returns `402 Payment Required` with challenge:
   ```
   WWW-Authenticate: Payment realm="masumi-mpp-bridge" challenge="abc123"
   ```
3. Client pays via Tempo (pathUSD) and retries with:
   ```
   Authorization: Payment <credential>
   ```
4. Bridge verifies, proxies to agent, returns result with:
   ```
   Payment-Receipt: {"challengeId":"abc123","status":"settled",...}
   ```

## For AI Agent System Prompts

Paste this into a **hiring** agent’s instructions. They **do not** clone this repo, **do not** use `.env`, and need **no** Masumi/Sokosumi/bridge API keys — only the public URL and an MPP wallet:

```
You can hire Masumi-network agents (MIP-003) through the MPP Bridge at {BRIDGE_URL}.
Do not clone the bridge repository and do not use a bridge .env — you only need this URL and MPP (e.g. Tempo wallet via mppx). No Masumi or marketplace API keys.
GET /agents — discover agents. GET /agents/:id/input_schema — input format.
POST /agents/:id/start_job — pay via HTTP 402 (mppx signs and retries automatically).
Poll GET /agents/:id/status/:jobId until status is "completed" for results.
```

## Cross-Chain Receipt Logging

When a job completes, the bridge:
1. Takes the MPP receipt (Tempo settlement proof)
2. Hashes it with the job's input/output hashes
3. Submits the composite hash to Masumi's decision logging on Cardano

This creates a verifiable cross-chain audit trail:
- **Payment proof**: Tempo blockchain
- **Accountability proof**: Cardano blockchain
- **Agent identity**: Masumi Registry (Cardano NFTs)

## Adding More Payment Rails

The bridge is designed to be extensible. To add x402 or Kairen:

1. Create a new middleware in `src/middleware/` (e.g., `x402-gate.ts`)
2. Add the payment method detection in the main handler
3. Map the new protocol's credential format to the bridge's internal format

The MIP-003 proxy layer and session manager don't change — they're payment-agnostic.

## License

MIT — see [LICENSE](./LICENSE).

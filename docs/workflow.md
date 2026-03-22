# Workflow

## Roles

### Operator (bridge host)

You run this service, configure **server-side** secrets from [`.env.example`](../.env.example), and publish a **public base URL**. Hirers never receive your `.env` or clone this repository for normal use.

### Hirer (MPP client)

Any agent or app with an **MPP-capable wallet** (e.g. Tempo via `mppx`) needs only:

1. Your public bridge URL (e.g. `https://bridge.example.com`)
2. The ability to pay **HTTP 402** challenges

No Masumi API keys, Sokosumi keys, bridge API keys, or bridge `.env`.

| Role | Clone repo? | Bridge `.env`? | Typical needs |
|------|-------------|----------------|---------------|
| **Operator** | Yes | Yes (host only) | Masumi payment/registry URLs, `PAYMENT_API_KEY`, MPP secret + recipient, infra |
| **Hirer** | No | No | `BRIDGE_URL` + MPP wallet |

MPP settlement for your deployment lands at **`MPP_RECIPIENT`** until you add separate payout logic.

Today, the active external rail is **MPP**. Longer term, the bridge is meant to expose multiple payment rails while keeping the same Masumi-facing MIP-003 flow behind them.

---

## End-to-end hire flow (hirer)

1. **Discovery** — `GET /agents` (no payment). Lists agents with metadata and prices exposed for MPP.
2. **Schema** — `GET /agents/:id/input_schema` (no payment).
3. **Start job** — `POST /agents/:id/start_job` with `input_data` (or equivalent per MIP-003). First response is **402 Payment Required** with an MPP challenge (`WWW-Authenticate: Payment …`).
4. **Pay & retry** — MPP client (e.g. `npx mppx`) settles on Tempo and retries with `Authorization: Payment <credential>`.
5. **Verify & proxy** — Bridge verifies the payment through the active rail plugin, maps the payer identity for Masumi, and proxies **MIP-003** to the agent’s real `apiBaseUrl`.
6. **Poll** — `GET /agents/:id/status/:jobId` until status is `completed` (or terminal failure).
7. **Receipts (operator-side)** — On completion, the bridge can log a composite receipt hash to Masumi decision logging (see [Extensibility](extensibility.md)).

Optional paid path: `POST /agents/:id/provide_input/:jobId` for additional input (small fixed fee in the implementation).

---

## HTTP 402 payment sequence (detail)

1. Client sends the paid request **without** a valid payment credential.
2. Bridge responds with **402** and a challenge, e.g.  
   `WWW-Authenticate: Payment realm="masumi-mpp-bridge" challenge="…"`
3. Client pays via Tempo (pathUSD) and retries with  
   `Authorization: Payment <credential>`.
4. After verification, the bridge proxies to the agent and may return  
   `Payment-Receipt: {"challengeId":"…","status":"settled",…}` (shape depends on `mppx` / bridge version).

---

## Operator setup flow (summary)

1. Run **Masumi Registry + Payment** HTTP APIs the bridge calls (local Docker quickstart or hosted template — links in [Setup & operations](setup-and-operations.md)).
2. Ensure at least one **MIP-003** agent is registered with a reachable `apiBaseUrl`.
3. Configure **Tempo**: `MPP_SECRET_KEY`, `MPP_RECIPIENT`, and related MPP env as in `.env.example`.
4. `npm install`, copy `.env.example` → `.env`, edit secrets, `npm run dev` or `npm run build && npm start`.

ADA/USD for MPP-facing prices is typically fetched from CoinGecko with TTL caching, with fallbacks if the oracle is disabled (see `src/config.ts` / `src/pricing/`). Future rails can use different pricing and settlement logic without changing the MIP-003 proxy layer.

---

## Quick manual test (operator or local)

```bash
curl http://localhost:3002/agents
curl http://localhost:3002/agents/AGENT_ID/input_schema

npx mppx http://localhost:3002/agents/AGENT_ID/start_job \
  --method POST \
  -J '{"input_data": [{"key": "prompt", "value": "Hello"}]}'

curl http://localhost:3002/agents/AGENT_ID/status/JOB_ID
```

Replace `AGENT_ID` / `JOB_ID` with values from your environment.

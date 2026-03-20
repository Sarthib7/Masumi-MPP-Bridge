# PRD: Masumi MPP Bridge — Universal Payment Gateway for Masumi Agents

**Version:** 0.1  
**Date:** March 20, 2026  
**Author:** Kairen Protocol  
**Status:** Proposal  

---

## 1. Problem statement

Masumi Network hosts a growing ecosystem of AI agents (agentic services) that perform tasks for payment. These agents are registered on Cardano, accept payments via Cardano escrow (ADA/USDCx), and follow the MIP-003 API standard. Sokosumi, the marketplace layer, already lists agents like Hannah (research), Alex (data analysis), and Elena (project management) as "Agentic Coworkers."

The problem: **external agents cannot easily hire Masumi agents.** Any caller today must understand Cardano, hold ADA, interact with Masumi's escrow smart contracts, and implement the full payment lifecycle. This limits the addressable market to agents already inside the Masumi/Cardano ecosystem.

Meanwhile, Machine Payments Protocol (MPP) — co-authored by Stripe and Tempo Labs, launched March 18, 2026 — is rapidly becoming the standard for machine-to-machine payments on the open web. MPP uses HTTP 402 challenge-response, settles on Tempo L1 (sub-second, sub-millidollar fees), and is supported by Anthropic, OpenAI, Visa, Mastercard, Shopify, Cloudflare, and 100+ services at launch.

**The opportunity:** Build a bridge that lets any MPP-enabled agent hire Masumi agents without touching Cardano. This makes Masumi's entire agent ecosystem accessible to the broader AI agent economy.

---

## 2. Solution overview

Build the **Masumi MPP Bridge** — a payment gateway service that sits in front of Masumi agents and translates between MPP (HTTP 402) and MIP-003 (Masumi's agentic service standard).

**One sentence:** External agents pay with Tempo/Stripe via HTTP 402, the bridge proxies jobs to Masumi agents, and results come back with a payment receipt.

### What it is

- An HTTP server (Hono/Node.js) deployed as a standalone service
- Exposes Masumi agents as standard web APIs with MPP payment gates
- Handles payment verification, job proxying, session management, and cross-chain receipt logging
- Designed for extensibility — MPP is the first payment rail, x402 and Kairen follow

### What it is not

- Not a modification to Masumi's protocol or smart contracts
- Not a blockchain bridge (no cross-chain token transfers)
- Not a replacement for Masumi's native payment system (that still works for Cardano-native agents)

---

## 3. Architecture

### 3.1 System layers

```
┌──────────────────────────────────────┐
│        External MPP Agents           │  Any agent with Tempo wallet, 
│   (mppx SDK, Stripe, card, etc.)     │  Stripe, or credit card
└──────────────────┬───────────────────┘
                   │ HTTP requests
                   ▼
┌──────────────────────────────────────┐
│       MASUMI MPP BRIDGE              │
│                                      │
│  ┌────────────┐  ┌───────────────┐  │
│  │  MPP Gate   │  │ Agent Registry│  │
│  │  (402/auth) │  │ (discovery)   │  │
│  └──────┬──────┘  └───────┬───────┘  │
│         │                 │          │
│  ┌──────▼─────────────────▼───────┐  │
│  │     MIP-003 Proxy Layer        │  │
│  │  (forwards to Masumi agents)   │  │
│  └──────┬─────────────────────────┘  │
│         │                            │
│  ┌──────▼──────┐  ┌──────────────┐  │
│  │ Session Mgr  │  │Receipt Logger│  │
│  │(MPP↔job map) │  │(cross-chain) │  │
│  └──────────────┘  └──────────────┘  │
└──────────┬────────────────┬──────────┘
           │                │
           ▼                ▼
┌──────────────┐   ┌────────────────┐
│Masumi Agents │   │   Tempo L1     │
│(MIP-003, any │   │  (settlement)  │
│ framework)   │   └────────────────┘
│              │   ┌────────────────┐
│ Payment Svc  │   │    Cardano     │
│ Registry Svc │   │ (decision log) │
└──────────────┘   └────────────────┘
```

### 3.2 Component responsibilities

**MPP gate (middleware):** Intercepts incoming requests. For paid endpoints, returns HTTP 402 with a payment challenge specifying amount, currency (pathUSD/USDC), and recipient address. On retry with valid `Authorization: Payment` credential, verifies the payment on Tempo chain and passes the request through.

**Agent registry:** Queries Masumi's Registry Service (port 3000) for registered agents. Caches results. Converts Masumi's lovelace pricing to USD amounts for MPP challenges. Exposes a clean REST API for external agent discovery.

**MIP-003 proxy:** Forwards verified requests to the actual Masumi agent's MIP-003 endpoints (`/start_job`, `/status/:id`, `/input_schema`, `/availability`, `/provide_input/:id`). Translates between MPP's payer identity and Masumi's `identifier_from_purchaser` format.

**Session manager:** Maps MPP payment sessions to Masumi job lifecycles. Tracks which payment paid for which job, the settlement chain, amounts, and state transitions (active → completed → logged).

**Receipt logger:** After job completion, creates a composite SHA-256 hash of the MPP receipt + job input hash + job output hash. Submits this to Masumi's decision logging on Cardano. Creates a cross-chain audit trail: payment proof on Tempo, accountability proof on Cardano.

### 3.3 Endpoint design

#### Free endpoints (no payment required)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Bridge metadata, supported payment methods, agent instructions for system prompts |
| GET | `/agents` | List all available Masumi agents with pricing in USD |
| GET | `/agents/:id/availability` | Health check (MIP-003 passthrough) |
| GET | `/agents/:id/input_schema` | Input format (MIP-003 passthrough) |
| GET | `/agents/:id/status/:jobId` | Job status polling (MIP-003 passthrough) |

#### Paid endpoints (HTTP 402 required)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/agents/:id/start_job` | Hire an agent — price equals agent's registered rate |
| POST | `/agents/:id/provide_input/:jobId` | Send additional input to running job ($0.001) |

### 3.4 Payment flow (step by step)

1. **Discovery:** External agent calls `GET /agents` — receives list of agents with names, descriptions, capabilities, and USD prices. No payment needed.
2. **Schema check:** Agent calls `GET /agents/:id/input_schema` — learns what input format the Masumi agent expects. No payment needed.
3. **Job request:** Agent calls `POST /agents/:id/start_job` with job input data. Bridge returns `402 Payment Required` with: `WWW-Authenticate: Payment realm="masumi-mpp-bridge" challenge="<id>"` and a JSON body specifying amount, currency (pathUSD on Tempo), and recipient wallet.
4. **Payment:** Agent's MPP client (mppx SDK) handles this automatically — signs a Tempo transaction, sends the credential in `Authorization: Payment` header, retries the request.
5. **Verification:** Bridge verifies the credential against Tempo chain (confirms tx settled, correct amount, correct recipient).
6. **Proxy:** Bridge converts the MPP payer address into a Masumi-compatible `identifier_from_purchaser` (hex), then calls the Masumi agent's `/start_job` endpoint.
7. **Job creation:** Masumi agent creates the job, returns `job_id` and time constraints. Bridge returns this to the external agent along with a `Payment-Receipt` header.
8. **Polling:** External agent polls `GET /agents/:id/status/:jobId` for free until status is `completed`.
9. **Receipt logging:** On completion, bridge hashes the MPP receipt + input/output hashes and submits to Masumi's decision log on Cardano.

### 3.5 Dual-mode payment support

The bridge detects the payment protocol from request headers and routes accordingly:

- `Authorization: Payment` present → MPP flow (settle on Tempo)
- Masumi `identifier_from_purchaser` present → traditional Masumi escrow flow (settle on Cardano)
- Neither present → return 402 with MPP challenge as default

This means the bridge serves both MPP-native agents AND existing Masumi agents transparently.

---

## 4. Technical specifications

### 4.1 Tech stack

- **Runtime:** Node.js 20+ / Bun
- **Framework:** Hono (Fetch API compatible, works on Cloudflare Workers, Vercel, Railway)
- **MPP SDK:** `mppx` (TypeScript, from Tempo Labs)
- **Language:** TypeScript
- **Database:** PostgreSQL (shared with Masumi Payment Service, or separate)
- **Deployment:** Railway (one-click), Vercel Edge, Cloudflare Workers, or Docker

### 4.2 Dependencies

| Dependency | Purpose | Source |
|-----------|---------|--------|
| `mppx/server` | MPP 402 challenge-response, payment verification | npm (Tempo Labs) |
| `hono` | HTTP server framework | npm |
| Masumi Payment Service | Wallet management, escrow, decision logging | Self-hosted (port 3001) |
| Masumi Registry Service | Agent discovery, metadata | Self-hosted (port 3000) |
| Blockfrost API | Cardano blockchain interaction | blockfrost.io |
| Tempo RPC | Payment verification on Tempo L1 | Public endpoint |

### 4.3 Configuration (environment variables)

```
# Tempo / MPP
MPP_RECIPIENT=0x...         # Bridge's receiving Tempo wallet
MPP_CURRENCY=0x20c0...      # pathUSD contract address
MPP_TESTNET=true             # Tempo testnet for development

# Masumi
MASUMI_PAYMENT_URL=http://localhost:3001/api/v1
MASUMI_PAYMENT_API_KEY=...
MASUMI_REGISTRY_URL=http://localhost:3000/api/v1
MASUMI_REGISTRY_API_KEY=...
MASUMI_NETWORK=Preprod       # Preprod or Mainnet

# Cardano
BLOCKFROST_API_KEY=...

# Optional: Stripe for fiat
STRIPE_ENABLED=false
STRIPE_SECRET_KEY=sk_...
```

### 4.4 MIP-003 compliance

The bridge preserves full MIP-003 compliance. Every request to a Masumi agent goes through the standard MIP-003 API. The bridge only adds a payment layer on top — it never modifies the MIP-003 contract between caller and agent.

Required MIP-003 endpoints on target agents:
- `GET /availability` — health check, returns `available` or `unavailable`
- `GET /input_schema` — returns JSON schema for `/start_job` input
- `POST /start_job` — creates job, returns `job_id` + blockchain identifiers
- `GET /status/:job_id` — returns `pending | awaiting_payment | running | completed | failed`
- `POST /provide_input/:job_id` — sends additional input to running job

### 4.5 Cross-chain receipt hashing

The composite hash follows MIP-004 principles adapted for cross-chain:

```
composite_hash = SHA256(JSON.stringify({
  mpp_receipt: {
    challengeId: "...",
    txHash: "0x...",          // Tempo transaction hash
    method: "tempo",
    amount: "0.05",
    settledAt: "2026-03-20T..."
  },
  input_hash: "abc123...",    // From Masumi /start_job response
  output_hash: "def456...",   // From job completion output
  job_id: "...",
  agent_id: "..."
}))
```

This hash is submitted to Masumi Payment Service's `/payment/complete` endpoint for on-chain recording on Cardano.

---

## 5. Stripe / card payments (future Phase 4)

MPP natively supports Stripe as a payment method. This means external agents can pay with credit cards, Apple Pay, Google Pay, or any Stripe-supported payment method — not just crypto.

The bridge would add `stripe.charge()` as a second payment method in the MPP middleware. When an agent's MPP client supports Stripe, the 402 challenge includes both Tempo and Stripe as options. The client picks whichever it has configured.

This opens Masumi agents to traditional payment rails without any changes to the agents themselves. The bridge handles the complexity.

Implementation: add `stripe` method to `Mppx.create({ methods: [tempo.charge(...), stripe.charge(...)] })` and handle Stripe PaymentIntent creation for dynamic recipient addresses.

---

## 6. Implementation phases

### Phase 1: Core bridge (Week 1)

**Goal:** External MPP agents can discover and hire Masumi agents on testnet.

- Set up Hono server with CORS
- Implement MPP gate middleware using `mppx/server` SDK
- Implement agent registry (query Masumi Registry Service, cache, convert prices)
- Implement MIP-003 proxy (forward all 5 endpoints)
- Implement basic session-job mapping (in-memory)
- Deploy on Railway alongside Masumi Payment Service
- Test with `npx mppx` CLI against Tempo testnet + Masumi Preprod

**Deliverables:** Working bridge on testnet, external agent can hire a Masumi agent via MPP.

### Phase 2: Session management + price oracle (Week 2)

**Goal:** Robust session lifecycle, accurate pricing.

- Replace in-memory session store with PostgreSQL
- Implement session lifecycle: open → active → completed → logged → closed
- Add session cleanup (expire stale sessions after configurable timeout)
- Integrate price oracle for ADA/USD conversion (CoinGecko or Chainlink)
- Add session-based MPP payments for multi-step jobs (payment channel)
- Implement `suggestedDeposit` based on agent's registered price

**Deliverables:** Production-grade session management, accurate real-time pricing.

### Phase 3: Cross-chain receipt logging (Week 2-3)

**Goal:** Verifiable audit trail spanning Tempo and Cardano.

- Implement receipt logger with composite hashing
- Submit hashes to Masumi Payment Service for Cardano recording
- Add receipt verification endpoint (`GET /receipts/:jobId`)
- Handle async logging (don't block job responses)
- Add monitoring for failed receipt submissions

**Deliverables:** Cross-chain audit trail for every job, verifiable on both chains.

### Phase 4: Stripe / card payments (Week 3)

**Goal:** Fiat payment support for external agents.

- Add `stripe.charge()` to MPP middleware
- Handle Stripe PaymentIntent creation with dynamic recipient
- Map Stripe settlements to session-job mappings
- Test with Stripe testnet + Masumi Preprod

**Deliverables:** External agents can pay with credit cards via MPP.

### Phase 5: Mainnet + hardening (Week 4)

**Goal:** Production deployment.

- Switch to Tempo mainnet + Cardano mainnet
- Add rate limiting per MPP payer address
- Add API key management for bridge clients (optional, for premium access)
- Add Prometheus metrics (jobs/sec, payment latency, success rate)
- Add health check endpoint with dependency status
- Security audit of payment verification logic
- Documentation for Masumi agent operators

**Deliverables:** Production-ready bridge on mainnet.

---

## 7. Future payment rails

The bridge architecture is designed for pluggable payment rails. Each rail is a middleware module. The proxy layer, session manager, and receipt logger are payment-agnostic.

| Rail | Protocol | Settlement | Status |
|------|----------|------------|--------|
| MPP (Tempo) | HTTP 402, `Authorization: Payment` | Tempo L1 (pathUSD/USDC) | Phase 1 (current) |
| MPP (Stripe) | HTTP 402, `Authorization: Payment` | Stripe (fiat) | Phase 4 |
| x402 | HTTP 402, `X-PAYMENT` header | Base L2 (USDC) | Future |
| Kairen x402n | HTTP 402, offchain negotiation | Solana (USDC) | Future |
| Masumi native | `identifier_from_purchaser` | Cardano (ADA/USDCx) | Passthrough (always) |

Detection logic reads request headers to determine which rail:
- `Authorization: Payment` → MPP
- `X-PAYMENT` → x402
- `identifier_from_purchaser` in body → Masumi native
- None → return 402 with default (MPP) challenge

Adding a new rail requires:
1. Create `src/middleware/<rail>-gate.ts` implementing the charge/verify interface
2. Add header detection in the main router
3. No changes to proxy, sessions, or receipt logger

---

## 8. Success metrics

- **Adoption:** Number of external agents hiring Masumi agents through the bridge
- **Revenue:** Total USD settled through the bridge (MPP + Stripe)
- **Latency:** Time from payment verification to job creation (target: <500ms)
- **Reliability:** Bridge uptime (target: 99.9%)
- **Cross-chain:** Percentage of jobs with successful receipt logging on both chains

---

## 9. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MPP is 2 days old — API may change | Medium | Pin mppx version, abstract behind our middleware interface |
| ADA/USD price volatility affects pricing | Medium | Use real-time oracle, cache with 60s TTL, allow agent operators to set USD price directly |
| Masumi agent downtime blocks paid jobs | High | Check `/availability` before charging, refund flow via MPP session close |
| Tempo chain congestion | Low | MPP sessions use off-chain vouchers, only open/close are on-chain |
| Cross-chain receipt logging fails | Low | Best-effort logging, don't block job response, retry queue |

---

## 10. Open questions for team discussion

1. **Pricing authority:** Should the bridge use Masumi's registered lovelace price (converted to USD) or let agent operators set a separate USD price for MPP clients?
2. **Revenue model:** Should the bridge take a fee on top of agent prices (e.g., 2% on MPP transactions)?
3. **Refund policy:** If a Masumi agent fails mid-job after MPP payment, how do we handle refunds? MPP has no native dispute mechanism — do we build our own?
4. **Agent opt-in:** Should Masumi agents need to explicitly opt in to being accessible via the bridge, or is it open by default for all registered agents?
5. **Sokosumi integration:** Should this bridge eventually be integrated into Sokosumi's codebase (alongside their existing Stripe and Masumi payment clients), or remain a standalone service?
6. **Kairen positioning:** How does this bridge fit into Kairen Protocol's roadmap? Is it a standalone product, a feature of x402n, or the foundation for Kairen's marketplace?

---

## 11. Agent instructions

Copy this into any AI agent's system prompt to enable it to use the bridge:

```
You have access to Masumi AI agents via the MPP Bridge at {BRIDGE_URL}.

DISCOVERY:
- GET /agents — lists all available agents with names, capabilities, and USD prices
- GET /agents/:id/input_schema — returns the expected input format for a specific agent
- GET /agents/:id/availability — checks if an agent is online

HIRING AN AGENT:
- POST /agents/:id/start_job — sends job input, requires MPP payment
- Payment is handled automatically via HTTP 402 — your MPP client (mppx) handles the challenge-response
- You'll receive a job_id in the response

GETTING RESULTS:
- GET /agents/:id/status/:jobId — poll until status is "completed"
- The response will contain the agent's output when done

PAYMENT:
- All payments use pathUSD on Tempo via MPP
- Your mppx client handles payment automatically when it receives a 402 response
- Prices are listed in USD on the /agents endpoint
```

---

## Appendix A: Protocol references

- **MPP specification:** https://mpp.dev/overview
- **MPP server SDK:** `mppx/server` (npm)
- **MIP-003 standard:** https://docs.masumi.network/mips/_mip-003
- **Masumi docs:** https://docs.masumi.network
- **Masumi Python SDK:** `pip install masumi`
- **Tempo docs:** https://docs.tempo.xyz
- **Cloudflare MPP proxy (reference):** https://github.com/cloudflare/mpp-proxy

## Appendix B: Code repository structure

```
masumi-mpp-bridge/
├── src/
│   ├── index.ts              # Main Hono server + route definitions
│   ├── config.ts             # Environment variable configuration
│   ├── middleware/
│   │   └── mpp-gate.ts       # MPP 402 challenge-response middleware
│   ├── proxy/
│   │   └── mip003-proxy.ts   # MIP-003 endpoint forwarding
│   ├── sessions/
│   │   └── session-job-manager.ts  # MPP session ↔ job mapping
│   ├── logging/
│   │   └── receipt-logger.ts # Cross-chain receipt hashing + submission
│   └── registry/
│       └── agent-registry.ts # Masumi Registry Service client
├── .env.example
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

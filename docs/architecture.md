# Architecture

## High-level diagram

```
┌──────────────────────┐
│  External MPP Agent  │  ← Any agent with a Tempo wallet
│  (mppx client SDK)   │     or other MPP client
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

## Goal: Sokosumi-listed agents, MPP on the outside

**Target picture:** Agents that pay with **Tempo / MPP** can treat **Sokosumi marketplace** agents as sub-agents. **Masumi** remains the spine: **MIP-003** on each agent, registry + payment service for identity and Cardano-native flows. Sokosumi is discovery and marketplace UX.

| Layer | Role |
|--------|------|
| **Client** | Pays with MPP; talks only to **this bridge**. |
| **This bridge** | HTTP 402 + MPP verify, then **proxy MIP-003** to the agent URL. |
| **Masumi** | [MIP-003 Agentic Service API](https://docs.masumi.network/documentation/technical-documentation/agentic-service-api), payment/registry node. Native A2A: [Enable agent collaboration](https://docs.masumi.network/documentation/how-to-guides/how-to-enable-agent-collaboration). |
| **Sokosumi** | Marketplace; agents still Masumi-registered + MIP-003. Public API: `GET /agents` on `https://api.sokosumi.com/v1` — [Sokosumi API reference](https://docs.sokosumi.com/api-reference). Coworker API keys ≠ `PAYMENT_API_KEY` on the Masumi node. |

## Agent catalog (`AGENT_CATALOG`)

Discovery is pluggable:

- **`registry`** (default) — Masumi Payment Service `registry` API (`PAYMENT_SERVICE_URL` + `PAYMENT_API_KEY`).
- **`sokosumi`** — List/detail from Sokosumi (`SOKOSUMI_API_KEY` as `Authorization: Bearer …`, server-only). Rows should include Masumi agent id and preferably `apiBaseUrl`.
- **`both`** — Merge Sokosumi + registry by agent id: marketplace copy for names/prices; registry fills missing `apiBaseUrl` (recommended if Sokosumi omits agent URL).

Optional: **`SOKOSUMI_CREDITS_TO_USD`** — when the API returns credit-style `price` without USD, MPP charge uses `price ×` this factor (default `0.01`).

## Why `SOKOSUMI_API_KEY` is optional (read once)

- **`PAYMENT_API_KEY`** talks to **your Masumi payment service**, including **registry** (`GET …/registry/…`): Masumi id, **MIP-003 base URL** (`apiBaseUrl`), on-chain price in lovelace. The bridge uses that to list agents and to **`POST …/start_job`** by **HTTP proxy to the agent** — not Sokosumi’s “create job” API.
- **Sokosumi** is mainly marketplace listing (credits, orgs). Hire path is **MPP → bridge → agent MIP-003 endpoint**.
- **`SOKOSUMI_API_KEY`** is only for catalog feeds from Sokosumi’s HTTP API (`sokosumi` / `both`). **Registry-only** is enough for discovery + hire if agents appear in the Masumi registry.
- Sokosumi HTTP may require Bearer auth; that is why the key exists when using `sokosumi` / `both`. It does **not** replace **`PAYMENT_API_KEY`**.

**Summary:** `PAYMENT_API_KEY` = Masumi node (registry + payment). `SOKOSUMI_API_KEY` = optional marketplace catalog only.

## Masumi skill (for operators)

In editors that support **agent skills**, the **Masumi** skill helps with MIP-003, payment/registry nodes, Sokosumi, and Cardano basics. Use it for **your** node setup and troubleshooting — not for distributing secrets to hirers.

## Local doc clones (offline)

If you keep local mirrors: `masumi/masumi-docs`, `masumi/sokosumi-docs` — same material as [docs.masumi.network](https://docs.masumi.network) and [docs.sokosumi.com](https://docs.sokosumi.com).

# Visual Architecture

This is the reference visual for the **roadmap-aligned architecture**.

Read it with the roadmap in [roadmap.md](roadmap.md):

- **Phase 0**: align docs, code, and product boundaries
- **Phase 1**: harden the first external rail
- **Phase 2**: add persistence, tests, and operations
- **Phase 3**: add more payment rails
- **Phase 4**: mainnet readiness

## 1. Target Architecture

```mermaid
flowchart LR
    Client["Hiring Client / Agent<br/>MPP first, more rails later"]

    subgraph Bridge["Masumi Payment Bridge"]
        Router["HTTP API / Route Layer"]
        Rail["Active Payment Rail Plugin<br/>MPP in Phase 0/1"]
        Session["Session + Idempotency Layer<br/>In-memory now, durable in Phase 2"]
        Proxy["MIP-003 Proxy Layer"]
        Receipt["Receipt Logging / Audit Layer<br/>Best-effort now, stronger delivery later"]
    end

    subgraph Masumi["Masumi Core"]
        Registry["Registry Service"]
        Payment["Payment / Decision Log Service"]
        Agent["Registered MIP-003 Agent"]
    end

    subgraph Settlements["Settlement Networks"]
        Tempo["Tempo / MPP Settlement<br/>Current external rail"]
        Cardano["Cardano<br/>Native Masumi rail + accountability"]
        Future["Future Rails<br/>x402 / Kairen / Fiat-backed MPP / Others<br/>Phase 3+"]
    end

    Client --> Router
    Router --> Rail
    Router --> Session
    Router --> Proxy
    Proxy --> Registry
    Proxy --> Agent
    Session --> Receipt
    Rail --> Tempo
    Rail -. future plugin path .-> Future
    Receipt --> Payment
    Payment --> Cardano
    Registry --> Cardano
    Agent --> Payment
```

## 2. Phase 0-1 Runtime Flow: MPP First

```mermaid
sequenceDiagram
    participant C as Hiring Client
    participant B as Bridge
    participant R as MPP Rail Plugin
    participant G as Masumi Registry
    participant A as MIP-003 Agent
    participant P as Masumi Payment / Decision Log
    participant T as Tempo

    C->>B: GET /agents
    B->>G: List registered agents
    G-->>B: Agent metadata + pricing
    B-->>C: Agent list + MPP-facing prices

    C->>B: POST /agents/:id/start_job
    B->>R: Charge request
    R-->>C: HTTP 402 challenge

    C->>T: Settle MPP payment
    C->>B: Retry with Authorization: Payment
    B->>R: Verify receipt
    R-->>B: Verified

    B->>A: POST /start_job (MIP-003)
    A-->>B: job_id
    B->>B: Store session / receipt mapping
    B-->>C: job_id + status URL + Payment-Receipt

    C->>B: GET /agents/:id/status/:jobId
    B->>A: GET /status
    A-->>B: completed + output
    B->>P: Optional receipt log / decision record
    P-->>B: best-effort acknowledgment
    B-->>C: Job result
```

## 3. Phase-by-Phase Delivery Shape

```mermaid
flowchart LR
    P0["Phase 0<br/>Source-of-truth reset"] --> P1["Phase 1<br/>Harden MPP rail"]
    P1 --> P2["Phase 2<br/>Persistence + tests + ops"]
    P2 --> P3["Phase 3<br/>Multi-rail expansion"]
    P3 --> P4["Phase 4<br/>Mainnet readiness"]

    P0 --- P0a["Clarify product boundary:<br/>Masumi core + payment rail plugins"]
    P1 --- P1a["Fail-closed MPP config<br/>Validation<br/>Retries/timeouts<br/>Structured logs<br/>Idempotency"]
    P2 --- P2a["Redis/Postgres sessions<br/>Automated tests<br/>Metrics/alerts/runbooks"]
    P3 --- P3a["Add next rail without changing MIP-003 proxy"]
    P4 --- P4a["Production controls<br/>Incident process<br/>Real-value staging runs"]
```

## 4. Payment Rail Model

```mermaid
flowchart TB
    Incoming["Incoming Paid Request"]

    subgraph RailBoundary["Payment Rail Boundary"]
        Native["Masumi Native Rail<br/>identifier_from_purchaser<br/>Always first-class"]
        MPP["MPP Plugin<br/>Phase 0-1 shipping rail"]
        X402["Future x402 Plugin<br/>Phase 3+"]
        Kairen["Future Kairen Plugin<br/>Phase 3+"]
        Fiat["Future Fiat / Card-backed Plugin<br/>Phase 3+"]
    end

    Proxy["Shared MIP-003 Proxy"]
    Session["Shared Session / Idempotency"]
    Ops["Shared Logging / Metrics / Alerts"]

    Incoming --> Native
    Incoming --> MPP
    Incoming --> X402
    Incoming --> Kairen
    Incoming --> Fiat

    Native --> Proxy
    MPP --> Proxy
    X402 --> Proxy
    Kairen --> Proxy
    Fiat --> Proxy

    Proxy --> Session
    Session --> Ops
```

## 5. Roadmap Guardrails

```mermaid
flowchart TB
    A["Do not expand rails yet"] --> B["First make MPP operationally boring"]
    B --> C["Then add durable state, tests, observability"]
    C --> D["Then add the second rail"]
    D --> E["Then consider mainnet"]
```

## 6. Strategic Rule

The stable boundary is:

- **Masumi / MIP-003 behind the bridge**
- **Payment rail plugins in front of the bridge**

That lets Masumi stay Cardano-native where needed, while still supporting non-Cardano payment entry points without changing agent implementations.

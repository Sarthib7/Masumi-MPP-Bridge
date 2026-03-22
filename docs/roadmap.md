# Roadmap

## Product direction

Masumi should not rely on Cardano as its only payment path.

The bridge exists to add **external payment rail plugins** in front of Masumi agents while preserving:

- **Masumi registry and identity**
- **MIP-003 agent interface**
- **Cardano-native flows where they already make sense**

Current direction:

- **Masumi native/Cardano** remains a supported rail.
- **MPP** is the first external rail plugin implemented in this repository.
- **Tempo** is the current settlement path behind MPP, not the long-term product boundary.
- Future rails can include **x402**, **Kairen/x402n**, fiat-backed MPP methods, or other settlement plugins.

## Current repo state

Implemented today:

- MPP HTTP 402 challenge/response flow
- Masumi registry, Sokosumi, or merged agent discovery
- MIP-003 proxy for `start_job`, `status`, `input_schema`, `availability`, and `provide_input`
- Optional Cardano receipt logging for completed MPP-paid jobs
- Static CI for lint, typecheck, and build

Not production-ready yet:

- No automated test suite beyond static checks
- Session storage is in-memory
- Logging is not structured or audit-grade
- Receipt logging is best-effort and needs stronger delivery semantics
- Only the MPP external rail is implemented

## Delivery phases

### Phase 0: Source-of-truth reset

Goal: align the docs and code around the actual product shape.

- Treat the bridge as a **payment-rail platform**, not a one-off Tempo proxy.
- Keep MPP as the first shipping plugin.
- Mark any dual-settlement or Cardano-escrow mirror flow as a separate future feature, not a hidden requirement for v1.
- Keep public API/docs honest about what is live today.

Exit:

- Repo docs match the actual API and current architecture.
- Public metadata does not advertise payment methods that are not implemented.

### Phase 1: Production hardening for the first external rail

Goal: make the MPP rail safe enough for serious preprod and staging usage.

- Fail closed when production MPP secrets or recipients are missing.
- Add request validation for paid endpoints using agent schemas or local validation rules.
- Add retries, timeouts, and clearer dependency error handling for registry, agent, and receipt-log calls.
- Add structured logs with correlation IDs.
- Add availability checks before charging.
- Add idempotency protection for paid POST requests.

Exit:

- End-to-end MPP job flow passes repeatedly on preprod.
- Logs are safe to ship to a centralized sink.
- Operators can diagnose failures without reading raw request bodies.

### Phase 2: State, testing, and operations

Goal: remove single-instance and regression risk.

- Replace in-memory sessions with Postgres or Redis.
- Add unit tests for pricing, catalog, and rail logic.
- Add integration tests for Masumi registry/payment and agent proxying.
- Add automated E2E against a preprod agent.
- Add metrics, alerts, and runbooks.

Exit:

- CI covers test execution, not only static checks.
- A restart does not orphan active paid jobs.
- Operators have runbooks for stuck jobs, key rotation, and degraded dependencies.

### Phase 3: Multi-rail expansion

Goal: support more than one external payment plugin cleanly.

- Keep the rail interface stable.
- Add the next rail behind the same proxy/session model.
- Normalize receipts and operational telemetry across rails.
- Decide rail selection and routing rules explicitly.

Exit:

- Two payment rails can coexist without forking the MIP-003 proxy path.
- Internal observability is rail-aware.

### Phase 4: Mainnet readiness

Goal: launch only after the first rail is operationally boring.

- Separate preprod and mainnet credentials, wallets, and dashboards.
- Run staging E2E with real-value small payments.
- Add rate limits, abuse controls, and refund/incident policies.
- Verify secret handling, logging, and receipt traces in production-like conditions.

Exit:

- Mainnet launch checklist is fully green.
- On-call procedures exist and have been rehearsed.

## Long-term architecture rules

- **Masumi stays the agent protocol spine.**
- **Payment rails stay pluggable.**
- **No external rail should force changes onto agent implementers when MIP-003 is enough.**
- **Cardano remains first-class, but not exclusive.**
- **Every new rail must meet the same security, observability, and operational bar as the first one.**

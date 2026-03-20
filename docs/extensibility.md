# Extensibility

## Cross-chain receipt logging

When a job completes, the bridge can:

1. Take the MPP receipt (Tempo settlement proof).
2. Combine it with the job’s input/output hashes (as implemented in `src/logging/`).
3. Submit a composite hash to Masumi decision logging on Cardano.

That yields a cross-chain audit trail:

- **Payment proof:** Tempo
- **Accountability proof:** Cardano
- **Agent identity:** Masumi registry

Details evolve with the payment service API; treat this section as intent — verify against current `receipt-logger` and env in production.

## Adding more payment rails

The proxy and session layers are meant to stay **payment-agnostic**. To add another rail (e.g. x402, Kairen):

1. Add middleware under `src/middleware/` (e.g. `x402-gate.ts`).
2. Detect the new protocol from headers or body in the main handler.
3. Map the rail’s credential format to the bridge’s internal representation.

MIP-003 proxying and session mapping should not need structural changes for a new rail.

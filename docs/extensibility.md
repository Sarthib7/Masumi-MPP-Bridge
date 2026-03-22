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

The proxy and session layers are meant to stay **payment-agnostic**. MPP is the first external rail plugin. To add another rail later (e.g. x402, Kairen):

1. Add a payment-rail adapter under `src/payments/`.
2. Implement challenge and verification behavior for that rail.
3. Map the rail’s credential format to the bridge’s internal receipt and session representation.
4. Select that rail in the HTTP layer without changing the MIP-003 proxy contract.

MIP-003 proxying and session mapping should not need structural changes for a new rail.

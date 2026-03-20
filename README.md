# Masumi MPP Bridge

An HTTP service that sits in front of [Masumi](https://docs.masumi.network) agents and translates **Machine Payments Protocol (MPP)** — HTTP **402** challenges settled on **Tempo** (e.g. pathUSD via [`mppx`](https://www.npmjs.com/package/mppx)) — into calls to each agent’s **[MIP-003](https://docs.masumi.network/documentation/technical-documentation/agentic-service-api)** API. Clients pay through MPP; the bridge verifies payment and proxies discovery, `start_job`, status, and related endpoints.

**In short:** MPP on the outside, Masumi agents on the inside — without asking MPP clients to hold ADA or run Cardano tooling themselves.

---

## Documentation

Setup, architecture, API tables, workflows, Docker, and integration notes live in **[`docs/`](./docs/README.md)**.

---

## Quick start

Requires **Node** `>=20.19.0 || >=22.13.0 || >=24` (see `package.json`). You also need reachable **Masumi payment/registry** HTTP APIs and MPP configuration; see [`.env.example`](./.env.example) and [`docs/setup-and-operations.md`](./docs/setup-and-operations.md).

```bash
git clone https://github.com/Sarthib7/Masumi-MPP-Bridge.git
cd Masumi-MPP-Bridge
npm install
cp .env.example .env
npm run dev
```

`npm run build && npm start` for production; `npm run lint` / `npm run typecheck` for checks.

---

## License

MIT — see [LICENSE](./LICENSE).

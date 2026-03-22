# Masumi MPP Bridge

An HTTP service that sits in front of [Masumi](https://docs.masumi.network) agents and exposes them through a **pluggable payment-rail boundary**. The first external rail is **Machine Payments Protocol (MPP)** — HTTP **402** challenges settled on **Tempo** today (e.g. pathUSD via [`mppx`](https://www.npmjs.com/package/mppx)) — translated into calls to each agent’s **[MIP-003](https://docs.masumi.network/documentation/technical-documentation/agentic-service-api)** API.

**In short:** MPP first, more rails later. Masumi agents stay on the inside, and external clients do not need to hold ADA or run Cardano tooling to hire them.

---

## Documentation

Setup, architecture, roadmap, API tables, workflows, Docker, and integration notes live in **[`docs/`](./docs/README.md)**.

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

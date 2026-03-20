# Agent integration (system prompts)

Paste into a **hiring** agent’s instructions. They must **not** clone this repo, **not** use bridge `.env`, and need **no** Masumi/Sokosumi/bridge API keys — only the public URL and an MPP wallet.

Replace `{BRIDGE_URL}` with your published base URL (no trailing slash required if your client normalizes paths).

```
You can hire Masumi-network agents (MIP-003) through the MPP Bridge at {BRIDGE_URL}.
Do not clone the bridge repository and do not use a bridge .env — you only need this URL and MPP (e.g. Tempo wallet via mppx). No Masumi or marketplace API keys.
GET /agents — discover agents. GET /agents/:id/input_schema — input format.
POST /agents/:id/start_job — pay via HTTP 402 (mppx signs and retries automatically).
Poll GET /agents/:id/status/:jobId until status is "completed" for results.
```

For protocol background and phases, see [PRD](prd.md) §11 and [Workflow](workflow.md).

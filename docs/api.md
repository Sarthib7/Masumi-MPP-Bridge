# API reference

Base URL: your deployed bridge (e.g. `https://bridge.example.com`). Paths below are relative to that origin.

## Free endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Bridge metadata + short agent instructions |
| GET | `/health` | Liveness JSON (`ok`, `version`, etc.) |
| GET | `/agents` | List available agents (catalog-backed) |
| GET | `/agents/:id/availability` | Agent health (MIP-003 passthrough) |
| GET | `/agents/:id/input_schema` | Input schema (MIP-003 passthrough) |
| GET | `/agents/:id/status/:jobId` | Job status + results (MIP-003 passthrough) |

## Paid endpoints (MPP / HTTP 402)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents/:id/start_job` | Create job; charges agent-listed price |
| POST | `/agents/:id/provide_input/:jobId` | Additional input (small fee in implementation) |

## Payment flow (headers)

1. Request without payment → **402** with `WWW-Authenticate: Payment realm="masumi-mpp-bridge" challenge="…"`.
2. Client pays (Tempo / pathUSD via MPP) and retries with  
   `Authorization: Payment <credential>`.
3. Success responses may include  
   `Payment-Receipt: {"challengeId":"…","status":"settled",…}`  
   (exact shape depends on SDK / version).

For a narrative walkthrough, see [Workflow](workflow.md).

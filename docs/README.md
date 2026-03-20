# Masumi MPP Bridge — documentation

The [root README](../README.md) is a **short public abstract**; this folder has **full detail** (workflows, diagrams, setup, API, troubleshooting).

| Document | What it covers |
|----------|----------------|
| [Workflow](workflow.md) | Operator vs hirer roles, discovery → pay → job → poll, HTTP 402 sequence, receipt logging |
| [Architecture](architecture.md) | System diagram, Masumi/Sokosumi layers, agent catalog modes, API keys (registry vs marketplace) |
| [Setup & operations](setup-and-operations.md) | Prerequisites, install, env, troubleshooting, production, Docker, repo layout, optional `masumi-hire` CLI |
| [API reference](api.md) | Routes, paid vs free endpoints, payment headers |
| [Agent integration](agent-integration.md) | Copy-paste system prompts for hiring agents (no bridge secrets) |
| [Extensibility](extensibility.md) | Cross-chain receipts, adding other payment rails |
| [PRD](prd.md) | Product requirements document (proposal) |

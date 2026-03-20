#!/usr/bin/env node
/**
 * Optional helper — NOT required for end users. Most hirers use curl/mppx/HTTP only (no clone).
 *
 * Operator: smoke-test from a dev checkout. Anyone else: only needs BRIDGE_URL + mppx; never the bridge .env.
 * Paid routes shell out to `mppx` so a Tempo wallet signs 402 challenges.
 *
 *   BRIDGE_URL=https://bridge.example.com npm run hire -- agents
 *   BRIDGE_URL=... npm run hire -- schema <agentId>
 *   BRIDGE_URL=... npm run hire -- run <agentId> --prompt "your task"
 *   BRIDGE_URL=... npm run hire -- status <agentId> <jobId>
 *   BRIDGE_URL=... npm run hire -- suggest "research paper summary"
 */

import { spawnSync } from 'node:child_process';

interface ListedAgent {
  id: string;
  name: string;
  description: string;
  pricing?: { usd_estimate?: number; amount?: string; unit?: string };
  capabilities?: string[];
  hire_url?: string;
}

function bridgeBase(): string {
  const b = process.env.BRIDGE_URL?.trim();
  if (!b) {
    console.error('Missing BRIDGE_URL (your hosted masumi-mpp-bridge base URL, no trailing path).');
    process.exit(1);
  }
  return b.replace(/\/$/, '');
}

function usage(): void {
  console.log(`masumi-hire — optional; public bridge URL + mppx only (no bridge .env / no Masumi keys)

  BRIDGE_URL=<url> masumi-hire agents
  BRIDGE_URL=<url> masumi-hire schema <agentId>
  BRIDGE_URL=<url> masumi-hire run <agentId> [--prompt "text"] [--input key=value ...]
  BRIDGE_URL=<url> masumi-hire status <agentId> <jobId>
  BRIDGE_URL=<url> masumi-hire suggest "natural language hint"

Environment:
  BRIDGE_URL   Required. Your operator's public bridge root (https://...)
`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function cmdAgents(): Promise<void> {
  const base = bridgeBase();
  const data = await fetchJson<{ agents: ListedAgent[] }>(`${base}/agents`);
  for (const a of data.agents || []) {
    const usd = a.pricing?.usd_estimate;
    const price =
      usd != null ? `~$${usd}` : `${a.pricing?.amount ?? '?'} ${a.pricing?.unit ?? ''}`;
    console.log(`${a.id}\t${price}\t${a.name}`);
    if (a.description) {
      console.log(
        `  ${a.description.slice(0, 120)}${a.description.length > 120 ? '…' : ''}`,
      );
    }
  }
}

async function cmdSchema(agentId: string): Promise<void> {
  const base = bridgeBase();
  const j = await fetchJson<unknown>(
    `${base}/agents/${encodeURIComponent(agentId)}/input_schema`,
  );
  console.log(JSON.stringify(j, null, 2));
}

async function cmdStatus(agentId: string, jobId: string): Promise<void> {
  const base = bridgeBase();
  const j = await fetchJson<unknown>(
    `${base}/agents/${encodeURIComponent(agentId)}/status/${encodeURIComponent(jobId)}`,
  );
  console.log(JSON.stringify(j, null, 2));
}

function runMppx(url: string, body: object): number {
  const payload = JSON.stringify(body);
  const r = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['mppx', url, '--method', 'POST', '-J', payload],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  return r.status ?? 1;
}

function cmdRun(agentId: string, args: string[]): void {
  const base = bridgeBase();
  let prompt = '';
  const inputPairs: { key: string; value: string }[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prompt' && args[i + 1]) {
      prompt = args[++i];
    } else if (args[i]?.startsWith('--input') && args[i + 1]) {
      const raw = args[++i];
      const eq = raw.indexOf('=');
      if (eq > 0) inputPairs.push({ key: raw.slice(0, eq), value: raw.slice(eq + 1) });
    }
  }

  const input_data =
    inputPairs.length > 0
      ? inputPairs.map((p) => ({ key: p.key, value: p.value }))
      : prompt
        ? [{ key: 'prompt', value: prompt }]
        : [];

  if (input_data.length === 0) {
    console.error('Provide --prompt "..." or --input key=value (repeat).');
    process.exit(1);
  }

  const url = `${base}/agents/${encodeURIComponent(agentId)}/start_job`;
  const code = runMppx(url, { input_data });
  process.exit(code);
}

function scoreAgent(a: ListedAgent, q: string): number {
  const text = `${a.name} ${a.description} ${(a.capabilities || []).join(' ')}`.toLowerCase();
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  let s = 0;
  for (const w of words) {
    if (text.includes(w)) s += 1;
  }
  return s;
}

async function cmdSuggest(hint: string): Promise<void> {
  const base = bridgeBase();
  const data = await fetchJson<{ agents: ListedAgent[] }>(`${base}/agents`);
  const ranked = (data.agents || [])
    .map((a) => ({ a, s: scoreAgent(a, hint) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s);
  if (ranked.length === 0) {
    console.log('No keyword overlap. Try: masumi-hire agents');
    return;
  }
  console.log('Candidates (keyword match; use an LLM for real planning):');
  for (const { a, s } of ranked.slice(0, 8)) {
    const usd = a.pricing?.usd_estimate;
    console.log(`  [${s}] ${a.id}  ~$${usd ?? '?'}  ${a.name}`);
  }
  const top = ranked[0].a;
  console.log(
    `\nExample hire:\n  BRIDGE_URL=${base} masumi-hire run ${top.id} --prompt ${JSON.stringify(hint)}`,
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];

  if (!sub || sub === '-h' || sub === '--help') {
    usage();
    process.exit(sub ? 0 : 1);
  }

  try {
    if (sub === 'agents') {
      await cmdAgents();
    } else if (sub === 'schema' && argv[1]) {
      await cmdSchema(argv[1]);
    } else if (sub === 'status' && argv[1] && argv[2]) {
      await cmdStatus(argv[1], argv[2]);
    } else if (sub === 'run' && argv[1]) {
      cmdRun(argv[1], argv.slice(2));
    } else if (sub === 'suggest' && argv[1]) {
      await cmdSuggest(argv.slice(1).join(' '));
    } else {
      usage();
      process.exit(1);
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();

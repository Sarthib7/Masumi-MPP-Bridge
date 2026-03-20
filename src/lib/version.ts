import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | null = null;

/** Package version from `package.json` (for `/`, `/health`). */
export function getBridgeVersion(): string {
  if (cached !== null) return cached;
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../..', 'package.json');
    const pkg = JSON.parse(readFileSync(root, 'utf-8')) as { version?: string };
    cached = pkg.version ?? '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached;
}

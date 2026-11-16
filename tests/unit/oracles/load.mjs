// Loads items for the oracle tests: from the real game data, or - while a world is still being
// developed - from a preview folder:  LWM_ITEMS_DIR=tests/e2e/out/pack node --test tests/unit/oracle-put.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dir = process.env.LWM_ITEMS_DIR ? resolve(process.env.LWM_ITEMS_DIR) : join(ROOT, 'assets', 'data', 'listening');

/** Every item of one activity type (tap items have no `t`). */
export function itemsOfType(type) {
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'levels.json').sort()) {
    const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const it of data.items || []) if ((it.t || 'tap') === type) out.push(it);
  }
  return out;
}

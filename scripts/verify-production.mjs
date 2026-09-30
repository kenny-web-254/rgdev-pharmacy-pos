/**
 * Production source guard.
 *
 * Replaces the previous chain of twelve Python scripts that rewrote `src/` in
 * place on every build. Those transformations are now baked into the committed
 * source, so this script only *verifies* invariants — it never mutates source.
 *
 * Run by `npm run build` before typecheck and bundling.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const SRC = 'src';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
if (files.length === 0) fail('no frontend source files found under src/');

const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const combined = [...sources.values()].join('\n');

const failures = [];
function fail(message) {
  failures.push(message);
}

// 1. No demo/seed authority or default credentials may ship.
const forbidden = [
  [/DEMO_USERS/i, 'demo user authority remains in production source'],
  [/pharmacy123/i, 'a demo/default password remains in production source'],
  [/auth\.signUp/, 'client-side public account creation is still enabled'],
  [/import\.meta\.env\.VITE_SUPABASE_SERVICE_ROLE/, 'service-role key is exposed to the browser bundle'],
  [/process\.env\.SUPABASE_SERVICE_ROLE_KEY/, 'service-role key is read by frontend source'],
  [/from\s*\(\s*['"]data\/mockData['"]\s*\)|['"]\.\.\/data\/mockData['"]/, 'the removed demo data module is still imported'],
];
for (const [pattern, message] of forbidden) {
  if (pattern.test(combined)) fail(message);
}

// 2. Sales must go through the authoritative server-side RPC, never a direct insert.
if (!/rpc\(\s*['"]complete_sale['"]/.test(combined)) {
  fail('the atomic complete_sale RPC is not used anywhere in the frontend');
}
if (/from\(\s*['"]sale_transactions['"]\s*\)\s*\.insert/.test(combined)) {
  fail('a direct sale_transactions INSERT bypasses the authoritative sale RPC');
}

// 3. Realtime sync must cover every table the POS reads.
const realtimePath = join(SRC, 'hooks', 'useRealtimeSync.ts');
let realtime = '';
try {
  realtime = readFileSync(realtimePath, 'utf8');
} catch {
  fail(`realtime hook is missing at ${realtimePath}`);
}
for (const table of [
  'medications',
  'prescriptions',
  'tests',
  'sale_transactions',
  'receipt_settings',
  'pharmacy_users',
]) {
  if (realtime && !realtime.includes(`'${table}'`)) {
    fail(`realtime subscription is missing table "${table}"`);
  }
}

if (failures.length > 0) {
  console.error('\nPRODUCTION VERIFY FAILED:');
  for (const f of failures) console.error(`  - ${f}`);
  console.error('');
  process.exit(1);
}

console.log(`Production verification passed across ${files.length} frontend source files.`);

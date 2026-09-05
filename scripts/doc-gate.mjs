#!/usr/bin/env node
/**
 * THE DOC GATE — the proportional gate of [ADR-W-041](../docs/06w-decisions-workspace.md), run as one
 * command so the file list has exactly one definition.
 *
 *   node scripts/doc-gate.mjs     (or: npm run test:docs)
 *
 * A doc-only change does not need the ~10-minute product suite; it needs the tests that actually read
 * a document. That set lives in `DOCS.json` `docGate`, is derived rather than recalled (the scan in
 * `server/__tests__/docs-hygiene.test.ts` fails if a doc-reading test sits outside it), and is read
 * from there here. Restating the list in this file — or in the workflow YAML — would recreate the
 * hand-kept copy the registry exists to abolish.
 *
 * Why this matters more than convenience (#905): `ci.yml` carries `paths-ignore` for `docs/`, any
 * markdown file, `reports/` and `.claude/`, and `paths-ignore` is WORKFLOW-level — so a change confined
 * to those paths triggers no lane at all. Four of those paths have tests that read them, two of which
 * BYTE-MATCH a document against a code table. `.github/workflows/docs.yml` runs this script on exactly
 * those paths, which is what turns the gate from a convention into an enforced one.
 *
 * (The glob forms are spelled out in prose above on purpose: writing them literally puts a comment
 * terminator inside this docblock, which is how the first version of this file failed to parse.)
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { docGate } = JSON.parse(readFileSync(resolve(ROOT, 'DOCS.json'), 'utf8'));

const files = [...(docGate?.derived ?? []), ...(docGate?.registryGuards ?? [])];
if (files.length === 0) {
  console.error('DOCS.json docGate is empty — refusing to report a vacuous pass.');
  process.exit(1);
}

console.log(`doc gate — ${files.length} files from DOCS.json:`);
for (const f of files) console.log('  ' + f);
console.log('');

const r = spawnSync('npx', ['vitest', 'run', ...files], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);

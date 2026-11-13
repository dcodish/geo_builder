/**
 * Per-question verdicts of the two analytic exam corpora, for unit readiness (#2868 Addition A, ADR-W-209).
 * Run by `scripts/ops/readiness.mjs` through vite-node; prints JSON on stdout.
 *
 * The SAME readings as the ratchets, per question instead of summed:
 *  - 471 (`issue-1618-corpus471-ratchet.test.ts`): a question lands when every line, with the taught
 *    imperatives confirmed, derives with no fault;
 *  - 572 (`issue-2730-corpus572-ratchet.test.ts`): a question lands when every given line a student types in
 *    order is recorded (taught lines through their canonical sentence).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { derive } from '../../src-analytic/engine/derive';
import { confirmTaught, decideSubmit } from '../../src-analytic/app/submit';
import type { Seed } from '../../src-analytic/engine/evaluate';

const DIR = path.resolve(__dirname, '../../src-analytic/__tests__/fixtures');
const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')) as T;

const c471 = read<{ id: string; lines: string[] }[]>('corpus471.json');
const c572 = read<{ id: string; lines: { kind: string; text: string }[] }[]>('corpus572.json');

const out: Record<string, Record<string, { green: boolean; failing?: string }>> = { corpus471: {}, corpus572: {} };

for (const q of c471) {
  const lines = confirmTaught(q.lines, 0);
  const d = derive(lines, 0);
  const bad = [...new Set(d.faults.map((f: { index: number }) => f.index))].sort((a, b) => a - b);
  out.corpus471[q.id] = bad.length ? { green: false, failing: `«${lines[bad[0]]}»${bad.length > 1 ? ` ועוד ${bad.length - 1}` : ''}` } : { green: true };
}

for (const q of c572) {
  const held: string[] = [];
  let seed: Seed = 0;
  const refused: string[] = [];
  for (const { kind, text } of q.lines) {
    if (kind !== 'given') continue;
    let v = decideSubmit(text, held, seed);
    let line = text;
    if (v.kind === 'teach') {
      line = v.canonical;
      v = decideSubmit(line, held, seed);
    }
    if (v.kind === 'record') {
      held.push(line);
      seed = v.configuration ?? seed;
    } else refused.push(text);
  }
  out.corpus572[q.id] = refused.length ? { green: false, failing: `«${refused[0]}»${refused.length > 1 ? ` ועוד ${refused.length - 1}` : ''}` } : { green: true };
}

process.stdout.write(JSON.stringify(out));

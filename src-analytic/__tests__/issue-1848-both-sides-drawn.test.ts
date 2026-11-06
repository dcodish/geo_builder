/**
 * #1848 (ADR-AG-420) — analytic's thin lock on the shared ink rows. Measured at pickup (origin/main c0029d25): «AC = 2BD»
 * and «AC:BD = 2:1» already drew both, and «|AC| = |BD|», «|AC| = 2|BD|» drew neither: the bars were ruled a distance
 * spelling on #1652. The operator's ruling of 2026-10-30 names «|AC| = 2|BD|» in all tools, so a RELATION in bars draws,
 * and a value in bars («|OC| = 5») stays what #1652 ruled. Every lock CALLS the real submit decision and reads the
 * derived figure.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { STATED_LENGTH_RELATION_INK } from '../../shell/__tests__/fixtures/stated-length-relation-ink';

function play(steps: readonly string[]) {
  const lines: string[] = [];
  const verdicts: string[] = [];
  for (const s of steps) {
    const v = decideSubmit(s, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    verdicts.push(v.kind);
  }
  const d = derive(lines, 0);
  const drawn = d.figure.segments.map((s) => String(s.id)).filter((id) => !id.startsWith('poly-')).map((id) => id.replace(/^seg-/, '')).sort();
  return { verdicts: [...new Set(verdicts)], faults: d.faults.map((f) => f.code), drawn };
}

describe('#1848 — a stated relation between two lengths draws both segments (analytic)', () => {
  it.each(STATED_LENGTH_RELATION_INK.map((r) => [r.steps.join(' · '), r] as const))('%s', (_name, row) => {
    expect(play(row.steps)).toEqual({ verdicts: ['record'], faults: [], drawn: row.drawn });
  });

  it('either side may be the barred one, and a sum compared with a length draws its pairs', () => {
    expect(play(['מרובע ABCD', '|AC| = BD']).drawn).toEqual(['AC', 'BD']);
    expect(play(['מרובע ABCD', 'AC = 2|BD|']).drawn).toEqual(['AC', 'BD']);
  });

  it.each([
    ['a value in bars is the distance #1652 ruled', '|AC| = 5'],
    ['a sum of barred lengths against a number has no second length', '|AC| + |BD| = 10'],
    ['the symbolic distance', 'd_{AC} = 2·d_{BD}'],
    ['the worded distance', 'המרחק בין A ל-C שווה למרחק בין B ל-D'],
  ])('%s: «%s» draws nothing', (_name, line) => {
    expect(play(['מרובע ABCD', line])).toEqual({ verdicts: ['record'], faults: [], drawn: [] });
  });
});

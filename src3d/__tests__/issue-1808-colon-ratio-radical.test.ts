/**
 * #1808 (ADR-3D-427) — a length ratio's term is a magnitude, in the colon and in the slash.
 *
 * `lengthRatioClaim` read `UNUM`, so «AB:AC=3:√13» and «AB/AC=3/√13» were not understood; the honesty gate's ratio pass
 * read digits, so «3:2√3» would have been the pair «3:2».
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { decideSubmit3, type Fact3 } from '../store/store3';

const verdict = (line: string) => {
  let s: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };
  const v0 = decideSubmit3(s, 'משולש ABC');
  if (v0.kind === 'record') s = { facts: v0.facts, seed: v0.seed };
  return decideSubmit3(s, line);
};
const ratio = (line: string): number => {
  const r = parse3(line) as { ok: boolean; commands?: Array<{ type: string; claim?: { type: string; p: number; q: number } }> };
  const c = r.commands?.find((x) => x.type === 'claim' && x.claim?.type === 'length-ratio');
  if (!c?.claim) throw new Error(`«${line}» carries no ratio`);
  return c.claim.p / c.claim.q;
};

describe('#1808 — the term', () => {
  it.each<[string, number]>([
    ['AB:AC=3:√13', 3 / Math.sqrt(13)],
    ['AB:AC=3:√(13)', 3 / Math.sqrt(13)],
    ['AB/AC=3/√13', 3 / Math.sqrt(13)],
    ['AB:AC=3:2√3', 3 / (2 * Math.sqrt(3))],
    ['AB:AC=√3:2', Math.sqrt(3) / 2],
    ['AB:AC=3:3/2', 2],
    ['AB/AC=3/2', 1.5],
    ['AB:AC=3:2', 1.5],
    ['AB/AC=2', 2],
  ])('%s', (line, k) => {
    expect(ratio(line)).toBeCloseTo(k, 9);
    expect(verdict(line).kind).toBe('record');
  });

  it('plain terms keep p and q', () => {
    const r = parse3('AB:AC=3:2') as unknown as { commands: Array<{ claim?: { p: number; q: number } }> };
    expect(r.commands.find((c) => c.claim)?.claim).toMatchObject({ p: 3, q: 2 });
  });

  it.each(['AB:AC=0:2', 'AB:AC=2:0', 'AB:AC=√0:2', 'AB:AC=3:2.5x'])('not a positive term is not this rule: %s', (line) => {
    expect(verdict(line).kind).not.toBe('record');
  });
});

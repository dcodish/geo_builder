/**
 * #1848 (ADR-3D-428) — 3-D's thin lock on the shared ink rows. The `length-rel` arm drew its left pair only, one arm out
 * of step with `cos-angle` and `mag-rel`, so «|AC| = |BD|» drew AC and not BD (operator, 2026-10-07: *"if we draw AC there
 * is no reason not to draw DB"*). A shape's own condition still draws nothing (#1844, `origin: 'shape'`). Each lock goes
 * through the real submit decision and reads the derived construction.
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, type Command3, type Construction3 } from '../engine/types';
import { STATED_LENGTH_RELATION_INK, inkKey } from '../../shell/__tests__/fixtures/stated-length-relation-ink';

function play(lines: readonly string[]) {
  let facts: Fact3[] = [];
  let n = 0;
  const verdicts: string[] = [];
  for (const line of lines) {
    const v = decideDeterministic3({ facts, seed: 0 }, line, () => `f${++n}`);
    verdicts.push((v.kind === 'record' && v.held ? 'held' : v.kind));
    if (v.kind === 'record') facts = v.facts;
  }
  const c = derive3(facts, 0).construction;
  return { verdicts: [...new Set(verdicts)], drawn: [...new Set(c.segments.map(([a, b]) => inkKey(a, b)))].sort() };
}

const applyAll = (cmds: readonly Command3[]): Construction3 =>
  cmds.reduce<Construction3>((c, cmd) => {
    const r = applyCommand3(c, cmd);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.next;
  }, emptyConstruction3());

const QUAD: Command3[] = [{ type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] } as Command3];
const keysOf = (c: Construction3) => c.segments.map(([a, b]) => inkKey(a, b)).sort();

describe('#1848 — a stated relation between two lengths draws both segments (3-D)', () => {
  it.each(STATED_LENGTH_RELATION_INK.map((r) => [r.steps.join(' · '), r] as const))('%s', (_name, row) => {
    // #2790 (ADR-3D-484): a relation the figure already holds is its own row (held), drawn like any row: both segments
    const r = play(row.steps);
    expect(r.drawn).toEqual(row.drawn);
    expect(r.verdicts.every((v) => v === 'record' || v === 'held'), JSON.stringify(r.verdicts)).toBe(true);
  });

  it.each(['AD = 2DB', '|AD| = 2|DB|', 'AD:DB = 2:1'])('a ratio that places a rider draws both halves: «%s»', (line) => {
    expect(play(['משולש ABC', 'D על AB', line])).toEqual({ verdicts: ['record'], drawn: ['AD', 'BD'] });
  });

  it('the arm: a stated relation draws both pairs, a shape condition neither, a named vector no segment', () => {
    const stated: Command3 = { type: 'length-rel', a1: 'A', b1: 'C', rhs: { pair: ['B', 'D'] }, c: 2 };
    expect(keysOf(applyAll([...QUAD, stated]))).toEqual(['AC', 'BD']);
    expect(keysOf(applyAll([...QUAD, { ...stated, origin: 'shape' } as Command3]))).toEqual([]);
  });

  it('idempotent: a pair already drawn, written either way round, is not drawn twice', () => {
    const stated: Command3 = { type: 'length-rel', a1: 'A', b1: 'C', rhs: { pair: ['D', 'B'] }, c: 1 };
    expect(keysOf(applyAll([...QUAD, { type: 'segment3', a: 'B', b: 'D' } as Command3, stated]))).toEqual(['AC', 'BD']);
  });
});

/**
 * #1953 ([ADR-3D-324](../../docs/06b-decisions-3d.md#adr-3d-324)) — A RESTATED RING IS THE SAME STATEMENT IN 3-D
 * (2-D's ADR-618 and ADR-595, ported per ADR-W-118 B1).
 *
 * Measured on `main` @ e0f4260c through `decideDeterministic3` (what App3 dispatches): after «ריבוע ABCD»,
 * «מרובע ABCD», «מרובע BCDA», «מרובע ADCB» and «ריבוע BCDA» each RECORDED a second row, and «משולש ABC» ·
 * «משולש ACB» did too. Only a line spelled exactly like an earlier one met the #613 twin rule
 * (`already-stated`, no row, with 3-D's own restatement note). Root cause: the twin rule compares spellings.
 * Fix: `ringRestatementTwin3` — a single ring declaration over a ring an enabled fact already declares (up to
 * rotation and reversal) is that fact's twin: a generic word refers to it, and the same shape in a reading it is
 * symmetric under is it.
 */
import type { Seed3 } from '../engine/components3';
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import type { Fact3 } from '../store/store3';

function play(lines: string[]) {
  let st: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed: 0 };
  let last: ReturnType<typeof decideDeterministic3> = { kind: 'not-understood' };
  let before = 0;
  for (const line of lines) {
    before = st.facts.length;
    last = decideDeterministic3(st, line);
    if (last.kind === 'record') st = { facts: last.facts, seed: last.seed };
    else if (last.kind === 'retick') st = { facts: last.facts, seed: st.seed };
  }
  return { last, before, after: st.facts.length, facts: st.facts };
}

// #2790 (ADR-3D-484, ADR-W-200): a restated ring is held — its own row, with the notice (was: no row, ADR-W-031)
describe('#1953 — a restated ring is held in 3-D', () => {
  it.each([
    ['ריבוע ABCD', 'מרובע ABCD'], // the supertype word, declared spelling — recorded a second row before
    ['ריבוע ABCD', 'מרובע ADCB'], // the operator's T11 line
    ['ריבוע ABCD', 'מרובע BCDA'],
    ['ריבוע ABCD', 'ריבוע BCDA'],
    ['ריבוע ABCD', 'ריבוע ABCD'], // the #613 control: unchanged
    ['משולש ABC', 'משולש ACB'],
    ['מלבן ABCD', 'מלבן ADCB'],
    ['טרפז ABCD', 'טרפז CDAB'],
    ['מחומש ABCDE', 'מחומש EDCBA'],
  ])('«%s» · «%s»', (a, b) => {
    const r = play([a, b]);
    expect(r.last.kind === 'record' && r.last.held).toBe(true);
    expect(r.after, 'its own row').toBe(r.before + 1);
  });

  it('a trapezoid read so the OTHER pair is named is a different statement and still records', () => {
    expect(play(['טרפז ABCD', 'טרפז BCDA']).last.kind).toBe('record');
  });

  it('a crossing order is a different ring — never a twin (#1927 owns that line)', () => {
    const crossed = play(['ריבוע ABCD', 'מרובע ACBD']).last;
    expect(crossed.kind === 'record' && crossed.held).toBe(false);
  });

  // #1988 (ADR-3D-326, operator ruling 2026-10-10): a noun the declared one IMPLIES is a restatement in every
  // reading too — a square IS a rectangle. It used to be refused `shape-less-specific`.
  it('a less specific SHAPE word restates the ring in every reading', () => {
    for (const b of ['מלבן ABCD', 'מלבן BCDA', 'מקבילית ADCB', 'דלתון CDAB'])
      expect(play(['ריבוע ABCD', b]).last, b).toMatchObject({ kind: 'record', held: true });
  });

  it('a noun no quadrilateral carries alongside the declared one is still refused (#1918)', () => {
    expect(play(['ריבוע ABCD', 'טרפז ABCD']).last.kind).toBe('refused');
  });

  it('a generic word never re-enables a MUTED declaration — that would state a square the student never said', () => {
    const r = play(['ריבוע ABCD']);
    const muted = r.facts.map((f) => ({ ...f, enabled: false }));
    const v = decideDeterministic3({ facts: muted, seed: 0 }, 'מרובע ADCB');
    expect(v.kind).toBe('record');
  });
});

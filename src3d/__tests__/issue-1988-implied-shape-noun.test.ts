/**
 * #1988 ([ADR-3D-326](../../docs/06b-decisions-3d.md#adr-3d-326)) — A NOUN THE DECLARED SHAPE ALREADY IMPLIES
 * IS A RESTATEMENT IN 3-D TOO.
 *
 * Measured on `main` @ 06fc51dd through `decideSubmit3` (what App3 dispatches): after «ריבוע ABCD», each of
 * «מלבן ABCD», «מעוין ABCD», «מקבילית ABCD» and «דלתון ABCD» was refused `shape-less-specific` —
 * «הצורה כבר ידועה כ־ריבוע — ולכן אינה נקראת מלבן», which is false: every square IS a rectangle. ADR-3D-158's
 * "naming error" half is retired by the operator's 2026-10-10 ruling on #1988 ("already there in every
 * builder"); its other half — a noun that ADDS information drives, a noun that EXCLUDES is refused — stands.
 *
 * Two layers, one predicate (`quadImplies`): the ENGINE records the statement redundant and leaves the figure
 * untouched (every lane, including the model's), and the STORE's restatement rule adds no row.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';
import { QUAD_IMPLIES, quadImplies, quadImpliesInEveryReading, quadsDisjoint, type QuadBase } from '../engine/baseShapes';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);

type St = { facts: Fact3[]; seed: number };
function play(lines: readonly string[]) {
  let n = 0;
  let st: St = { facts: [], seed: 0 };
  const kinds: string[] = [];
  let error: Parameters<typeof errorText3>[1] | null = null;
  let twin: string | null = null;
  for (const line of lines) {
    const v = decideSubmit3(st, line, () => `f${++n}`);
    kinds.push(v.kind);
    if (v.kind === 'refused') error = v.error as never;
    if (v.kind === 'already-stated') {
      twin = v.twin.utterance;
      st = { facts: v.facts, seed: st.seed };
    }
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, kinds, error, twin };
}

describe('#1988 — the issue’s own lines: an implied noun is «already there», with no row', () => {
  it.each([
    ['ריבוע ABCD', 'מלבן ABCD'],
    ['ריבוע ABCD', 'מעוין ABCD'],
    ['ריבוע ABCD', 'מקבילית ABCD'],
    ['ריבוע ABCD', 'דלתון ABCD'],
    ['מלבן ABCD', 'מקבילית ABCD'],
    ['מעוין ABCD', 'מקבילית ABCD'],
    ['מעוין ABCD', 'דלתון ABCD'],
    ['ריבוע ABCD', 'מרובע ABCD'], // ADR-3D-324's own case, unchanged
  ])('«%s» · «%s»', (a, b) => {
    const r = play([a, b]);
    expect(r.kinds, 'never refused').toEqual(['record', 'already-stated']);
    expect(r.st.facts.length, 'no new row').toBe(1);
    expect(r.twin, 'the note names the line that declared the ring').toBe(a);
  });

  it.each([
    ['ריבוע ABCD', 'מלבן BCDA'],
    ['ריבוע ABCD', 'מקבילית ADCB'],
    ['מלבן ABCD', 'מקבילית DCBA'],
  ])('«%s» · «%s» — every reading of the same ring (ADR-3D-324)', (a, b) => {
    expect(play([a, b]).kinds).toEqual(['record', 'already-stated']);
  });

  it('the figure is untouched and the statement is recorded redundant, so the student is told', () => {
    const r = play(['ריבוע ABCD']);
    const before = derive3(r.st.facts, r.st.seed);
    const redundant: Fact3 = {
      id: 'x',
      utterance: 'מלבן ABCD',
      cmds: [{ type: 'quad-shape', base: 'rectangle', ids: ['A', 'B', 'C', 'D'] }],
      enabled: true,
    };
    const after = derive3([...r.st.facts, redundant], r.st.seed);
    expect(after.status.x, 'the model’s lane commits it green, never refused').toBe('ok');
    expect(after.notices.some((n) => n.kind === 'already-known' && n.rel === 'shape')).toBe(true);
    expect(after.construction.scalarPins.length, 'no inert pins accumulate').toBe(before.construction.scalarPins.length);
    for (const id of ['A', 'B', 'C', 'D']) {
      const p = after.positions.get(id)!;
      const q = before.positions.get(id)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z), id).toBeLessThan(1e-9);
    }
  });
});

describe('#1988 — what did NOT change', () => {
  it('a noun that ADDS information still drives («מלבן ABCD» · «ריבוע ABCD»)', () => {
    expect(play(['מלבן ABCD', 'ריבוע ABCD']).kinds).toEqual(['record', 'record']);
  });

  it('a noun that EXCLUDES the declared one is still refused, naming both (#1918)', () => {
    const r = play(['מקבילית ABCD', 'טרפז ABCD']);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.error).toEqual({ code: 'shape-disjoint', stated: 'trapezoid', actual: 'parallelogram' });
    expect(errorText3(he, r.error!)).toBe(
      'הצורה כבר ידועה כ־מקבילית — ולכן אינה נקראת טרפז. מחקו את הנתון הקודם אם התכוונתם טרפז.',
    );
  });

  it('a trapezoid read so the OTHER pair is named is new information, not a restatement (ADR-3D-313)', () => {
    expect(play(['טרפז ABCD', 'טרפז BCDA']).kinds).toEqual(['record', 'record']);
  });

  it('an implied noun never re-enables a MUTED declaration', () => {
    const r = play(['ריבוע ABCD']);
    const muted = r.st.facts.map((f) => ({ ...f, enabled: false }));
    expect(decideSubmit3({ facts: muted, seed: 0 }, 'מלבן ABCD').kind).toBe('record');
  });

  it('`shape-less-specific` is gone — the implication arm has one outcome', () => {
    const KINDS = Object.keys(QUAD_IMPLIES) as QuadBase[];
    for (const a of KINDS) for (const b of KINDS) {
      if (quadImplies(a, b)) expect(quadsDisjoint(a, b), `${a}/${b}`).toBe(false);
    }
  });

  // the reasoning `quadImpliesInEveryReading` rests on, asserted rather than assumed
  it('the only bases that imply a KITE without being one have four equal sides', () => {
    const KINDS = Object.keys(QUAD_IMPLIES) as QuadBase[];
    for (const a of KINDS) {
      if (a === 'kite' || !quadImplies(a, 'kite')) continue;
      expect(quadImplies(a, 'rhombus'), a).toBe(true);
      expect(quadImpliesInEveryReading(a, 'kite'), a).toBe(true);
    }
    // a trapezoid names ONE pair of sides, so it never survives an arbitrary reading
    for (const a of KINDS) expect(quadImpliesInEveryReading(a, 'trapezoid'), a).toBe(false);
  });
});

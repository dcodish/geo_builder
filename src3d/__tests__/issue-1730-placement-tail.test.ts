/**
 * #1730 (ADR-3D-296) — A POINT PLACEMENT KEEPS ITS TAIL.
 *
 * «משולש ABC» · «D על BC ונתון כי AD = AC» recorded ONE command, `point-on-segment3 D on BC`, green: the
 * clause «ונתון כי AD = AC» — a given — vanished. The rider rule read its prefix and ignored everything
 * after the carrier, «כך ש-AD = AC», «, AD = AC», «במרחק 3 מ-A» alike (only a RATIO of the rider itself
 * was ever read). And no gate noticed: the label gate saw every letter referenced by the rider, and the
 * number gate let «AD = 3» through because the digit in the command's own type name paid for the 3.
 *
 * The 2-D twin is #1682 (ADR-570); this is the 3-D copy of its pattern (src3d never imports src/).
 * Everything goes through the real submit decision, `decideSubmit3`, and the drawn positions.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { parse3 } from '../parser/parse3';
import { droppedGivenNumbers3, droppedGivenRelations3 } from '../parser/honesty3';
import type { Command3 } from '../engine/types';

type St = { facts: Fact3[]; seed: number };

/** Submit the lines in order; every line must record. Returns the state and the last line's commands. */
function build(lines: string[]): { st: St; last: Command3[] } {
  let st: St = { facts: [], seed: 0 };
  let last: Command3[] = [];
  for (const line of lines) {
    const v = decideSubmit3(st, line);
    expect(v.kind, `«${line}» (${JSON.stringify(v.kind === 'refused' ? v.error : '')})`).toBe('record');
    if (v.kind !== 'record') break;
    st = { facts: v.facts, seed: v.seed };
    last = v.fact.cmds;
  }
  return { st, last };
}

const dist = (pos: Map<string, { x: number; y: number; z: number }>, p: string, q: string): number => {
  const [P, Q] = [pos.get(p)!, pos.get(q)!];
  return Math.hypot(P.x - Q.x, P.y - Q.y, P.z - Q.z);
};

/** |p1q1| = c·|p2q2| in the drawn figure, at the recorded seed and three more. */
function holds(st: St, [p1, q1]: [string, string], [p2, q2]: [string, string], c = 1): void {
  const c3 = derive3(st.facts, st.seed).construction;
  for (const seed of [st.seed, st.seed + 1, st.seed + 2, st.seed + 3]) {
    const pos = resolve3(c3, seed).positions;
    expect(dist(pos, p1, q1), `|${p1}${q1}| = ${c}·|${p2}${q2}| @${seed}`).toBeCloseTo(c * dist(pos, p2, q2), 4);
  }
}

describe('#1730 — the condition after a point placement is a given', () => {
  it('the reported line: «D על BC ונתון כי AD = AC» records AD = AC, and the figure holds it', () => {
    const { st, last } = build(['משולש ABC', 'D על BC ונתון כי AD = AC']);
    expect(last.some((c) => c.type === 'length-rel')).toBe(true);
    holds(st, ['A', 'D'], ['A', 'C']);
  });

  it.each([
    'D על BC ונתון ש-AD = AC',
    'D על BC וידוע כי AD = AC',
    'D על BC וידוע ש-AD = AC',
    'D על BC כך ש-AD = AC',
    'D על BC, AD = AC',
    'D על BC ו-AD = AC',
    'הנקודה D נמצאת על הצלע BC ונתון כי AD = AC',
    'D on BC and it is given that AD = AC',
    'D on BC such that AD = AC',
  ])('every connector reads the same condition: «%s»', (line) => {
    const { st } = build(['משולש ABC', line]);
    holds(st, ['A', 'D'], ['A', 'C']);
  });

  it('the issue’s second line: «E על BC ונתון כי DE = DC» (D a point of the figure)', () => {
    const { st } = build(['משולש ABC', 'D על AB', 'E על BC ונתון כי DE = DC']);
    holds(st, ['D', 'E'], ['D', 'C']);
  });

  it('a perpendicular condition is kept too: «D על BC ונתון כי AD ⊥ BC»', () => {
    const { last } = build(['משולש ABC', 'D על BC ונתון כי AD ⊥ BC']);
    expect(last.some((c) => c.type === 'cos-angle')).toBe(true);
  });

  it('the distance tail «D על AB במרחק 0.5 מ-A» is the given AD = 0.5 (He + En)', () => {
    for (const line of ['D על AB במרחק 0.5 מ-A', 'D on AB at distance 0.5 from A']) {
      const { st } = build(['משולש ABC', line]);
      const c3 = derive3(st.facts, st.seed).construction;
      expect(dist(resolve3(c3, st.seed).positions, 'A', 'D'), line).toBeCloseTo(0.5, 4);
    }
  });

  it('a ratio of the rider still bakes its t, and one that does not fit still refuses (controls)', () => {
    expect(parse3("K על AA' כך ש-AK = 2KA'")).toEqual({ ok: true, commands: [{ type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 2 / 3 }] });
    expect(parse3("K על AA' כך ש-AB = 2KA'")).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse3('D על BC')).toEqual({ ok: true, commands: [{ type: 'point-on-segment3', id: 'D', a: 'B', b: 'C', t: undefined }] });
  });

  it('a tail the grammar cannot read declines the whole line — never the placement alone', () => {
    for (const line of ['D על BC ונתון כי משהו אחר', 'D על BC והקטע הזה ארוך']) {
      const r = parse3(line);
      expect(r.ok, line).toBe(false);
    }
  });

  it('a shape subject is unchanged: «משולש ABC ונתון כי AB = AC» is not read as a placement', () => {
    expect(decideSubmit3({ facts: [], seed: 0 }, 'משולש ABC ונתון כי AB = AC').kind).not.toBe('record');
  });
});

describe('#1730 — the honesty net: a stated relation or number the commands do not carry', () => {
  const rider: Command3 = { type: 'point-on-segment3', id: 'D', a: 'B', b: 'C' };

  it('a relation on the point the line introduces is not accounted by its free placement', () => {
    expect(droppedGivenRelations3('D על BC ונתון כי AD = AC', [rider])).toEqual(['AD = AC']);
    expect(droppedGivenRelations3('E על BC ונתון כי BE = EC', [{ type: 'point-on-segment3', id: 'E', a: 'B', b: 'C' }])).toEqual(['BE = EC']);
    expect(droppedGivenRelations3('D על BC ונתון כי AD ⊥ BC', [rider])).toEqual(['AD ⊥ BC']);
  });

  it('a relation a command carries is accounted (the reads above, a baked ratio)', () => {
    const r = parse3('D על BC ונתון כי AD = AC');
    expect(r.ok && droppedGivenRelations3('D על BC ונתון כי AD = AC', r.commands)).toEqual([]);
    expect(droppedGivenRelations3('E על BC כך ש-BE = EC', [{ type: 'point-on-segment3', id: 'E', a: 'B', b: 'C', t: 0.5 }])).toEqual([]);
  });

  it('the submit seam refuses a dropped relation naming it (the LLM lane shares the gate)', () => {
    // a decomposition that keeps only the placement — what the rule did before
    const st = build(['משולש ABC']).st;
    const v = decideSubmit3(st, 'D על BC ונתון כי AD = AC');
    expect(v.kind).toBe('record'); // the deterministic read carries it now
    expect(droppedGivenRelations3('D על BC ונתון כי AD = AC', [rider])).toContain('AD = AC');
  });

  it('a command TYPE string is not a payload: «AD = 3» is not paid for by `point-on-segment3`', () => {
    expect(droppedGivenNumbers3('D על BC ונתון כי AD = 3', [rider])).toEqual(['3']);
    const r = parse3('D על BC ונתון כי AD = 3');
    expect(r.ok && droppedGivenNumbers3('D על BC ונתון כי AD = 3', r.commands)).toEqual([]);
  });
});

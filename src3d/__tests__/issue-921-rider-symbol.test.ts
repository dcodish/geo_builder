/**
 * #921 (ADR-3D-224) — A LETTER IN A RIDER'S RATIO CLAUSE IS A NAME, NOT A THING TO DISCARD.
 * #922 (ADR-3D-225) — A REFUSAL MAY NOT NAME A CAUSE THE FIGURE CONTRADICTS.
 *
 * The report: «E על SA כך ש-SE = t·SA» parsed green and threw the whole ratio clause away, so the
 * exam's very next line — «t = ½» — was refused as a letter the figure had never heard of, two lines
 * after the student wrote it. The same statement typed as its OWN fact («SE = t·SA», a `vec-rel` with
 * a symbol) built and pinned correctly all along: two spellings of one construction disagreeing, the
 * #820 class, and #748's rule decides it — the reading belongs to the RIDER, not to the utterance
 * that happened to declare it.
 *
 * The guards below are worth more than the new cases: every ratio spelling that worked before must
 * mean exactly what it meant, and a letter no mechanism owns must still refuse.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, symbolOwnersOf } from '../engine/types';
import type { Command3 } from '../engine/types';

const state = () => useGeo3.getState();
const build = (steps: string[]) => {
  state().clear();
  for (const u of steps) state().submit(u);
  return { st: state(), ...derive3(state().facts, state().seed) };
};
const PYRAMID = ['פירמידה SABCD שבסיסה ריבוע', 'נסמן: AB = u, AD = v, AS = w'];
const cmds = (u: string): Command3[] | null => {
  const r = parse3(u);
  return r.ok ? (r.commands as Command3[]) : null;
};
/** |XY| / |XZ| in the drawn figure. */
const ratio = (positions: Map<string, { x: number; y: number; z: number }>, x: string, y: string, z: string) => {
  const [X, Y, Z] = [x, y, z].map((id) => positions.get(id)!);
  const d = (p: typeof X, q: typeof X) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  return d(X, Y) / d(X, Z);
};

describe('#921 — the rider ratio letter is kept, bound, and addressable', () => {
  beforeEach(() => state().clear());

  it('the operator sequence: «SE = t·SA» then «t = ½» puts E at the midpoint of SA', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA כך ש-SE = t·SA', 't = 1/2']);
    expect(st.lastError).toBeNull();
    expect(st.facts).toHaveLength(4); // the value is a FACT, not a refusal
    expect(ratio(positions, 'S', 'E', 'A')).toBeCloseTo(0.5, 9);
  });

  it('the letter reaches the ONE resolver every symbol lane asks (#902)', () => {
    const c = applyCommand3(emptyConstruction3(), cmds('פירמידה SABCD שבסיסה ריבוע')![0]);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const r = applyCommand3(c.next, cmds('E על SA כך ש-SE = t·SA')![0]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(symbolOwnersOf(r.next, 't')).toEqual([{ kind: 'rider', id: 'E', fromB: false }]);
    expect(symbolOwnersOf(r.next, 'q'), 'a letter nobody named has no owner').toEqual([]);
  });

  it('the parse keeps the letter NAME-ONLY — the rider still has no determined t', () => {
    const [cmd] = cmds('E על SA כך ש-SE = t·SA')! as [{ type: string; t?: number; sym?: string; symFromB?: true }];
    expect(cmd.type).toBe('point-on-segment3');
    expect(cmd.sym).toBe('t');
    expect(cmd.t, 'name-only: promoting the letter to a solver unknown is the #814 mistake').toBeUndefined();
    expect(cmd.symFromB).toBeUndefined();
  });

  it('the complement spelling «AE = t·AS» measures t from the OTHER end', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA כך ש-AE = t·AS', 't = 1/4']);
    expect(st.lastError).toBeNull();
    // t is measured from A, so E sits a quarter of the way from A — three quarters from S.
    expect(ratio(positions, 'A', 'E', 'S')).toBeCloseTo(0.25, 9);
  });

  it('a value that would push the rider OFF its segment is refused, never clamped', () => {
    const { st } = build([...PYRAMID, 'E על SA כך ש-SE = t·SA', 't = 2']);
    expect(st.lastError).toEqual({ code: 'no-solution', id: 'E' });
  });

  it('FIRST BINDING WINS — a second rider written with the same letter does not steal it', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA כך ש-SE = t·SA', 'F על SB כך ש-SF = t·SB', 't = 1/2']);
    expect(st.lastError).toBeNull();
    expect(ratio(positions, 'S', 'E', 'A'), 'the first rider owns t').toBeCloseTo(0.5, 9);
  });

  it('the WHOLE-HOST ratio now reads with a number too — the spelling that used to refuse', () => {
    const { st, positions } = build([...PYRAMID, 'E על SA כך ש-SE = 0.4·SA']);
    expect(st.lastError).toBeNull();
    expect(ratio(positions, 'S', 'E', 'A')).toBeCloseTo(0.4, 9);
    // …and one that contradicts the membership in the same sentence is still refused, not clamped.
    expect(cmds('E על SA כך ש-SE = 2·SA'), 'a rider cannot sit beyond its host').toBeNull();
  });

  // ── the guards: every spelling that worked before means exactly what it meant ──

  it('the anonymous rider is unchanged — no clause, no letter, a free sampled t', () => {
    const [cmd] = cmds('E על SA')! as [{ type: string; t?: number; sym?: string }];
    expect(cmd).toEqual({ type: 'point-on-segment3', id: 'E', a: 'S', b: 'A' });
    expect(cmd.sym).toBeUndefined();
  });

  it("the catalog HALVES form «K על AA' כך ש-AK = 2KA'» is byte-unchanged", () => {
    expect(cmds("K על AA' כך ש-AK = 2KA'")).toEqual([{ type: 'point-on-segment3', id: 'K', a: 'A', b: "A'", t: 2 / 3 }]);
  });

  it('the catalog COLON form «E על AC כך ש-AE:EC = 2:1» is byte-unchanged', () => {
    expect(cmds('E על AC כך ש-AE:EC = 2:1')).toEqual([{ type: 'point-on-segment3', id: 'E', a: 'A', b: 'C', t: 2 / 3 }]);
  });

  it('a ratio clause that describes some OTHER rider is still refused, never dropped', () => {
    expect(cmds("E על SA כך ש-XY = t·XZ")).toBeNull();
  });

  it('a value on a letter the figure genuinely lacks still refuses unknown-symbol', () => {
    const { st } = build([...PYRAMID, 'E על SA כך ש-SE = t·SA', 'q = 1/2']);
    expect(st.lastError).toEqual({ code: 'unknown-symbol', id: 'q' });
  });
});

describe('#922 — a refusal may not claim the figure never defined a letter it defines', () => {
  beforeEach(() => state().clear());

  it('«k חיובי» after «SN = k·SC» is now HONOURED — #930 superseded the refusal this case locked', () => {
    // This case asserted `sign-not-selectable`, which was #922's whole point: say truthfully that the
    // sign is not selectable for THIS kind of letter, rather than falsely claim the figure never defined
    // k. #930 (ADR-3D-236) is the capability half that #922's own text promised — it makes a vec-def's
    // ratio symbol sign-selectable, so the honest refusal is replaced by honouring the given.
    //
    // #922's invariant is NOT weakened, and the two cases below are where it now lives: a letter no
    // mechanism owns still refuses `unknown-symbol`, and a RIDER parameter — genuinely confined to (0,1)
    // by its own membership — still refuses `sign-not-selectable`. The two must not collapse into one.
    const { st } = build(['פירמידה ABCDS שבסיסה ריבוע', 'נסמן: AD = u, AB = v, AS = w', 'SN = k·SC', 'k חיובי']);
    expect(st.lastError, 'the sign is honoured, not refused').toBeNull();
  });

  it('a sign on a letter NO mechanism owns still refuses unknown-symbol — the two must not collapse', () => {
    const { st } = build(['פירמידה ABCDS שבסיסה ריבוע', 'נסמן: AD = u, AB = v, AS = w', 'SN = k·SC', 'q חיובי']);
    expect(st.lastError).toEqual({ code: 'unknown-symbol', id: 'q' });
  });

  it('a rider parameter has no sign to select either — same honest message', () => {
    const { st } = build([...PYRAMID, 'E על SA כך ש-SE = t·SA', 't חיובי']);
    expect(st.lastError).toEqual({ code: 'sign-not-selectable', id: 't' });
  });

  it('a sign on a PIVOT symbol is still honoured (the #325/#814 lanes are untouched)', () => {
    const { st } = build(["תיבה ABCDA'B'C'D'", 'A(0,0,0)', 'B(4,0,0)', 'D(0,1,0)', 'C(p²,1,0)', 'p חיובי']);
    expect(st.lastError).toBeNull();
  });
});

/**
 * ADR-3D-134 (#492, #425) — a refusal names the cause it actually FOUND.
 *
 * Both reports are the same shape: the engine's refusal was CORRECT in substance and its explanation
 * named the wrong cause, because the explanation was selected from an ENUMERATION of kinds while the
 * finding itself was general (docs/17 — «an enumeration is not a rule»).
 *
 *  - #492: «l ∥ π1» over `d·n = 2((m−1)²+1)` admits no real m at all. The `no-roots` refusal was gated
 *    on a LIST of command types written before S2 (#378) added the line relations, so the statement
 *    fell through to the claim verifier and was reported as «the claim doesn't hold in the figure —
 *    check your computation»: the student's arithmetic blamed for a claim no real m can satisfy.
 *  - #425: the pivot guard was deliberately widened to EVERY pin kind while the message it emits
 *    stayed the injection-specific «no placement matches the given coordinates» — told to a student
 *    whose figure contains no coordinate anywhere.
 *
 * These tests lock the DISCRIMINATION (the satisfiable twin still builds; the feasibility boundary is
 * where it was), never merely the strings.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

const state = () => useGeo3.getState();
const submit = (u: string) => state().submit(u);
const build = (utts: string[]) => {
  state().clear();
  for (const u of utts) submit(u);
};

beforeEach(() => state().clear());

// ---------------------------------------------------------------------------
// #492 — no REAL parameter value exists (the operator's 2026-08-10 figure)
// ---------------------------------------------------------------------------

const PLANE = 'מישור π1: x+(m-2)y+(m-1)z-5=0';
/** d·n = 2m² − 4m + 4 = 2((m−1)² + 1) — strictly positive, so ℓ ∥ π1 is unsatisfiable for every real m. */
const LINE_IMPOSSIBLE = 'הישר l: x=(1,2,3)+t(m+2,m,m-2)';
/** d·n = 2m² − 4 — the operator's components before the transposition; roots m = ±√2. */
const LINE_SATISFIABLE = 'הישר l: x=(1,2,3)+t(m-2,m,m+2)';

describe('#492 — an unsatisfiable parameter claim says so, and names the statement', () => {
  it('the reported figure refuses with no-roots, naming m and the statement — never claim-refuted', () => {
    build([LINE_IMPOSSIBLE, PLANE]);
    const n = state().facts.length;
    submit('l מקביל לπ1');
    expect(state().facts).toHaveLength(n); // keep-prior — nothing committed
    expect(state().lastError).toEqual({ code: 'no-roots', sym: 'm', stated: 'l מקביל לπ1', others: [] });
  });

  it('the SATISFIABLE twin still builds and pins m = ±√2 (ADR-3D-118 branches intact)', () => {
    build([LINE_SATISFIABLE, PLANE, 'l מקביל לπ1']);
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(3);
    const roots = derive3(state().facts, 0).resolved.param!.roots;
    expect(roots).toHaveLength(2);
    expect(roots.map((r) => Math.abs(r))).toEqual([Math.SQRT2, Math.SQRT2].map((x) => expect.closeTo(x, 6)));
  });

  it('the discrimination is the RESIDUAL, not the wording: only the impossible figure has no roots', () => {
    const facts = (utts: string[]): Fact3[] =>
      utts.map((u, i) => {
        const r = parse3(u);
        if (!r.ok) throw new Error(`unparsed: ${u}`);
        return { id: `f${i}`, utterance: u, cmds: r.commands, enabled: true };
      });
    const rootsOf = (line: string) => derive3(facts([line, PLANE, 'l מקביל לπ1']), 0).resolved.param!.roots;
    expect(rootsOf(LINE_IMPOSSIBLE)).toEqual([]);
    expect(rootsOf(LINE_SATISFIABLE)).toHaveLength(2);
  });

  it('a claim that merely fails at THIS configuration keeps the claim-refuted register', () => {
    // a determined figure with no parameter at all — the V2 verify-your-answer lane is untouched
    build(['קובייה ABCDA\'B\'C\'D\'', "|AB| = 4"]);
    const n = state().facts.length;
    submit('|AC| = 4'); // a face diagonal is 4√2, not 4
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).not.toBeNull();
    expect(state().lastError!.code).not.toBe('no-roots');
  });
});

// ---------------------------------------------------------------------------
// #425 — contradictory pins on a figure that carries NO coordinates
// ---------------------------------------------------------------------------

/** Triangular pyramid on an equilateral base. ∠BAC = 60°, so the spherical triangle inequality
 *  ∠DAB ≤ ∠DAC + ∠BAC forces ∠DAC ≥ 60° once ∠DAB = 120°. No coordinate is stated anywhere. */
const PYRAMID = ['פירמידה משולשת ABCD', 'AB', '|AB|=|BC|', 'AC', '|AB|=|AC|', 'AD', 'BD', 'זווית DAB = 120'];

describe('#425 — the givens contradict, and the refusal says which', () => {
  it('the reported step refuses naming the CONFLICTING STATEMENTS, not coordinates that do not exist', () => {
    build(PYRAMID);
    const n = state().facts.length;
    submit('זווית DAC = 53.13');
    expect(state().facts).toHaveLength(n); // keep-prior
    expect(state().lastError).toEqual({
      code: 'givens-contradict',
      stated: 'זווית DAC = 53.13',
      others: ['|AB|=|BC|', '|AB|=|AC|', 'זווית DAB = 120'],
    });
    // the figure contains no coordinate of any kind — which is why the injection register is wrong here
    const c = derive3(state().facts, 0).construction;
    expect(c.pins).toHaveLength(0);
    expect(c.vectorPins).toHaveLength(0);
  });

  it('the FEASIBILITY BOUNDARY is unmoved — 60.1° accepted, 59.9° refused (the solver was never at fault)', () => {
    for (const deg of [65, 61, 60.1]) {
      build(PYRAMID);
      submit(`זווית DAC = ${deg}`);
      expect(state().lastError, `${deg}° must be feasible`).toBeNull();
    }
    for (const deg of [59.9, 55, 53.13]) {
      build(PYRAMID);
      submit(`זווית DAC = ${deg}`);
      expect(state().lastError?.code, `${deg}° must be refused`).toBe('givens-contradict');
    }
  });

  it('a COORDINATE contradiction keeps the injection register — the split did not take the real case with it', () => {
    build(['קובייה ABCDA\'B\'C\'D\'', 'A(0,0,0)', 'B(4,0,0)']);
    const n = state().facts.length;
    submit("C'(99,99,99)"); // no cube placement puts C' there given A and B
    expect(state().facts).toHaveLength(n);
    expect(state().lastError?.code).toBe('injection-unsatisfiable');
  });

  it('blame lands on the NEWEST statement alone — the earlier givens are not marked red (ADR-276)', () => {
    build(PYRAMID);
    submit('זווית DAC = 53.13');
    // the refused fact is not committed; every committed fact stays ok
    const d = derive3(state().facts, 0);
    for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });
});

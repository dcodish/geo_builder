/**
 * #72 (ADR-3D-039): the 3-D phrasing batch from the baseline log-triage (2026-07-11) —
 * five context-verified prod gaps, each a widening of an existing lane:
 *   1. the connect-imperative `נחבר את D'F` → bare segment
 *   2. the diagonal noun `אלכסון BD'` (+ the final-ם slip) → bare segment
 *   3. `חץ A'C` / `הוקטור A'C` — an UNNAMED ink arrow (never a basis member)
 *   4. `אורך AB=BC` — the length marker DISAMBIGUATES the pair=pair ambiguity
 *   5. `אנך יורד מMלבסיס` (the glued prod form) — ⟂ from a point to the base, foot auto-minted
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
const cmd = (u: string) => {
  const r = parse3(u);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
type V = { x: number; y: number; z: number };
const sub = (p: V, q: V): V => ({ x: p.x - q.x, y: p.y - q.y, z: p.z - q.z });
const dot = (p: V, q: V) => p.x * q.x + p.y * q.y + p.z * q.z;
const nrm = (p: V) => Math.hypot(p.x, p.y, p.z);

describe('#72 — parse: the prod phrasings lower deterministically', () => {
  it("connect-imperative + diagonal noun → bare segment (exact prod: נחבר את D'F, אלכסון BD')", () => {
    expect(cmd("נחבר את D'F")).toMatchObject([{ type: 'segment3', a: "D'", b: 'F' }]);
    expect(cmd("חבר את D'F")).toMatchObject([{ type: 'segment3' }]);
    expect(cmd("אלכסון BD'")).toMatchObject([{ type: 'segment3', a: 'B', b: "D'" }]);
    expect(cmd("אלכסום BD'")).toMatchObject([{ type: 'segment3' }]); // the prod final-ם slip
    expect(cmd("connect D'F")).toMatchObject([{ type: 'segment3' }]);
    expect(cmd("the diagonal BD'")).toMatchObject([{ type: 'segment3' }]);
  });
  it("arrow noun → draw-arrow (exact prod: חץ A'C)", () => {
    expect(cmd("חץ A'C")).toMatchObject([{ type: 'draw-arrow', from: "A'", to: 'C' }]);
    expect(cmd("arrow A'C")).toMatchObject([{ type: 'draw-arrow' }]);
    // the vector WORD stays normalize3-stripped decoration — the established segment reading
    expect(cmd("הוקטור A'C")).toMatchObject([{ type: 'segment3' }]);
  });
  it('אורך AB=BC disambiguates to a LENGTH relation (exact prod)', () => {
    expect(cmd('אורך AB=BC')).toMatchObject([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'length-rel', a1: 'A', b1: 'B', rhs: { pair: ['B', 'C'] }, c: 1 },
    ]);
    expect(cmd('length AB = BC')).toMatchObject([{ type: 'segment3' }, { type: 'length-rel' }]);
    // the bare pair=pair stays the honest clarification — the marker is what disambiguates
    expect(parse3('AB=BC')).toMatchObject({ ok: false, reason: 'ambiguous-vector-length' });
  });
  it('אנך יורד מMלבסיס (the glued prod form) → perp-to-base', () => {
    expect(cmd('אנך יורד מMלבסיס')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
    expect(cmd('אנך יורד מ-M לבסיס')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
    expect(cmd('מ-M מורידים אנך לבסיס')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
    expect(cmd('drop a perpendicular from M to the base')).toMatchObject([{ type: 'perp-to-base', from: 'M' }]);
  });
});

describe('#72 — build', () => {
  beforeEach(reset);

  it('the unnamed arrow draws (scene overlay, no label) and never joins the basis', () => {
    submit('קובייה');
    submit("חץ A'C");
    expect(state().lastError).toBeNull();
    const d = derived();
    expect(d.construction.arrows).toEqual([["A'", 'C']]);
    expect(d.construction.vectors.size).toBe(0); // not a named vector — the basis is untouched
    const scene = buildScene3(d.construction, d.resolved, { yaw: 0.6, pitch: 0.42 }, { width: 520, height: 420 });
    const arrow = scene.vectors.find((v) => v.name === '');
    expect(arrow, 'the arrow rides the vector overlay').toBeTruthy();
  });

  it('אורך AB=BC drives a free box toward |AB| = |BC|', () => {
    submit('תיבה');
    submit('אורך AB=BC');
    expect(state().lastError).toBeNull();
    const d = derived();
    const A = d.resolved.positions.get('A')!;
    const B = d.resolved.positions.get('B')!;
    const C = d.resolved.positions.get('C')!;
    expect(nrm(sub(A, B))).toBeCloseTo(nrm(sub(B, C)), 4);
  });

  it('perp-to-base mints a foot ON the base plane with the segment ⟂ it (pyramid apex M)', () => {
    submit('פירמידה MABCD שבסיסה ריבוע');
    submit('אנך יורד מMלבסיס');
    expect(state().lastError).toBeNull();
    const d = derived();
    // the minted foot is the first unused label — E
    const E = d.resolved.positions.get('E')!;
    expect(E, 'foot E minted').toBeTruthy();
    const [A, B, C] = ['A', 'B', 'C'].map((i) => d.resolved.positions.get(i)!);
    const n = {
      x: (B.y - A.y) * (C.z - A.z) - (B.z - A.z) * (C.y - A.y),
      y: (B.z - A.z) * (C.x - A.x) - (B.x - A.x) * (C.z - A.z),
      z: (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x),
    };
    // E on the base plane
    expect(Math.abs(dot(sub(E, A), n)) / (nrm(n) || 1)).toBeLessThan(1e-6);
    // M→E ⟂ the base (parallel to the normal)
    const ME = sub(d.resolved.positions.get('M')!, E);
    expect(Math.abs(dot(ME, n))).toBeCloseTo(nrm(ME) * nrm(n), 4);
    // and the height segment is drawn
    expect(d.construction.segments.some(([a, b]) => (a === 'M' && b === 'E') || (a === 'E' && b === 'M'))).toBe(true);
  });

  it('perp-to-base with no solid refuses honestly', () => {
    submit('M(1,2,3)');
    const before = state().facts.length;
    submit('אנך יורד מ-M לבסיס');
    expect(state().lastError).toMatchObject({ code: 'unknown-plane' });
    expect(state().facts).toHaveLength(before);
  });
});

describe('#55 (ADR-3D-040): the coefficient form of the length/vector ambiguity', () => {
  const val = (u: string) => {
    const c = cmd(u).find((x) => x.type === 'length-rel') as { c: number } | undefined;
    return c?.c;
  };

  it("gap (a): a bare pair = <radical-coef>·pair is a vec-rel (like A'K = 4/5 DN), not not-handled", () => {
    // The coefficient form resolves to the NEUTRAL vector lane (ADR-3D-010) exactly like `A'K = 4/5 DN` —
    // routing it to the ambiguity clarification would regress that established behaviour. Only the BARE
    // c=1 pair=pair stays the length/vector ambiguity. `√2` just needs to parse like `4/5`.
    for (const u of ['AB=√2*OD', 'AB = √2·OD', 'A\'K = 4/5 DN']) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands.some((c) => c.type === 'vec-rel')).toBe(true);
    }
    // the no-coefficient bare pair is still the length/vector ambiguity (unchanged)
    const bare = parse3('AS = AB');
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.reason).toBe('ambiguous-vector-length');
  });

  it("gap (b): a LENGTH-marked LHS accepts a bare pair RHS with a coefficient", () => {
    expect(val('|AB| = √2 OD')).toBeCloseTo(Math.SQRT2, 6); // pipes disambiguate → length
    expect(val('|AB| = √2·OD')).toBeCloseTo(Math.SQRT2, 6);
    expect(val('|AB| = OD')).toBeCloseTo(1, 6);
  });

  it('no-theft: an ARROWED pair stays a vector relation; markers/numerics unchanged', () => {
    expect(parse3('AB⃗ = 2·OD⃗').ok).toBe(true); // vector lane
    expect(cmd('AB⃗ = 2·OD⃗').some((c) => c.type === 'vec-rel')).toBe(true);
    expect(val('|AB| = √2·|OD|')).toBeCloseTo(Math.SQRT2, 6); // pipes-both, unchanged
    expect(cmd('|w| = 2').some((c) => c.type === 'vec-mag')).toBe(true); // named-vector magnitude
    expect(cmd('AS = 12').some((c) => c.type === 'claim')).toBe(true); // numeric length given, not ambiguous
  });
});

/**
 * #449 (ADR-3D-137) — gap 2's remainder, from the 2026-08-08 log triage (2 users, operator-approved):
 * the diagonal noun may carry the SOLID it belongs to. «אלכסון תיבה AC'» names exactly the segment
 * «אלכסון AC'» names — a space diagonal IS a segment (the #72 ruling) — but the qualifier was not
 * admitted, so the label group had to match «תיבה» and the utterance escalated to the LLM.
 */
describe("#449 — «אלכסון תיבה AC'»: the diagonal noun carries its solid", () => {
  it('the reported phrasing names the SAME segment as the bare one', () => {
    /**
     * This compared the two commands with `toEqual` until #859. What #449 established — and what is
     * still asserted — is that the solid qualifier does not change WHICH segment is named. It no longer
     * makes the two commands equal: under the operator's ruling the qualifier carries a strictly
     * stronger CLAIM («אלכסון תיבה AC'» asserts a SPACE diagonal, the bare form only a diagonal), which
     * is the whole point of that fix. So the segment is compared, and the claims are asserted to differ.
     */
    const qualified = cmd("אלכסון תיבה AC'");
    const bare = cmd("אלכסון AC'");
    const seg = ({ type, a, b }: { type: string; a: string; b: string }) => ({ type, a, b });
    expect(qualified.map(seg as never)).toEqual(bare.map(seg as never));
    expect(qualified).toMatchObject([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
    expect((qualified[0] as { diagonal?: string }).diagonal, 'the solid qualifier claims SPACE').toBe('space');
    expect((bare[0] as { diagonal?: string }).diagonal, 'the bare noun claims only a diagonal').toBe('any');
  });


  /**
   * #859 — these assertions were `toEqual` on the exact command. They are now `toMatchObject` on the
   * SEGMENT, with the diagonal CLAIM asserted separately, because the operator ruled the word must be
   * checked: *"the term אלכסון should be sure to be a diagonal."* So «אלכסון תיבה AC'» now carries
   * `diagonal: 'space'` in addition to naming A–C'.
   *
   * What #449 locks is unchanged and still locked: the qualifier does not change WHICH segment is named.
   * What is deliberately no longer locked is that the command has no other fields — that was never the
   * property #449 was defending, and pinning it would forbid ever enriching the lowering.
   */
  it('every solid noun, with and without the definite article', () => {
    for (const u of [
      "אלכסון התיבה AC'",
      "אלכסון קובייה AC'",
      "אלכסון קוביה AC'",
      "אלכסון הקובייה AC'",
      "אלכסון מנסרה AC'",
      "אלכסון פירמידה AC'",
    ])
      expect(cmd(u), u).toMatchObject([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
  });

  it('the English forms', () => {
    for (const u of ["space diagonal AC'", "main diagonal AC'", "the space diagonal of the box AC'", "diagonal AC'"])
      expect(cmd(u), u).toMatchObject([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
  });

  it("#859 — the CLAIM each form makes: space for the qualified ones, `any` for a bare «אלכסון»", () => {
    for (const u of ["אלכסון תיבה AC'", "אלכסון קובייה AC'", "space diagonal AC'", "main diagonal AC'"])
      expect(cmd(u)[0], u).toMatchObject({ diagonal: 'space' });
    // מנסרה/פירמידה stay at the weaker claim: a pyramid HAS no space diagonal, so demanding one would
    // refuse the face diagonal the student legitimately drew.
    for (const u of ["אלכסון מנסרה AC'", "אלכסון פירמידה AC'", "diagonal AC'", "אלכסון AC'"])
      expect(cmd(u)[0], u).toMatchObject({ diagonal: 'any' });
    // «קטע AB» claims nothing about the pair, so it carries no claim at all and is never checked
    expect(cmd('קטע AB')[0]).not.toHaveProperty('diagonal');
  });

  it('it builds end-to-end on a real box, drawn as ink', () => {
    reset();
    submit("תיבה ABCDA'B'C'D'");
    submit("אלכסון תיבה AC'");
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(2);
    expect(derived().construction.segments.some(([a, b]) => (a === 'A' && b === "C'") || (a === "C'" && b === 'A'))).toBe(true);
  });

  it('no theft: the solid DECLARATION and a plain segment are untouched', () => {
    expect(cmd("תיבה ABCDA'B'C'D'")).toEqual([{ type: 'solid', kind: 'box', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }]);
    expect(cmd('קטע AB')).toEqual([{ type: 'segment3', a: 'A', b: 'B', bare: true }]);
    expect(cmd("AC'")).toEqual([{ type: 'segment3', a: 'A', b: "C'", bare: true }]);
  });
});

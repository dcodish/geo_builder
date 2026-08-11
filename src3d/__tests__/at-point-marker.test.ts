/**
 * ADR-3D-139 (#530, P1) — a marker that names a point either BINDS its own label or the rule declines.
 * It may never source that label positionally.
 *
 * Prod session `rsqkx2` (2026-08-11): «אלכסוני A'B'C'D' נחתכים בנקודהS» — an ordinary missing space.
 * The marker regex required `\s+`, did not match, and the code fell back to the token list: A′ became
 * the crossing point and the quad B′C′D′S — a face the student never wrote — was assembled from letters
 * lifted out of two different roles. Prod answered `already-defined`, which was a cover story: the
 * utterance did not fail to parse, it parsed into a DIFFERENT FIGURE. Only the accident that A′ already
 * existed turned it into a refusal; on a figure where it does not, this builds a plausible wrong figure.
 *
 * The comment above that code records the same fallback biting once before (the English point-last
 * form). That fix widened the marker VOCABULARY and left the fallback armed — which is exactly why the
 * fix here is structural, and why the vocabulary half is now ONE shared fragment (`AT_POINT`) across
 * every rule that names a point this way, rather than six independent spellings.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

const cmds = (u: string) => {
  const r = parse3(u);
  return r.ok ? r.commands : null;
};
const state = () => useGeo3.getState();

describe('#530 — the reported utterance builds the figure the student wrote', () => {
  it('the missing space no longer changes WHICH figure is built', () => {
    expect(cmds("אלכסוני A'B'C'D' נחתכים בנקודהS")).toEqual([
      { type: 'diag-intersection', id: 'S', face: ["A'", "B'", "C'", "D'"] },
    ]);
    // …and it is the same figure the spaced spelling builds — the point of the fix
    expect(cmds("אלכסוני A'B'C'D' נחתכים בנקודהS")).toEqual(cmds("אלכסוני A'B'C'D' נחתכים בנקודה S"));
  });

  it('the quad the bug invented is never built: A′ is not the crossing, B′C′D′S is not a face', () => {
    const out = cmds("אלכסוני A'B'C'D' נחתכים בנקודהS")!;
    const diag = out.find((c) => c.type === 'diag-intersection') as { id: string; face: string[] };
    expect(diag.id).not.toBe("A'");
    expect(diag.face).not.toContain('S');
  });

  it('end-to-end: the operator’s figure builds, S is the crossing of the named face', () => {
    state().clear();
    state().submit("תיבה ABCDA'B'C'D'");
    state().submit("אלכסוני A'B'C'D' נחתכים בנקודהS");
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(2);
    const d = derive3(state().facts, 0);
    const [S, A2, C2] = ['S', "A'", "C'"].map((id) => d.resolved.positions.get(id)!);
    expect(S, 'S is placed').toBeTruthy();
    // the diagonal crossing of a parallelogram face IS the midpoint of A′C′
    expect(S.x).toBeCloseTo((A2.x + C2.x) / 2, 6);
    expect(S.y).toBeCloseTo((A2.y + C2.y) / 2, 6);
    expect(S.z).toBeCloseTo((A2.z + C2.z) / 2, 6);
  });
});

describe('#530 — the PROPERTY, not the two strings: id is never sourced positionally', () => {
  /** Every marker spelling a student can produce, over several label sets and both separators. */
  const MARKED = [
    "אלכסוני A'B'C'D' נחתכים בנקודה S",
    "אלכסוני A'B'C'D' נחתכים בנקודהS",
    'אלכסוני ABCD נחתכים בנקודה O',
    'אלכסוני ABCD נחתכים בנקודהO',
    'אלכסוני ABCD נחתכים בנקודת O',
    'diagonals of ABCD meet at O',
    'diagonals of ABCD meet at point O',
    'diagonals of ABCD meet at the point O',
    'the diagonals of ABCD intersect at O',
  ];

  it.each(MARKED)('«%s» — the id is the MARKER’s label, or the rule declines', (u) => {
    const out = cmds(u);
    if (out === null) return; // declining is always allowed; reinterpreting is not
    const c = out.find((x) => x.type === 'diag-intersection' || x.type === 'point-on-segment3') as
      | { id: string; face?: string[] }
      | undefined;
    expect(c, 'a crossing command was produced').toBeTruthy();
    // the marker's label is the LAST capital-letter token of the utterance
    const marked = [...u.matchAll(/[A-Z]\d*'?/g)].map((m) => m[0]).pop()!;
    expect(c!.id, `id must come from the marker (${marked})`).toBe(marked);
    expect(c!.face ?? [], 'the marker label is never absorbed into the face').not.toContain(marked);
  });

  it('a sentence carrying the marker but no readable label DECLINES — it never falls back', () => {
    // the tell is present, the binding is not: escalate (the LLM may still read it), never reinterpret
    for (const u of ['אלכסוני ABCD נחתכים בנקודה', 'diagonals of ABCD meet at the centre'])
      expect(cmds(u), u).toBeNull();
  });

  it('the NO-marker forms keep the positional reading (point-first is not affected)', () => {
    expect(cmds('O מפגש האלכסונים של הפאה ABCD')).toEqual([{ type: 'diag-intersection', id: 'O', face: ['A', 'B', 'C', 'D'] }]);
    expect(cmds('O = intersection of diagonal AC with diagonal BD')).toEqual([
      { type: 'point-on-segment3', id: 'O', a: 'A', b: 'C', t: 0.5 },
    ]);
  });
});

describe('#530 — the shared marker: every rule that names a point this way agrees', () => {
  /** Spaced vs glued must be the SAME parse at every site — the vocabulary half of the class fix. */
  it.each([
    ['אלכסוני ABCD נחתכים בנקודה O', 'אלכסוני ABCD נחתכים בנקודהO'],
    ['תיכוני הפאה SAB נפגשים בנקודה P', 'תיכוני הפאה SAB נפגשים בנקודהP'],
    ['מעגל שמרכזו O משיק לישר AB בנקודה K', 'מעגל שמרכזו O משיק לישר AB בנקודהK'],
    ['מ-A מורידים אנך למישור π1 החותך אותו בנקודה B', 'מ-A מורידים אנך למישור π1 החותך אותו בנקודהB'],
    ['מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C', 'מ-B מעבירים אנך לישר ℓ החותך אותו בנקודהC'],
    ['ℓ חותך את π בנקודה A', 'ℓ חותך את π בנקודהA'],
    ["הישר A'C חותך את המישור BC'D בנקודה K", "הישר A'C חותך את המישור BC'D בנקודהK"],
    ['המישור π חותך את SA בנקודה E', 'המישור π חותך את SA בנקודהE'],
  ])('«%s» ≡ glued', (spaced, glued) => {
    expect(cmds(spaced), spaced).not.toBeNull();
    expect(cmds(glued)).toEqual(cmds(spaced));
  });

  it('the tangency label is no longer DROPPED by the glued form (the second silent member)', () => {
    // it committed with a green ✓ and no `touch` — the student's K vanished from the figure
    const out = cmds('מעגל שמרכזו O משיק לישר AB בנקודהK')!;
    const circle = out.find((c) => c.type === 'circle3') as { touch?: string };
    expect(circle.touch).toBe('K');
  });
});

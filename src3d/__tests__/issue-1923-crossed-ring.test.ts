/**
 * Issue #1923 (ADR-3D-314): a polygon DECLARED over points fixed by coordinates must be a simple ring.
 *
 * The class (measured on main @ 5edeeca1 and at #1918's tip): *3-D checked a declared polygon's ring for
 * collapse (ADR-3D-310), but never for self-crossing* — «A(0,0,0) · B(4,0,0) · C(1,3,0) · D(3,3,0) · טרפז ABCD»
 * names a ring whose sides BC and DA cross, and it recorded green, as did every polygon noun over coordinate-
 * fixed points. Analytic, the ruled reference, refuses it (`ring-contradicts-noun`, ADR-AG-129) in these words.
 *
 * The lock: both reported sequences verbatim with the exact text, both declaration-first orders, every class row,
 * and the controls — a simple order, a ring with a free vertex, the shape-determined crossings (not in the ruled
 * scope), the claim-refuted siblings, a ring that only TOUCHES itself.
 */

import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';
import { ringSelfCrossing3, v3 } from '../engine/vec3';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('en')(k, o) as string);

type St = { facts: Fact3[]; seed: number };
/** Submit each line; returns every verdict kind and the last refusal's error. */
function play(lines: readonly string[]) {
  let n = 0;
  let st: St = { facts: [], seed: 0 };
  const kinds: string[] = [];
  let error: unknown = null;
  for (const line of lines) {
    const v = decideSubmit3(st, line, () => `f${++n}`);
    kinds.push(v.kind);
    if (v.kind === 'refused') error = v.error;
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return { st, kinds, error: error as Parameters<typeof errorText3>[1] };
}

const PTS = ['A(0,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)'];

describe('#1923 the reported sequences, verbatim', () => {
  it.each(['טרפז ABCD', 'מרובע ABCD'])('«… · %s» — the declaration is refused, in analytic\'s words', (noun) => {
    const r = play([...PTS, noun]);
    expect(r.kinds).toEqual(['record', 'record', 'record', 'record', 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: noun });
    expect(errorText3(he, r.error)).toBe(
      `הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: «${noun}». אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.`,
    );
    expect(errorText3(en, r.error)).toBe(
      `The points you gave do not form that shape in this order: «${noun}». Reorder the letters so the sides do not cross, or move the points — as written the vertices fall on one line or the shape folds over itself.`,
    );
  });

  it.each(['טרפז ABCD', 'מרובע ABCD', 'quadrilateral ABCD'])('declared first «%s» — the coordinate that completes the crossing is refused', (noun) => {
    const r = play([noun, ...PTS]);
    expect(r.kinds).toEqual(['record', 'record', 'record', 'record', 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: 'D(3,3,0)' });
  });

  it('a saved list holding the crossed ring loads with the declaration row failed', () => {
    const facts = play([...PTS, 'מרובע ABDC']).st.facts; // the simple order, recorded
    const crossed: Fact3 = { ...facts[4], id: 'x', utterance: 'מרובע ABCD', cmds: [{ type: 'solid', kind: 'polygon4', ids: ['A', 'B', 'C', 'D'] }] };
    expect(derive3([...facts.slice(0, 4), crossed], 0).status.x).toEqual({ code: 'ring-crossed', stated: 'מרובע ABCD' });
  });
});

describe('#1923 the class — every polygon noun over coordinate-fixed points', () => {
  it.each([
    [[...PTS, 'טרפז שווה שוקיים ABCD']],
    [[...PTS, 'ABCD טרפז']],
    [[...PTS, 'the quadrilateral ABCD']],
    [['A(0,0,0)', 'B(4,0,0)', 'C(-2,3,0)', 'D(0,3,0)', 'טרפז ישר זווית ABCD']],
    [['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(2,5,0)', 'E(0,3,0)', 'מחומש ACEBD']],
    [['A(0,0,0)', 'B(4,0,0)', 'C(0,4,0)', 'E(8,2,0)', 'M אמצע AE', 'מרובע ACBM']],
    [['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,0)', 'מרובע ACBD']],
  ])('%j — the last line is refused `ring-crossed`', (lines) => {
    const r = play(lines);
    expect(r.kinds.slice(0, -1).every((k) => k === 'record')).toBe(true);
    expect(r.kinds[r.kinds.length - 1]).toBe('refused');
    expect(r.error).toEqual({ code: 'ring-crossed', stated: lines[lines.length - 1] });
  });
});

describe('#1923 the controls — unchanged', () => {
  it('the simple order on the same points records', () => {
    expect(play([...PTS, 'טרפז ABDC']).kinds).toEqual(['record', 'record', 'record', 'record', 'record']);
  });

  it.each(['מלבן ACBD', 'מקבילית ACBD', 'ריבוע ACBD', 'דלתון ACBD', 'מעוין ACBD'])('«%s» on crossed points keeps its own claim-refuted', (noun) => {
    const pts = noun.startsWith('ריבוע') ? ['A(0,0,0)', 'B(4,0,0)', 'C(4,4,0)', 'D(0,4,0)'] : ['A(0,0,0)', 'B(4,0,0)', 'C(4,3,0)', 'D(0,3,0)'];
    expect(play([...pts, noun]).error).toEqual({ code: 'claim-refuted' });
  });

  it('a ring with a FREE vertex is not judged (the configuration preference\'s business)', () => {
    expect(play(['A(0,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'מרובע ABCD']).kinds).toEqual(['record', 'record', 'record', 'record']);
  });

  /**
   * Once outside this ADR's ruled scope, now refused by #1927 (ADR-3D-322, the operator's ruling of 2026-10-08 on
   * shape-placed rings) — with the same code and words. Their own lock is `issue-1927-crossed-ring.test.ts`.
   */
  it.each([[['ריבוע ABCD', 'מרובע ACBD']], [['מלבן ABCD', 'מרובע ABDC']], [["קובייה ABCDA'B'C'D'", 'מרובע ACBD']]])(
    '%j — a crossing a SHAPE determines is refused too, since #1927 (ADR-3D-322)',
    (lines) => {
      const r = play(lines);
      expect(r.kinds).toEqual(['record', 'refused']);
      expect(r.error).toEqual({ code: 'ring-crossed', stated: lines[1] });
    },
  );

  it('a ring that only TOUCHES itself is not a crossing', () => {
    const lines = ['A(0,0,0)', 'B(4,0,0)', 'C(4,4,0)', 'D(0,2,0)', 'E(0,4,0)', 'מחומש ABCDE'];
    const r = play(lines);
    expect(r.error === null || (r.error as { code: string }).code !== 'ring-crossed').toBe(true);
  });
});

describe('#1923 ringSelfCrossing3', () => {
  it('a proper crossing of two non-adjacent sides, in the ring\'s own plane, in any orientation', () => {
    const crossed = [v3(0, 0, 0), v3(4, 0, 0), v3(1, 3, 0), v3(3, 3, 0)];
    expect(ringSelfCrossing3(crossed)).toBe(true);
    // the same ring tilted out of the floor
    expect(ringSelfCrossing3(crossed.map((p) => v3(p.x, p.y * 0.6, p.y * 0.8)))).toBe(true);
    expect(ringSelfCrossing3([v3(0, 0, 0), v3(4, 0, 0), v3(3, 3, 0), v3(1, 3, 0)])).toBe(false);
  });
  it('touching, collapsed and skew are not crossings', () => {
    expect(ringSelfCrossing3([v3(0, 0, 0), v3(4, 0, 0), v3(4, 4, 0), v3(0, 2, 0), v3(0, 4, 0)])).toBe(false); // D touches EA
    expect(ringSelfCrossing3([v3(0, 0, 0), v3(1, 0, 0), v3(2, 0, 0), v3(3, 0, 0)])).toBe(false); // on one line
    expect(ringSelfCrossing3([v3(0, 0, 0), v3(4, 0, 0), v3(1, 3, 0), v3(3, 3, 5)])).toBe(false); // BC and DA skew
    expect(ringSelfCrossing3([v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)])).toBe(false); // a triangle cannot cross
  });
});

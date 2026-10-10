/**
 * Issue #1927 (ADR-3D-322, amending ADR-3D-314) — a polygon declared over points a SHAPE already placed, in an order
 * that crosses in every configuration, is refused naming the line that completed it.
 *
 * Operator rulings on #1927: *"refused naming the declaration, in every builder, with analytic's
 * `errRingContradictsNoun` … Never green, never a raw error"* (2026-10-08); *"Search first, refuse last … Refuse only
 * when nothing the student wrote can save it"* (2026-10-09); and the shared text ends «או לשנות את מקומות הנקודות»
 * (2026-10-09, confirmed on the decisions page).
 *
 * Measured on main @ e0f4260c through `decideSubmit3`: «ריבוע ABCD · מרובע ACBD», «מלבן ABCD · מרובע ABDC», the cube's
 * «מרובע ACBD», the parallelogram, rhombus, trapezoid and midpoint rows and the ring-first «מרובע ABDC · מלבן ABCD»
 * all RECORDED green with the ring crossed. Two order-blind comparisons hid the second ring: a polygon over a
 * square's letters was matched as the square's own ring and dropped (`apply.ts`, the bound-polygon arm), and a
 * second stated quad over the same letters was never recorded (`recordShape`). ADR-3D-314's check also read only
 * coordinate-fixed rings.
 */

import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import i18n3d from '../i18n';
import { ringSelfCrossing3, type Vec3 } from '../engine/vec3';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const he = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('he')(k, o) as string);
const en = (k: string, o?: Record<string, unknown>) => plain(i18n3d.getFixedT('en')(k, o) as string);

type St = { facts: Fact3[]; seed: number };
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
const recorded = (lines: readonly string[]) => lines.slice(0, -1).map(() => 'record');

describe('#1927 the operator’s rows are refused at the last line, in the shared words', () => {
  it.each([
    [['ריבוע ABCD', 'מרובע ACBD']],
    [['מלבן ABCD', 'מרובע ABDC']],
    [['מלבן ABCD', 'טרפז ABDC']],
    [["קובייה ABCDA'B'C'D'", 'מרובע ACBD']],
  ])('%j', (lines) => {
    const last = lines[lines.length - 1];
    const r = play(lines);
    expect(r.kinds).toEqual([...recorded(lines), 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: last });
    expect(errorText3(he, r.error)).toBe(
      `הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: «${last}». אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.`,
    );
    expect(errorText3(en, r.error)).toBe(
      `The points you gave do not form that shape in this order: «${last}». Reorder the letters so the sides do not cross, or move the points — as written the vertices fall on one line or the shape folds over itself.`,
    );
    // nothing is committed: the figure is the prior lines' alone
    expect(r.st.facts.length).toBe(lines.length - 1);
  });
});

describe('#1927 the class — a shape-placed ring crossed in every configuration, both orders', () => {
  it.each([
    [['ריבוע ABCD', 'AB = 4', 'מרובע ACBD'], 'מרובע ACBD'],
    [['מקבילית ABCD', 'מרובע ACBD'], 'מרובע ACBD'],
    [['מעוין ABCD', 'מרובע ABDC'], 'מרובע ABDC'],
    [['טרפז ABCD', 'מרובע ACBD'], 'מרובע ACBD'],
    [['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABED'], 'מרובע ABED'],
    // the ring FIRST: the shape line that forces the crossing completed it, and is the one refused
    [['מרובע ABDC', 'מלבן ABCD'], 'מלבן ABCD'],
    [['טרפז ABDC', 'מלבן ABCD'], 'מלבן ABCD'],
  ])('%j → refused at «%s»', (lines, line) => {
    const r = play(lines);
    expect(r.kinds).toEqual([...recorded(lines), 'refused']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: line });
  });

  it('a saved list holding such a ring loads with the declaration row failed', () => {
    // the square's own recorded row is the template (since #1953, ADR-3D-324, a restated simple order adds no row)
    const facts = play(['ריבוע ABCD']).st.facts;
    const crossed: Fact3 = { ...facts[0], id: 'x', utterance: 'מרובע ACBD', cmds: [{ type: 'solid', kind: 'polygon4', ids: ['A', 'C', 'B', 'D'] }] };
    expect(derive3([facts[0], crossed], 0).status.x).toEqual({ code: 'ring-crossed', stated: 'מרובע ACBD' });
  });
});

describe('#1927 one ring is one cyclic order — the false reasons are gone', () => {
  it('«ריבוע ABCD · מקבילית ACBD» is no longer "a square is already a parallelogram" — its claim is refuted', () => {
    const r = play(['ריבוע ABCD', 'מקבילית ACBD']);
    expect(r.kinds).toEqual(['record', 'refused']);
    expect(r.error).not.toMatchObject({ code: 'shape-less-specific' });
    expect(r.error).toMatchObject({ code: 'claim-refuted' });
  });

  it('«ריבוע ABCD · ריבוע ACBD» is no longer accepted as a redundant restatement', () => {
    expect(play(['ריבוע ABCD', 'ריבוע ACBD']).kinds).toEqual(['record', 'refused']);
  });

  // since #1953 (ADR-3D-324) a ring the figure already declares, read from another vertex or reversed, is that
  // fact's restatement: «already stated», no second row — and never refused
  it.each([[['ריבוע ABCD', 'ריבוע ADCB']], [['ריבוע ABCD', 'ריבוע CDAB']]])(
    '%j — the same ring read from another vertex or reversed is still the same ring',
    (lines) => {
      expect(play(lines).kinds).toEqual(['record', 'already-stated']);
    },
  );
  it('["פירמידה SABCD","ריבוע ABCD"] — a face the solid placed is the same ring, recorded', () => {
    expect(play(['פירמידה SABCD', 'ריבוע ABCD']).kinds).toEqual(['record', 'record']);
  });
});

describe('#1927 controls and the ruled boundary', () => {
  it('["ריבוע ABCD","מרובע ADCB"] — the simple order is never refused; since #1953 it is the square restated', () => {
    expect(play(['ריבוע ABCD', 'מרובע ADCB']).kinds).toEqual(['record', 'already-stated']);
  });
  it.each([
    [['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABDE']],
    [['משולש ABC', 'מרובע ABCD']],
  ])('%j records, the ring simple', (lines) => {
    const r = play(lines);
    expect(r.kinds).toEqual(lines.map(() => 'record'));
  });

  /**
   * "Search first": a kite may be a DART, and on a dart ABDC is simple — the ruling names this row, and a valid drawing
   * exists, so it is never refused. 3-D draws only the convex branch, so it records as before; drawing the dart is
   * filed as a known gap (the parity row says the verdict, `builds`, is the same everywhere).
   */
  it.each([[['דלתון ABCD', 'מרובע ABDC']], [['מרובע ABCD', 'מרובע ABDC']]])('%j is never refused (a dart saves it)', (lines) => {
    expect(play(lines).kinds).toEqual(['record', 'record']);
  });

  it('ADR-3D-314’s coordinate rows are unchanged', () => {
    const r = play(['A(0,0,0)', 'B(4,0,0)', 'C(1,3,0)', 'D(3,3,0)', 'טרפז ABCD']);
    expect(r.error).toEqual({ code: 'ring-crossed', stated: 'טרפז ABCD' });
  });

  it('the refused figure really is crossed at the seed shown, and the control is not', () => {
    const facts = play(['ריבוע ABCD']).st.facts;
    const at = derive3([...facts, { ...facts[0], id: 'y', utterance: 'מרובע ACBD', cmds: [{ type: 'solid', kind: 'polygon4', ids: ['A', 'C', 'B', 'D'] }] }], 0).positions;
    expect(ringSelfCrossing3(['A', 'C', 'B', 'D'].map((id) => at.get(id)) as Vec3[])).toBe(true);
    expect(ringSelfCrossing3(['A', 'D', 'C', 'B'].map((id) => at.get(id)) as Vec3[])).toBe(false);
  });
});

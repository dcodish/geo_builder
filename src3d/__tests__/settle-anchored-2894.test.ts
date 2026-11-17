/**
 * #2894 part 2 A (ADR-3D-499) — THE ANCHORED SETTLE'S CORRECTIONS. The pivot's cold sweep used to creep toward each
 * seed's sample for 120 iterations and three polish restarts without arriving, so a value the givens fix came out a
 * hair different at each knowledge sample and was WITHHELD. The settle reaches the anchored point, the samples agree, and
 * the value is shown. The operator ruled these to be fixes (2026-11-15, #2894: "Ship, list them as fixes
 * (Recommended)"); each value below is fixed by the givens, proven in its comment.
 *
 * And the guard: where a given meets its solution set tangentially (a double root), the settle does not run, so the
 * exam cube's p = 0 stays known and its answer «A = (3, -4, 0)» stays accepted.
 *
 * pipeline-lock: the checks are values-panel rows and ask answers at chosen seeds, which a fixture walk does not assert.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const submit = (u: string) => st().submit(u);
const construction = () => derive3(st().facts, st().seed).construction;
const panel = () => dataView(construction(), st().seed);
const ask = (q: string) => answerQuery(construction(), q, st().seed);

describe('#2894 A — a value the givens fix is shown (ADR-3D-499)', () => {
  beforeEach(reset);

  it('«A(0,0,0)» · «AB = (1,2,3)»: B = A + (1,2,3) = (1, 2, 3), in the panel and in the ask (main withheld B)', () => {
    ['A(0,0,0)', // #1394: not a parity sequence
       'AB = (1,2,3)'].forEach(submit);
    expect(st().lastError).toBeNull();
    expect(panel().pointCoords.B).toEqual({ text: '(1, 2, 3)', kind: 'fact' });
    expect(ask('B').answer).toBe('(1, 2, 3)');
  });

  it('«K = (-3, 4, 6)» on an empty figure: every coordinate is stated (main read «K(-3, 4, ?)»)', () => {
    submit('K = (-3, 4, 6)');
    expect(panel().pointCoords.K).toEqual({ text: '(-3, 4, 6)', kind: 'fact' });
  });

  it('«A = (2, 0, -9)» on an empty figure: every coordinate is stated (main showed no row)', () => {
    submit('A = (2, 0, -9)');
    expect(panel().pointCoords.A).toEqual({ text: '(2, 0, -9)', kind: 'fact' });
  });

  it('«A(0,0,0)» · «AB=(2,0,0)» · «מישור ABCD» (the turning cube, its cube row deleted): B = (2, 0, 0) (main: «B(?, 0, 0)»)', () => {
    ["קובייה ABCDA'B'C'D'", // #1394: not a parity sequence
       'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABCD'].forEach(submit);
    expect(st().lastError).toBeNull();
    st().remove(st().facts[0].id);
    expect(st().facts.map((f) => f.utterance)).toEqual(['A(0,0,0)', // #1394: not a parity sequence
       'AB=(2,0,0)', 'מישור ABCD']);
    expect(panel().pointCoords.B).toEqual({ text: '(2, 0, 0)', kind: 'fact' });
  });

  it('«|AB| = k» · «|AD| = k» · «k = 3» (the box row deleted): both lengths are k = 3 (main: no relation row)', () => {
    ['|AB| = k', // #1394: not a parity sequence
       '|AD| = k', 'k = 3'].forEach(submit);
    expect(st().lastError).toBeNull();
    expect(panel().relations).toContain('|AB| = |AD| = 3');
  });

  it('«A(0,0,0)» · «נתון: AB = (k-1, k, 3), AC = (k+1, 0, k-3)»: z_B = 3 and y_C = 0 for every k, and BC = (2, -k, k-6) depends on k (main: no rows, «not determined»)', () => {
    ['A(0,0,0)', // #1394: not a parity sequence
       'נתון: AB = (k-1, k, 3), AC = (k+1, 0, k-3)'].forEach(submit);
    expect(st().lastError).toBeNull();
    const p = panel();
    expect(p.pointCoords.B).toEqual({ text: '(?, ?, 3)', kind: 'partial' });
    expect(p.pointCoords.C).toEqual({ text: '(?, 0, ?)', kind: 'partial' });
    expect(p.params.find((r) => r.sym === 'k')?.text).toBe('k = ?');
    const a = ask('BC');
    expect(a.note).toBe('depends');
    expect(a.param).toBe('k');
  });

  it("the #863 prism, a letter renamed: the prism is right, so AA' ⟂ AC: (k-1)(k+1) + (k+1)(k-3) = 2(k+1)(k-2) = 0, k = -1 or k = 2, under any letters (a lock: exact samples keep both roots through a rename)", () => {
    ["מנסרה ישרה משולשת ABCA'B'C'", // #1394: not a parity sequence
       "AA'=(k-1,k-7,k+1)", 'AC על הישר x=(8,-1,-1)+t(k+1,0,k-3)'].forEach(submit);
    expect(st().lastError).toBeNull();
    expect(panel().params.find((r) => r.sym === 'k')?.text).toBe('k = -1 או k = 2');
    expect(st().rename('A', 'D').ok).toBe(true);
    const p = panel();
    expect(p.params.find((r) => r.sym === 'k')?.text).toBe('k = -1 או k = 2');
    // the line's y is -1 for every t and k, so D and C, on it, have y = -1
    expect(p.points).toEqual(expect.arrayContaining(['D(?, -1, ?)', // #1394: not a parity sequence
       'C(?, -1, ?)']));
  });
});

describe('#2894 A2 — the 2020 prism exam, its prism row deleted: every value the givens state or derive is shown (ADR-3D-499)', () => {
  beforeEach(reset);

  it("K and P are stated, B = K + u and C = K + v, so KP = (3, 0, -1) and |KP| = √10 (main: «B(?, ?, 2)», «K(-3, 4, ?)», «P(?, 4, 6)», no vector coordinates)", () => {
    [
      'מנסרה ישרה משולשת ABC', // #1394: not a parity sequence
      
      "M אמצע B'C'",
      "K על AA' כך ש-AK = 2KA'",
      "נסמן: AA' = w, KC = v, KB = u",
      'P על AM כך ש-KP = αu + βv',
      'נתון: v = (10,-5,0), u = (5,5,-5), P(0,4,6)',
      'K = (-3, 4, 7)',
      'המישור KBC: x + 2y + 3z - 26 = 0',
    ].forEach(submit);
    expect(st().lastError).toBeNull();
    st().remove(st().facts[0].id);
    const p = panel();
    expect(p.points).toEqual(expect.arrayContaining(['B(2, 9, 2)', // #1394: not a parity sequence
       'C(7, -1, 7)', 'K(-3, 4, 7)', 'P(0, 4, 6)']));
    expect(p.vectors.map((v) => v.mag)).toContain('|KP| = √10');
  }, 120_000);
});

describe('#2894 A2 — exact samples never claim a value the givens leave open (ADR-3D-499)', () => {
  beforeEach(reset);

  it("#2368's control: the cube may stand on either side of the plane z = 0, so A′ reads «A'(0, 0, ?)» at every seed (the projection inside the search read «A'(0, 0, 2)» at these nine)", () => {
    ["קובייה ABCDA'B'C'D'", // #1394: not a parity sequence
       'A(0,0,0)', 'AB=(2,0,0)', 'מישור ABCD', 'מישור ABCD מקביל למישור xy'].forEach(submit);
    expect(st().lastError).toBeNull();
    for (const seed of [1, 3, 6, 9, 11, 14, 17, 19, 22]) {
      expect(dataView(derive3(st().facts, seed).construction, seed).points, `seed ${seed}`).toContain("A'(0, 0, ?)");
    }
  }, 120_000);
});

describe('#2894 A — the settle never runs off its solution set (ADR-3D-499)', () => {
  beforeEach(reset);

  it('the exam cube: «A(3,n,p)» with |DA| = |DC| = 5 forces p² = 0, a double root: p = 0 stays known and the answer stays accepted', () => {
    ['קובייה ABCD', // #1394: not a parity sequence
       "נסמן: AB = u, AD = v, AA' = w", 'D(0,0,0)', 'C(4,3,0)', 'A(3,n,p)', "שיעור ה-z של C' חיובי"].forEach(submit);
    expect(st().lastError).toBeNull();
    expect(panel().params.find((r) => r.sym === 'p')?.text).toBe('p = 0');
    submit('A = (3, -4, 0)');
    expect(st().lastError).toBeNull();
  });

  it('a settle step that would take a rider plane through three collinear points is not taken: the box-less «מישור ABCD» builds', () => {
    ['AB=(1,0,0)', // #1394: not a parity sequence
       'AD=(0,1,0)', "AA'=(0,0,2)", 'z_A=2', 'מישור ABCD', "מישור ABB'A'"].forEach((u) => expect(() => submit(u), u).not.toThrow());
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(6);
  });
});

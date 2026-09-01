/**
 * #862 (ADR-3D-205) — THE ANGLE'S ARM IS AN OPERAND KIND, NOT A SPELLING.
 *
 * `relationTable` declared `angle|segment|vector` **supported** with the note *"cos-angle with value
 * (V8-f)"*, and no utterance reached it — the one hollow row the #845 sweep found. The cause was not a
 * missing capability: the ⟂ twin over the identical operand kinds («AB מאונך ל-v») builds, and both
 * single-kind angle cells build. It was that the two value-form angle rules each spelled their own
 * operand shapes — `angleSegClaim` captured two point pairs, `cosAngleGiven` two `[a-w]` letters — so
 * the MIXED pair fell between them in both lanes.
 *
 * These lock the CELL and its neighbours: the mixed arm reaches the engine in every frame and both
 * locales, the two cells on either side keep their exact previous lowering, and a line/plane/point arm
 * still declines so the rules that own those cells keep them.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { useGeo3 } from '../store/store3';

const st = () => useGeo3.getState();
const cmds = (u: string) => {
  const r = parse3(u);
  expect(r.ok, u).toBe(true);
  return r.ok ? r.commands : [];
};
/** `פירמידה משולשת ABCD` + a declared vector on one edge — the #845 sweep's own setup. */
const build = (...lines: string[]) => {
  for (const l of ['פירמידה משולשת ABCD', 'נסמן: CD = v', ...lines]) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
};

describe('#862 — the mixed segment × vector arm', () => {
  beforeEach(() => st().clear());

  /** Every frame from the issue's measurement table, all five `not-understood` before the fix. */
  const FORMS = [
    'קוסינוס הזווית בין הוקטורים AB ו-v הוא 1/2',
    'קוסינוס הזווית בין הוקטורים v ו-AB הוא 1/2',
    'קוסינוס הזווית בין AB לבין v הוא 1/2',
    'הזווית בין AB לבין v היא 60',
    'הזווית בין הוקטורים AB ו-v היא 60',
  ];
  it.each(FORMS)('builds: %s', (f) => build(f));

  it.each([
    'the cosine of the angle between AB and v is 1/2',
    'the angle between AB and v is 60',
  ])('builds in English: %s', (f) => build(f));

  it('both operand ORDERS reach the same relation', () => {
    const a = cmds('קוסינוס הזווית בין הוקטורים AB ו-v הוא 1/2');
    const b = cmds('קוסינוס הזווית בין הוקטורים v ו-AB הוא 1/2');
    const rel = (cs: unknown[]) => cs.find((c) => (c as { type: string }).type === 'cos-angle');
    expect(rel(a)).toBeDefined();
    expect(rel(b)).toBeDefined();
  });

  it('the DEGREE frame and the COSINE frame state the SAME fact', () => {
    const deg = cmds('הזווית בין AB לבין v היא 60').find((c) => c.type === 'cos-angle');
    const cos = cmds('קוסינוס הזווית בין AB לבין v הוא 1/2').find((c) => c.type === 'cos-angle');
    expect(deg).toBeDefined();
    expect(cos).toBeDefined();
    expect((deg as { cos: number }).cos).toBeCloseTo((cos as { cos: number }).cos, 12);
  });

  it('the pair arm is DRAWN (the V1 convention), the vector arm is not re-declared', () => {
    expect(cmds('הזווית בין AB לבין v היא 60')).toEqual([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'cos-angle', u: { kind: 'pair', from: 'A', to: 'B' }, v: { kind: 'named', name: 'v' }, cos: Math.cos(Math.PI / 3) },
    ]);
  });
});

describe('#862 — the neighbouring cells are untouched', () => {
  beforeEach(() => st().clear());

  /** `angle|segment|segment` keeps the frozen `angle-seg-eq` claim, both segments drawn. */
  it('segment × segment still lowers to the angle-seg-eq CLAIM', () => {
    expect(cmds('הזווית בין AB לבין AC היא 60')).toEqual([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'segment3', a: 'A', b: 'C' },
      { type: 'claim', claim: { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'C', deg: 60 } },
    ]);
  });

  it("the exam's own noun-carrying wording is unchanged", () => {
    expect(cmds('גודל הזווית שבין הישר AB ובין הישר AM הוא 60')).toEqual([
      { type: 'segment3', a: 'A', b: 'B' },
      { type: 'segment3', a: 'A', b: 'M' },
      { type: 'claim', claim: { type: 'angle-seg-eq', a1: 'A', b1: 'B', a2: 'A', b2: 'M', deg: 60 } },
    ]);
  });

  it('vector × vector still lowers to cos-angle over two named atoms', () => {
    expect(cmds('קוסינוס הזווית בין הוקטורים u ו-w הוא 1/2')).toEqual([
      { type: 'cos-angle', u: { kind: 'named', name: 'u' }, v: { kind: 'named', name: 'w' }, cos: 0.5 },
    ]);
  });

  /**
   * The decline half — what keeps the widening from stealing another rule's cell. Each of these has an
   * owner that runs before or after `angleSegClaim`, and every one must still win it.
   */
  it('a LINE, PLANE or POINT arm still goes to the rule that owns that cell', () => {
    expect(parse3("הזווית בין הישר AC' לבין המישור ABCD היא 30").ok, 'segment × plane-run').toBe(true);
    expect(cmds("הזווית בין הישר AC' לבין המישור ABCD היא 30").some((c) => c.type === 'line-plane-angle')).toBe(true);
    expect(cmds('הזווית בין הישר l1 לבין המישור ABC היא 60').some((c) => c.type === 'line-rel')).toBe(true);
  });

  it('the ⟂ twin over the same operand kinds is unchanged', () => build('AB מאונך ל-v'));
});

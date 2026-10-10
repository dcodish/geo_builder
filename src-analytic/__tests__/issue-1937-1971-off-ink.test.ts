/**
 * #1937 + #1971 (ADR-AG-255, ADR-W-124) — THE DIAGONALS ARE LINES, AND AN OFF-INK POINT GETS ITS LINE EXTENDED.
 *
 * Measured at pickup (origin/main e0f4260c, `decideSubmit` → `derive`), on A(0,0) B(4,0) C(1,1) D(0,4):
 * - «אלכסוני המרובע נפגשים בנקודה O» was RECORDED with O never drawn — no fault, nothing unsatisfied;
 * - «O מפגש האלכסונים במרובע ABCD» was refused `does-not-exist`;
 * - «AE גובה» on the trapezoid A(0,0) B(6,0) C(5,3) D(1,3) put E at (0,3), off DC, with nothing joining it.
 *
 * The operator, 2026-10-09 (#1937): *"Lines, and show why … Draw O at (2,2) and extend both diagonals, dashed, out
 * to it"*; 2026-10-10 (#1971): *any construction point that lands off the drawn ink gets the carrying line
 * extended, dashed, to meet it.* Every lock calls the real submit gate and reads the scene the canvas paints.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { buildScene } from '../render/scene';

const CONCAVE = ['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(0,4)', 'מרובע ABCD'];
const CONVEX = ['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'מרובע ABCD'];

/** Each line through the real gate; the verdicts, and the figure the recorded lines draw. */
function play(lines: readonly string[]) {
  const prior: string[] = [];
  const verdicts: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, prior, 0);
    verdicts.push(v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
    if (v.kind === 'record') prior.push(v.line);
  }
  const d = derive(prior, 0);
  const pt = (id: string) => d.figure.points.find((p) => p.id === id);
  return { verdicts, d, pt, ext: d.figure.extensions ?? [] };
}
const near = (p: { x: number; y: number } | undefined, x: number, y: number) =>
  !!p && Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;

describe('#1937 — the operator’s concave quadrilateral: both spellings draw O at (2,2)', () => {
  it.each([
    ['the verb spelling (recorded with O missing before)', 'אלכסוני המרובע נפגשים בנקודה O'],
    ['the noun spelling (refused does-not-exist before)', 'O מפגש האלכסונים במרובע ABCD'],
  ])('%s', (_why, line) => {
    const { verdicts, d, pt, ext } = play([...CONCAVE, line]);
    expect(verdicts.at(-1)).toBe('record');
    expect(d.faults).toEqual([]);
    expect(near(pt('O'), 2, 2), 'O drawn where the diagonal LINES cross').toBe(true);
    // AC ends at C(1,1); O is twice along it → AC is extended, dashed, from C to O. BD already passes through O.
    expect(ext).toHaveLength(1);
    expect(near(ext[0].a, 1, 1) && near(ext[0].b, 2, 2), 'C → O').toBe(true);
  });

  it('the two spellings converge: the same verdict, the same O, the same dashed extension', () => {
    const verb = play([...CONCAVE, 'אלכסוני המרובע נפגשים בנקודה O']);
    const noun = play([...CONCAVE, 'O מפגש האלכסונים במרובע ABCD']);
    expect(noun.verdicts).toEqual(verb.verdicts);
    expect(noun.pt('O')).toEqual(verb.pt('O'));
    expect(noun.ext).toEqual(verb.ext);
    // Ruled 2026-10-10: outside the quadrilateral the noun spelling draws the two diagonals too — the same figure.
    expect(noun.d.figure.segments).toEqual(verb.d.figure.segments);
  });

  it('Ruled 2026-10-10: outside, BOTH spellings draw the solid diagonals AC and BD', () => {
    for (const line of ['אלכסוני המרובע נפגשים בנקודה O', 'O מפגש האלכסונים במרובע ABCD']) {
      const keys = play([...CONCAVE, line]).d.figure.segments.map((s) => [...s.ends].sort().join(''));
      expect(keys, line).toEqual(expect.arrayContaining(['AC', 'BD']));
      expect(keys.filter((k) => k === 'AC' || k === 'BD'), `${line}: each once`).toHaveLength(2);
    }
  });

  it('Ruled 2026-10-10: inside, #1751 stands — the noun spelling draws the point only, the verb spelling the diagonals', () => {
    const keys = (line: string) => play([...CONVEX, line]).d.figure.segments.map((s) => [...s.ends].sort().join(''));
    expect(keys('O מפגש האלכסונים במרובע ABCD')).not.toEqual(expect.arrayContaining(['AC']));
    expect(keys('O מפגש האלכסונים במרובע ABCD')).not.toEqual(expect.arrayContaining(['BD']));
    expect(keys('אלכסוני המרובע נפגשים בנקודה O')).toEqual(expect.arrayContaining(['AC', 'BD']));
  });

  it('the letter spellings agree with the role spellings', () => {
    for (const line of ['AC ו-BD נפגשים בנקודה O', 'O מפגש AC ו-BD']) {
      const { pt, ext } = play([...CONCAVE, line]);
      expect(near(pt('O'), 2, 2), line).toBe(true);
      expect(ext, line).toHaveLength(1);
    }
  });

  it('the canvas paints the extension (the scene carries it, projected)', () => {
    const { d } = play([...CONCAVE, 'אלכסוני המרובע נפגשים בנקודה O']);
    expect(buildScene(d.figure, d.box, 600, 400).extensions).toHaveLength(1);
  });

  it('a convex quadrilateral is unchanged: O inside, no extension, in both spellings', () => {
    for (const line of ['אלכסוני המרובע נפגשים בנקודה O', 'O מפגש האלכסונים במרובע ABCD']) {
      const { verdicts, pt, ext } = play([...CONVEX, line]);
      expect(verdicts.at(-1), line).toBe('record');
      expect(near(pt('O'), 2, 2), line).toBe(true);
      expect(ext, line).toEqual([]);
    }
  });
});

describe('#1937 — a figure that CAN cross its diagonals still opens crossed (the segment reading survives as a preference)', () => {
  it('the operator’s #1083 kite is drawn convex: O on both diagonals, no extension — as before the ruling', () => {
    const KITE = ['דלתון ABCD', 'DB', 'AC', 'משוואת האלכסון המשני היא y=-x+2', 'אלכסוני המרובע נפגשים בנקודה O', 'שטח משולש BCD גדול פי 3 משטח משולש ABD', 'AC=8√2', 'C ברביע השלישי', 'נקודה C על הישר y=2x+5'];
    const { d, pt, ext } = play(KITE);
    expect(d.faults).toEqual([]);
    expect(near(pt('C'), -5, -5), 'C where HEAD drew it').toBe(true);
    expect(ext).toEqual([]);
  });
});

describe('#1971 — a height’s foot beyond its side', () => {
  it('the round #1959 T20 trapezoid: E at (0,3), DC extended dashed from D(1,3) out to it', () => {
    const { verdicts, pt, ext } = play(['נקודה A(0,0)', 'נקודה B(6,0)', 'נקודה C(5,3)', 'נקודה D(1,3)', 'טרפז ABCD', 'AE גובה']);
    expect(verdicts.every((v) => v === 'record')).toBe(true);
    expect(near(pt('E'), 0, 3)).toBe(true);
    expect(ext).toHaveLength(1);
    expect(near(ext[0].a, 1, 3)).toBe(true);
    expect(Math.abs(ext[0].b.x) < 1e-6 && Math.abs(ext[0].b.y - 3) < 1e-6).toBe(true);
  });

  it('a foot ON its side is unchanged — no extension', () => {
    const { pt, ext } = play(['נקודה A(1,0)', 'נקודה B(6,0)', 'נקודה C(5,3)', 'נקודה D(0,3)', 'טרפז ABCD', 'AE גובה']);
    expect(near(pt('E'), 1, 3)).toBe(true);
    expect(ext).toEqual([]);
  });

  it('the class: an obtuse triangle’s height lands beyond B, and BC is extended out to it', () => {
    const { pt, ext } = play(['A(0,3)', 'B(2,0)', 'C(6,0)', 'משולש ABC', 'AD גובה לצלע BC']);
    expect(near(pt('D'), 0, 0)).toBe(true);
    expect(ext).toHaveLength(1);
    expect(near(ext[0].a, 2, 0)).toBe(true);
  });

  it('a point on a DRAWN line is on the ink already — nothing to extend', () => {
    const { ext } = play(['A(0,0)', 'B(2,0)', 'y=0', 'P(5,0)', 'P על הישר AB']);
    expect(ext).toEqual([]);
  });
});

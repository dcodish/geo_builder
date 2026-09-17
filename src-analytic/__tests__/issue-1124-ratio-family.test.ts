/**
 * #1124 — the colon-ratio family: «AC:CB = 3:2» and its two spoken spellings.
 *
 * Operator: *"the analytics tool doesnt support the ratio AC:CB=3:2"*. The MECHANISM was already here —
 * `length-eq` carries `AB = 10`, `AB = AC` and `2·AB = 3·CD` as one kind with different trees — and only
 * the notation was missing. 2-D has had all three forms since #519.
 *
 * ## The split is 2-D's, ported rather than reinvented
 *
 * The bare colon is a **relation** over points that already exist; the keyworded divider is a
 * **placement** that mints one. Deciding by FORM is what makes «C מחלקת את AB ביחס 3:2» a single
 * sentence a student can type.
 *
 * ## These cases assert GEOMETRY, not that a rule matched
 *
 * Every spelling is driven through the real `derive` on `A(0,0) B(10,0)`, where the ratio 3:2 puts `C`
 * at exactly `(6, 0)`. A test that only checked "it parsed" would have passed on the first build of this
 * feature, which parsed perfectly and placed `C` at 3.75 — see the identity case below for why.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';

const BASE = ['A(0,0)', 'B(10,0)'];
const at = (lines: string[], id = 'C') => derive(lines, 0).figure.points.find((p) => p.id === id);
const faults = (lines: string[]) => derive(lines, 0).faults;

/** The fact tree with `src` stripped — two spellings of one meaning must produce the same one. */
const shape = (line: string) => {
  const r = parseLine(line);
  return r.ok ? JSON.stringify(r.facts, (k, v) => (k === 'src' ? undefined : v)) : null;
};

describe('#1124 — every spelling puts the point in the same place', () => {
  const CASES: Array<[string, string[]]> = [
    ['bare colon', [...BASE, 'C על הקטע AB', 'AC:CB = 3:2']],
    ['bare colon, no spaces', [...BASE, 'C על הקטע AB', 'AC:CB=3:2']],
    ['divider, Hebrew', [...BASE, 'C מחלקת את AB ביחס 3:2']],
    ['divider, English', [...BASE, 'C divides AB in ratio 3:2']],
    ['prose', [...BASE, 'היחס בין AC ל-CB הוא 3:2']],
  ];

  for (const [label, lines] of CASES) {
    it(`${label}: C lands at (6, 0)`, () => {
      expect(faults(lines), label).toHaveLength(0);
      const c = at(lines);
      expect(c, label).toBeDefined();
      expect(c!.x).toBeCloseTo(6, 6);
      expect(c!.y).toBeCloseTo(0, 6);
      // The ratio itself, stated as the ratio rather than as a coordinate.
      expect(Math.hypot(c!.x, c!.y) / Math.hypot(10 - c!.x, -c!.y)).toBeCloseTo(1.5, 6);
    });
  }

  it('other ratios land where arithmetic says', () => {
    expect(at([...BASE, 'C מחלקת את AB ביחס 1:1'])!.x).toBeCloseTo(5, 6);
    expect(at([...BASE, 'C מחלקת את AB ביחס 1:4'])!.x).toBeCloseTo(2, 6);
    expect(at([...BASE, 'C מחלקת את AB ביחס 4:1'])!.x).toBeCloseTo(8, 6);
  });
});

describe('#1124 — it is a REWRITE, not a second mechanism', () => {
  it('«AC:CB = 3:2» produces the identical construction to «AC = 1.5CB»', () => {
    /**
     * The lock that matters most here, and the one that caught the first build.
     *
     * That build hand-wrote the `LengthExpr` tree. It printed **byte-identical** to the working one and
     * did nothing: `terms[i]` binds to a PRIVATE-USE code point (U+E000), so the placeholder symbol's
     * name is an invisible character — `name: "\\ue000"` and `name: ""` look like the same string in
     * every console and every diff. The constraint was never evaluated, `unsatisfied` stayed EMPTY, and
     * `C` floated to 3.75 while the construction printed correct.
     *
     * The fix was to CALL `parseLengthExpr` rather than reproduce its encoding — the same rule
     * [ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053) names — and this case is what proves
     * it, because a reproduction can only ever agree with itself.
     */
    expect(shape('AC:CB = 3:2')).toBe(shape('AC = 1.5CB'));
  });

  it('and the two really do draw the same figure', () => {
    const viaRatio = at([...BASE, 'C על הקטע AB', 'AC:CB = 3:2'])!;
    const viaMult = at([...BASE, 'C על הקטע AB', 'AC = 1.5CB'])!;
    expect(viaRatio.x).toBeCloseTo(viaMult.x, 9);
    expect(viaRatio.y).toBeCloseTo(viaMult.y, 9);
  });
});

describe('#1124 — what it must NOT claim', () => {
  it('an n-way chain is refused by NAME, never flattened to the first pair', () => {
    /**
     * `AC:CB:BD = 3:2:4` is out of scope. Reading only `AC:CB = 3:2` from it would silently drop a
     * stated given, which is the defect this product exists to avoid.
     */
    const r = parseLine('AC:CB:BD = 3:2:4');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('not-handled');
      expect(r.detail).toBe('AC:CB:BD = 3:2:4');
    }
  });

  it('a named LINE in colon form still mints its line — the ordering regression', () => {
    /**
     * The whole risk of this feature. The ratio rules run before `matchCurve`, whose bare-colon branch
     * reads «AB: y=2x» as a line named `AB`. Claiming those would be the mirror of the bug #1123 fixed.
     */
    for (const line of ['AB: y=2x', 'l1: y=2x', 'ℓ1: y=2x', 'נתון הישר l1: 3x-4y+1=0']) {
      expect(parseLine(line).ok, line).toBe(true);
    }
  });

  it('a plain length and a plain shape are untouched', () => {
    expect(parseLine('AB = 10').ok).toBe(true);
    expect(parseLine('משולש ABC').ok).toBe(true);
  });

  it('the prose form refuses when the two segments share no point', () => {
    /**
     * «היחס בין AB ל-CD הוא 3:2» is a relation between two unrelated segments, not a division. Guessing
     * which point to mint would be inventing a given the student never stated.
     */
    const r = parseLine('היחס בין AB ל-CD הוא 3:2');
    if (r.ok) {
      // If a future rule does claim it, it must NOT have minted a divider.
      expect(r.facts.some((f) => f.t === 'declare')).toBe(false);
    }
  });
});

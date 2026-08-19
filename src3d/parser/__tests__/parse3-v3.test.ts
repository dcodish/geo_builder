/**
 * V3 parser tests — parameters in lines (2024-Q2): typed parametric lines,
 * parenthesised plane coefficients, the ⟂ given, the cut point, the
 * never-parallel probe, coordinate claims, and on-line membership.
 */

import { describe, expect, it } from 'vitest';
import { parse3, parseParamExpr } from '../parse3';

const cmds = (input: string) => {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  return r.ok ? r.commands : [];
};

describe('parseParamExpr', () => {
  it('components with and without the parameter', () => {
    expect(parseParamExpr('m-1')).toEqual({ expr: { k: -1, p: 1 }, param: 'm' });
    expect(parseParamExpr('5-m')).toEqual({ expr: { k: 5, p: -1 }, param: 'm' });
    expect(parseParamExpr('-2')).toEqual({ expr: { k: -2, p: 0 }, param: undefined });
    expect(parseParamExpr('2m')).toEqual({ expr: { k: 0, p: 2 }, param: 'm' });
    expect(parseParamExpr('m+6')).toEqual({ expr: { k: 6, p: 1 }, param: 'm' });
    expect(parseParamExpr('hello')).toBeNull();
    expect(parseParamExpr('m+n')).toBeNull(); // two letters — refused
  });
});

describe('typed parametric line', () => {
  it('lowers to LinExpr triples, Hebrew and English', () => {
    for (const input of ['הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)', 'line ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)']) {
      expect(cmds(input)).toEqual([
        {
          type: 'line3',
          name: 'ℓ',
          anchor: [{ k: -1, p: 0 }, { k: 5, p: 0 }, { k: -11, p: 0 }],
          dir: [{ k: -1, p: 1 }, { k: 5, p: -1 }, { k: -2, p: 0 }],
          src: 'x = (-1,5,-11) + t·(m-1, 5-m, -2)',
          param: 'm',
        },
      ]);
    }
  });
  it('a parameter-free line parses too', () => {
    expect(cmds('l: x = (0,0,0) + t(1,0,0)')[0]).toMatchObject({ type: 'line3', param: undefined });
  });
});

describe('parenthesised plane coefficients', () => {
  it('(m+6)z folds into the z coefficient; the bare π name canonicalises', () => {
    expect(cmds('המישור π: 3x + my + (m+6)z + 4 = 0')).toEqual([
      {
        type: 'plane3',
        name: 'π',
        plane: {
          cx: { k: 3, p: 0 },
          cy: { k: 0, p: 1 },
          cz: { k: 6, p: 1 },
          d: { k: 4, p: 0 },
          src: '3x + my + (m+6)z + 4 = 0',
        },
        param: 'm',
      },
    ]);
  });
  it('mismatched parameters inside parentheses refuse', () => {
    expect(parse3('המישור π: (n+1)x + my = 0')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('V3 relations and constructions', () => {
  it('line ⟂ plane (a pinning given)', () => {
    expect(cmds('הישר ℓ ניצב למישור π')).toEqual([{ type: 'line-perp-plane', line: 'ℓ', plane: 'π' }]);
    expect(cmds('line ℓ is perpendicular to plane π')).toEqual([{ type: 'line-perp-plane', line: 'ℓ', plane: 'π' }]);
  });
  it('the cut point', () => {
    expect(cmds('ℓ חותך את π בנקודה A')).toEqual([{ type: 'line-plane-point', id: 'A', line: 'ℓ', plane: 'π' }]);
    expect(cmds('ℓ cuts plane π at A')).toEqual([{ type: 'line-plane-point', id: 'A', line: 'ℓ', plane: 'π' }]);
  });
  it('the never-parallel probe (a claim)', () => {
    expect(cmds('ℓ אינו מקביל ל-π לכל m')).toEqual([{ type: 'claim', claim: { type: 'never-parallel', line: 'ℓ', plane: 'π' } }]);
    expect(cmds('ℓ is not parallel to plane π for every m')).toEqual([
      { type: 'claim', claim: { type: 'never-parallel', line: 'ℓ', plane: 'π' } },
    ]);
  });
  it('coordinate claims and on-line membership', () => {
    expect(cmds('A = (2, 0, -10)')).toEqual([{ type: 'claim', claim: { type: 'coords-eq', id: 'A', x: 2, y: 0, z: -10 } }]);
    expect(cmds('B(5,-5,-9) על הישר ℓ')).toEqual([
      { type: 'point3', id: 'B', x: 5, y: -5, z: -9 },
      { type: 'on-line', id: 'B', line: 'ℓ' },
    ]);
    expect(cmds('B is on line ℓ')).toEqual([{ type: 'on-line', id: 'B', line: 'ℓ' }]);
  });
});

/**
 * #640 — the parametric-line HEAD. The rule spelled its noun gate and its separator inline: only the
 * ARTICLED «הישר» and only a literal «:», so «ישר l x=…» — the form the exam prints and the operator
 * typed in prod — reached the paid LLM lane while «הישר l: …» parsed. The head is now read by the
 * shared `matchDefHead`/`defBody` pair, so the article, the noun and the separator are one tolerance
 * for every rule of this shape.
 *
 * The assertion that matters is DETERMINISM, not "it builds": every cell must come back from `parse3`
 * itself. A form that reaches the LLM lane and returns the right answer is the failure being fixed.
 */
describe('#640 — the article × separator matrix, one line3 command', () => {
  const NUMERIC = 'x=(1,2,3)+t(2,3,4)';
  const SYMBOLIC = 'x=(-1,5,-11)+t(m-1,5-m,-2)';
  const HEADS = ['הישר l:', 'ישר l:', 'l:', 'line l:', 'הישר l -', 'ישר l -', 'line l -', 'הישר l', 'ישר l', 'line l'];

  it('every head reaches the same command, numeric components', () => {
    const expected = cmds(`הישר l: ${NUMERIC}`);
    expect(expected[0]).toMatchObject({ type: 'line3', name: 'ℓ' });
    for (const h of HEADS) expect(cmds(`${h} ${NUMERIC}`), h).toEqual(expected);
  });

  it('every head reaches the same command, SYMBOLIC components (the #504 premise)', () => {
    const expected = cmds(`הישר l: ${SYMBOLIC}`);
    expect(expected[0]).toMatchObject({ type: 'line3', param: 'm' });
    for (const h of HEADS) expect(cmds(`${h} ${SYMBOLIC}`), h).toEqual(expected);
  });

  it("the operator's prod utterances parse DETERMINISTICALLY — no escalation", () => {
    for (const u of [
      'ישר l x=(-1,5,-11)+t(m-1,5-m,-2)', // #640, bagrut 35582 חורף תשפ"ד Q2
      'הישר l - x=(1,2,3)+t(m+2,m,m-2)', // #504
      'l1:x=t(0,m,2m-2)', // #351/#504 — anchor-less, glued head
    ]) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
    }
  });

  it('a head with no BODY is still the free-line declaration, not a parametric line', () => {
    expect(cmds('ישר l')).toEqual([{ type: 'free-line', name: 'ℓ' }]);
    expect(cmds('הישר l')).toEqual([{ type: 'free-line', name: 'ℓ' }]);
  });
});

/**
 * The same head, plane edition — and the defect the matrix uncovered. `planeByEquation` was never
 * "tolerant" of the dash separator: the dash fell INTO the equation and became a unary minus, so
 * «מישור π1 - x+…=0» silently built «-x+…=0» — a different plane from the one the student wrote, echoed
 * back in the panel as their own words. One reader for the head fixes the reading, not just the match.
 */
describe('#640/#504 — the plane head reads the separator, not a sign', () => {
  const EQ = 'x+(m-2)y+(m-1)z-5=0';
  const plane = (u: string) => {
    const c = cmds(u);
    expect(c[0].type, u).toBe('plane3');
    return c[0] as Extract<(typeof c)[number], { type: 'plane3' }>;
  };

  it('a SPACED dash after the name is a separator — the coefficient keeps its sign', () => {
    const colon = plane(`מישור π1: ${EQ}`);
    expect(colon.plane.cx).toEqual({ k: 1, p: 0 });
    for (const u of [`מישור π1 - ${EQ}`, `מישור π1 ${EQ}`, `המישור π1: ${EQ}`, `plane π1 - ${EQ}`])
      expect(plane(u).plane, u).toEqual(colon.plane);
  });

  it("a GLUED minus is still the student's sign", () => {
    expect(plane('מישור π1: -x+2y+3z-5=0').plane.cx).toEqual({ k: -1, p: 0 });
    expect(plane('מישור π1 -x+2y+3z-5=0').plane.cx).toEqual({ k: -1, p: 0 });
  });

  it('#504 — the equation may be stated with «= 0» left off', () => {
    expect(plane(`מישור π1 - x+(m-2)y+(m-1)z-5`).plane).toEqual(plane(`מישור π1: ${EQ}`).plane);
  });

  it('the neighbours it must never steal', () => {
    expect(cmds('מישור ABC')).toEqual([{ type: 'plane-through', name: 'ABC', ids: ['A', 'B', 'C'] }]);
    expect(cmds('מישור π2')).toEqual([{ type: 'free-plane', name: 'π2' }]);
    expect(cmds('המישור x-y+z=1')[0]).toMatchObject({ type: 'plane3', name: 'π' });
  });
});

/**
 * The CLASS, not the instance (#640 fix plan step 1): every rule that spelled the line noun without its
 * article now reads the shared token. These are the sites the audit pass found.
 */
describe('#640 — the noun gate is optional-article everywhere it is spelled', () => {
  it('line ⟂ plane, with and without the article', () => {
    const expected = [{ type: 'line-perp-plane', line: 'ℓ', plane: 'π' }];
    expect(cmds('הישר ℓ ניצב למישור π')).toEqual(expected);
    expect(cmds('ישר ℓ ניצב למישור π')).toEqual(expected);
  });
  it('the never-parallel probe, with and without the article', () => {
    const expected = [{ type: 'claim', claim: { type: 'never-parallel', line: 'ℓ', plane: 'π' } }];
    expect(cmds('הישר ℓ אינו מקביל ל-π לכל m')).toEqual(expected);
    expect(cmds('ישר ℓ אינו מקביל למישור π לכל m')).toEqual(expected);
  });
});

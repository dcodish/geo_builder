/**
 * #859 — «אלכסון» must be SURE the pair is a diagonal.
 *
 * Operator ruling 2026-09-01: *"the term אלכסון should be sure to be a diagonal and this is true for all
 * tools. if the word is used."* And, on the mitigation they first proposed (a message on every use of
 * the word): *"we should not do the אלכסון thing i proposed but we need to fix it correctly to support
 * it."*
 *
 * The word was decoration. On a cube, «אלכסון AB» drew an EDGE and called it a diagonal; «אלכסון ראשי
 * AC» drew a FACE diagonal and called it a main one. Both silent, both a green ✓ — a *silent-wrong-ink*
 * class, which never appears in the logs as a failure, so only reading the code or the figure finds it.
 *
 * Two claim levels, checked at APPLY (the parser is context-free and cannot see the figure):
 *   - `any`   — a bare «אלכסון AC»: face or space, never an edge.
 *   - `space` — «ראשי» / «המרחב» / «תיבה» / «קובייה», and space|body|main: through the solid.
 *
 * The guard matters as much as the check: it fires only with a SINGLE solid whose ids contain both
 * letters. "I cannot tell" must not become a refusal.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeo3 } from '../store/store3';
import { faceDiagonals, spaceDiagonals, isAnyDiagonal, isSpaceDiagonal } from '../engine/baseShapes';

const st = () => useGeo3.getState();
const build = (lines: string[]) => {
  st().clear();
  for (const l of lines) st().submit(l);
  return st().lastError;
};
const CUBE = ['קובייה ABCD'];

describe('#859 — the derivations, from the rings', () => {
  const box = [
    ['A', 'B', 'C', 'D'],
    ["A'", "B'", "C'", "D'"],
    ['A', 'B', "B'", "A'"],
  ];

  it('a quad ring yields its two crossing pairs, and NO edges', () => {
    const d = faceDiagonals([['A', 'B', 'C', 'D']]).map(([a, b]) => a + b);
    expect(d.sort()).toEqual(['AC', 'BD']);
  });

  it('a TRIANGLE ring has no face diagonals — correct, not a gap', () => {
    expect(faceDiagonals([['A', 'B', 'C']])).toEqual([]);
  });

  it('an edge is neither a face nor a space diagonal', () => {
    expect(isAnyDiagonal(box, 'A', 'B')).toBe(false);
    expect(isSpaceDiagonal(box, 'A', 'B')).toBe(false);
  });

  it('a FACE diagonal is `any` but not `space` — the distinction the ruling turns on', () => {
    expect(isAnyDiagonal(box, 'A', 'C')).toBe(true);
    expect(isSpaceDiagonal(box, 'A', 'C')).toBe(false);
  });

  it('a SPACE diagonal is both', () => {
    expect(isAnyDiagonal(box, 'A', "C'")).toBe(true);
    expect(isSpaceDiagonal(box, 'A', "C'")).toBe(true);
    expect(spaceDiagonals(box).map(([a, b]) => a + b)).toEqual(['AC\'', 'BD\'', 'CA\'', 'DB\'']);
  });
});

describe('#859 — a wrong pair is REFUSED BY NAME', () => {
  beforeEach(() => st().clear());

  it('«אלכסון AB» — an EDGE — is refused, naming the pair (was: drawn, green ✓)', () => {
    const err = build([...CUBE, 'אלכסון AB']);
    expect(err).toMatchObject({ code: 'not-a-diagonal', a: 'A', b: 'B', kind: 'any' });
  });

  it('«אלכסון ראשי AC» — a FACE diagonal — is refused as not a MAIN one (the reported case)', () => {
    const err = build([...CUBE, 'אלכסון ראשי AC']);
    expect(err).toMatchObject({ code: 'not-a-diagonal', a: 'A', b: 'C', kind: 'space' });
  });

  it('the solid-qualified forms claim SPACE too — «אלכסון תיבה AB» is refused', () => {
    expect(build([...CUBE, 'אלכסון תיבה AB'])).toMatchObject({ kind: 'space' });
  });

  it('the English forms are held to the same claim', () => {
    expect(build([...CUBE, 'diagonal AB'])).toMatchObject({ code: 'not-a-diagonal', kind: 'any' });
    expect(build([...CUBE, 'main diagonal AC'])).toMatchObject({ code: 'not-a-diagonal', kind: 'space' });
  });
});

describe('#859 — everything correct still builds', () => {
  beforeEach(() => st().clear());

  it.each([
    ['אלכסון AC', 'a face diagonal'],
    ["אלכסון AC'", 'a space diagonal'],
    ["אלכסון ראשי AC'", 'the role-qualified space diagonal'],
    ["אלכסון תיבה AC'", 'the solid-qualified space diagonal'],
    ['אלכסון BD', 'the other base diagonal'],
  ])('%s builds (%s)', (line) => {
    expect(build([...CUBE, line])).toBeNull();
  });

  it('«קטע AB» claims nothing about the pair, so nothing is checked — an EDGE still draws', () => {
    // the point of the `diagonal` field being optional: only the word «אלכסון» makes a claim
    expect(build([...CUBE, 'קטע AB'])).toBeNull();
  });

  it('a PYRAMID has no space diagonal, so its qualifiers stay at the weaker `any` claim', () => {
    // demanding `space` here would refuse the face diagonal the student legitimately drew
    expect(build(['פירמידה ישרה מרובעת', 'אלכסון AC'])).toBeNull();
  });
});

describe('#859 — the guard: "I cannot tell" is never a refusal', () => {
  beforeEach(() => st().clear());

  it('with NO solid, the diagonal CHECK stands down (any refusal comes from elsewhere)', () => {
    // On an empty figure «אלכסון AB» still refuses — with both letters undefined the bare-segment rule
    // mints nothing (#840 needs one known endpoint). That is pre-existing and unrelated: what this test
    // pins is that the refusal is NOT ours, i.e. the check never fires without a solid to check against.
    const err = build(['אלכסון AB']) as { code?: string } | null;
    expect(err?.code).not.toBe('not-a-diagonal');
  });

  it('with TWO solids, the check stands down rather than guessing which rings to use', () => {
    expect(build(['קובייה ABCD', "קובייה EFGHE'F'G'H'", 'אלכסון AB'])).toBeNull();
  });

  it('a pair reaching a point OUTSIDE the solid is not checked', () => {
    expect(build([...CUBE, "M אמצע BB'", 'אלכסון AM'])).toBeNull();
  });
});

describe('#859 — the PAIR-FIRST order, which the operator typed', () => {
  beforeEach(() => st().clear());

  it("«AC' אלכסון ראשי» builds, exactly as the noun-first spelling does", () => {
    expect(build([...CUBE, "AC' אלכסון ראשי"])).toBeNull();
  });

  it('«AC אלכסון» builds', () => {
    expect(build([...CUBE, 'AC אלכסון'])).toBeNull();
  });

  it('…and the CLAIM travels with it — «AB אלכסון ראשי» is still refused', () => {
    expect(build([...CUBE, 'AB אלכסון ראשי'])).toMatchObject({ code: 'not-a-diagonal', kind: 'space' });
  });
});

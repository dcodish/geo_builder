/**
 * Regression locks for the 2026-07-03 Fable review of the hardening phases (findings P1–P8) —
 * each `it` names the finding it pins. All were CONFIRMED by execution before fixing; see
 * docs/06-decisions.md (ADR-203) for the root causes.
 */
import { describe, expect, it } from 'vitest';
import { parse, parseRename, parseSwap } from '../parse';
import type { AnyCommand } from '@/engine';

const ctxO = { circles: ['O'], points: ['A', 'B', 'C', 'D'] };

const cmds = (r: ReturnType<typeof parse>): AnyCommand[] => (r.ok ? r.commands : []);
const types = (r: ReturnType<typeof parse>): string[] => cmds(r).map((c) => c.type);
const onCircle = (r: ReturnType<typeof parse>): string[] =>
  cmds(r).flatMap((c) => (c.type === 'point-on-circle' ? [c.id] : []));

describe('P1 — the DIAMETER pair (not the first-named pair) is forced through the centre', () => {
  it('chord named FIRST: "המיתר CD מאונך לקוטר AB" → set-collinear A,O,B (not C,O,D)', () => {
    const r = parse('המיתר CD מאונך לקוטר AB', ctxO);
    expect(r.ok).toBe(true);
    const col = cmds(r).find((c) => c.type === 'set-collinear');
    expect(col && col.type === 'set-collinear' ? [col.a, col.c].sort() : null).toEqual(['A', 'B']);
    expect(col && col.type === 'set-collinear' ? col.b : null).toBe('O');
    // both segments are chords of O (a diameter is a chord), so all four endpoints are members
    expect(onCircle(r).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('diameter named first still works: "הקוטר AB מאונך למיתר CD"', () => {
    const r = parse('הקוטר AB מאונך למיתר CD', ctxO);
    const col = cmds(r).find((c) => c.type === 'set-collinear');
    expect(col && col.type === 'set-collinear' ? [col.a, col.c].sort() : null).toEqual(['A', 'B']);
  });

  it('English: "chord CD is perpendicular to diameter AB" → A,O,B collinear', () => {
    const r = parse('chord CD is perpendicular to diameter AB', ctxO);
    const col = cmds(r).find((c) => c.type === 'set-collinear');
    expect(col && col.type === 'set-collinear' ? [col.a, col.c].sort() : null).toEqual(['A', 'B']);
  });

  it('a diameter ⟂ a NON-chord segment with an ambiguous text pair does not force the wrong segment', () => {
    // "הקוטר AB מאונך ל-CD" — only AB is adjacent to the noun; CD must NOT get membership/collinearity.
    const r = parse('הקוטר AB מאונך ל-CD', ctxO);
    expect(onCircle(r).sort()).toEqual(['A', 'B']);
    const col = cmds(r).find((c) => c.type === 'set-collinear');
    expect(col && col.type === 'set-collinear' ? [col.a, col.c].sort() : null).toEqual(['A', 'B']);
  });
});

describe('P2 — the angle word + the ∠ glyph together are ONE angle reference', () => {
  it('"זווית ∠ABC = 40" parses deterministically (was regressed to the LLM)', () => {
    const r = parse('זווית ∠ABC = 40');
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('set-angle');
  });

  it('"the angle ∠BAC = 50" parses too', () => {
    const r = parse('the angle ∠BAC = 50');
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('set-angle');
  });

  it('two genuinely separate angles still split (multiStatement) — both givens kept', () => {
    const r = parse('זווית ABC = 40, זווית DEF = 60');
    expect(r.ok).toBe(true);
    expect(cmds(r).filter((c) => c.type === 'set-angle')).toHaveLength(2);
  });
});

describe('P3 — a word-form relation on a chord never HALF-parses (bail → escalate honestly)', () => {
  it('"המיתר AB שווה למיתר CD" does not half-parse to a bare chord AB', () => {
    const r = parse('המיתר AB שווה למיתר CD', ctxO);
    // word equality is out of grammar (operator decision) — the honest outcome is escalation,
    // NOT a silent [on-circle A, on-circle B, segment AB] that drops the equality and CD.
    expect(r.ok).toBe(false);
  });

  it('"chord AB equals chord CD" does not half-parse either', () => {
    expect(parse('chord AB equals chord CD', ctxO).ok).toBe(false);
  });
});

describe('P4 — noun-repeated symbol relations parse deterministically with membership', () => {
  it('"מיתר AB = מיתר CD" → set-equal + all four endpoints on the circle', () => {
    const r = parse('מיתר AB = מיתר CD', ctxO);
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('set-equal');
    expect(onCircle(r).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('"chord AB = chord CD" (English) too', () => {
    const r = parse('chord AB = chord CD', ctxO);
    expect(types(r)).toContain('set-equal');
    expect(onCircle(r).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('"מיתר AB > מיתר CD" → length order + membership', () => {
    const r = parse('מיתר AB > מיתר CD', ctxO);
    expect(types(r)).toContain('set-length-order');
    expect(onCircle(r).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('"קוטר AB = מיתר CD" → equality + membership + the DIAMETER (AB) through the centre', () => {
    const r = parse('קוטר AB = מיתר CD', ctxO);
    expect(types(r)).toContain('set-equal');
    const col = cmds(r).find((c) => c.type === 'set-collinear');
    expect(col && col.type === 'set-collinear' ? [col.a, col.c].sort() : null).toEqual(['A', 'B']);
  });

  it('control: "מיתר AB = 6" still parses (membership + set-distance)', () => {
    const r = parse('מיתר AB = 6', ctxO);
    expect(types(r)).toContain('set-distance');
    expect(onCircle(r).sort()).toEqual(['A', 'B']);
  });
});

describe('P5 — a chords-MEET utterance keeps its circle membership', () => {
  it('"chords AC and BD meet at E" → all four endpoints on circle O + the crossing', () => {
    const r = parse('chords AC and BD meet at E', ctxO);
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('line-line-intersection');
    expect(onCircle(r).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('control: "the diameter from F cuts AC at E" (centre-anchored line) does NOT get double membership', () => {
    const r = parse('קוטר המעגל היוצא מנקודה F חותך את AC בנקודה E', { circles: ['O'], points: ['A', 'C', 'F'] });
    expect(r.ok).toBe(true);
    // the winner anchors its line to the centre O — the post-pass must bail, adding NO point-on-circle
    expect(onCircle(r)).toEqual([]);
  });
});

describe('P6 — the bare Hebrew conjunction ו joins two givens (both kept)', () => {
  for (const utt of ['AB = 4 ו-BC = 6', 'AB = 4 ו BC = 6', 'AB = 4 וBC = 6']) {
    it(`"${utt}" produces BOTH set-distance givens`, () => {
      const r = parse(utt);
      expect(r.ok).toBe(true);
      const ds = cmds(r).filter((c) => c.type === 'set-distance');
      expect(ds).toHaveLength(2);
    });
  }

  it('control: a construction phrase with ו is untouched ("CD ו AF מיתרים המקבילים זה לזה")', () => {
    // the ADR-119 parallel-chords sentence: pieces are not standalone relations, so no split
    const r = parse('CD ו AF מיתרים המקבילים זה לזה', { circles: ['O'], points: [] });
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('set-parallel');
    expect(onCircle(r).sort()).toEqual(['A', 'C', 'D', 'F']);
  });
});

describe('P7 — rename/swap tolerate pasted orthography (maqaf, bidi controls)', () => {
  it('swap with a MAQAF connector ("החלף בין C ל־D") is recognised', () => {
    expect(parseSwap('החלף בין C ל־D')).toEqual({ a: 'C', b: 'D' });
  });

  it('rename with a MAQAF connector ("שנה שם E ל־G") is recognised', () => {
    expect(parseRename('שנה שם E ל־G')).toEqual({ from: 'E', to: 'G' });
  });

  it('control: the ASCII-hyphen forms still work', () => {
    expect(parseSwap('החלף בין C ל-D')).toEqual({ a: 'C', b: 'D' });
    expect(parseRename('rename E to G')).toEqual({ from: 'E', to: 'G' });
  });
});

describe('P8 — plural/definite perpendicular-bisector forms', () => {
  it('"האנכים האמצעיים של AB ו-CD" → one ⊥-bisector per segment, NO bogus AB ⟂ CD', () => {
    const r = parse('האנכים האמצעיים של AB ו-CD');
    expect(r.ok).toBe(true);
    expect(types(r)).not.toContain('set-perpendicular'); // the hijack asserted a relation never stated
    expect(cmds(r).filter((c) => c.type === 'midpoint')).toHaveLength(2);
    expect(cmds(r).filter((c) => c.type === 'perpendicular-line')).toHaveLength(2);
  });

  it('definite singular "האנך האמצעי של AB" now parses', () => {
    const r = parse('האנך האמצעי של AB');
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('perpendicular-line');
  });

  it('control: the plain singular "אנך אמצעי ל-AB" is unchanged', () => {
    const r = parse('אנך אמצעי ל-AB');
    expect(r.ok).toBe(true);
    expect(types(r)).toContain('midpoint');
    expect(types(r)).toContain('perpendicular-line');
  });
});

/**
 * #417 / ADR-415 — the collinearity family reads its noun on EITHER side of the labels.
 *
 * Order-independence is this grammar's house convention: the polygon family, the midsegment and the chord
 * all strip their noun wherever it stands and then read the label run. The collinearity family alone
 * demanded noun-first, so «GFH ישר» — a register a student naturally types (operator, play session
 * 2026-07-29) — fell through to the paid LLM although the deterministic rule could read it.
 *
 * The parity assertion at the bottom is the real lock: it fails if any future rule reintroduces a rigid
 * order in this family.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine/types';

const cmds = (u: string): AnyCommand[] => {
  const r = parse(u);
  expect(r.ok, `«${u}» parses deterministically`).toBe(true);
  return r.ok ? r.commands : [];
};

const setLine = (u: string): string[] => {
  const c = cmds(u).find((x) => x.type === 'set-line');
  expect(c, `«${u}» lowers to a set-line`).toBeTruthy();
  return (c as Extract<AnyCommand, { type: 'set-line' }>).points;
};

describe('#417 — collinearity noun order', () => {
  it('the reported form: «GFH ישר» reads like «ישר GFH»', () => {
    expect(setLine('GFH ישר')).toEqual(['G', 'F', 'H']);
    expect(setLine('ישר GFH')).toEqual(['G', 'F', 'H']);
  });

  it('the definite article and the קו synonym, both sides', () => {
    for (const u of ['הישר GFH', 'GFH הישר', 'קו GFH', 'GFH קו', 'הקו GFH']) {
      expect(setLine(u), u).toEqual(['G', 'F', 'H']);
    }
  });

  it('the English mirror, both sides', () => {
    expect(setLine('line ABE')).toEqual(['A', 'B', 'E']);
    expect(setLine('ABE line')).toEqual(['A', 'B', 'E']);
    expect(setLine('the line ABE')).toEqual(['A', 'B', 'E']);
  });

  it('spaced and glued runs, and runs longer than three', () => {
    expect(setLine('ישר A B C D')).toEqual(['A', 'B', 'C', 'D']);
    expect(setLine('A B C D ישר')).toEqual(['A', 'B', 'C', 'D']);
    expect(setLine('ABCD ישר')).toEqual(['A', 'B', 'C', 'D']);
    expect(setLine('ישר A1 B2 C3')).toEqual(['A1', 'B2', 'C3']);
  });

  it('the dashed ordered form takes the noun on either side too', () => {
    expect(setLine('ישר A-O1-O2-B')).toEqual(['A', 'O1', 'O2', 'B']);
    expect(setLine('A-O1-O2-B ישר')).toEqual(['A', 'O1', 'O2', 'B']);
  });

  // The all-labels demand is the guard: these mean something DIFFERENT and belong to sibling branches.
  // Reading them as an ordered collinearity would silently change the geometry (an unordered membership
  // becoming "Q between P and R"), so each must keep its own lowering.
  it('does not steal the richer phrasings of its own family', () => {
    const onLine = cmds('P על הישר QR');
    expect(onLine.some((c) => c.type === 'set-collinear'), 'P on line QR stays an unordered membership').toBe(true);
    expect(onLine.some((c) => c.type === 'set-line'), 'and is NOT read as an ordered run').toBe(false);

    const through = cmds('הישר QR עובר דרך P');
    expect(through.some((c) => c.type === 'set-collinear'), 'the passes-through form keeps its lowering').toBe(true);
    expect(through.some((c) => c.type === 'set-line')).toBe(false);
  });

  it('a TWO-label reference is not a collinearity in either order', () => {
    for (const u of ['הישר AC', 'AC הישר']) {
      const r = parse(u);
      const has = r.ok && r.commands.some((c) => c.type === 'set-line');
      expect(has, `«${u}» is a line reference, not an ordered run`).toBe(false);
    }
  });

  // The parity ratchet: every family that names a construct by noun + labels must accept both orders.
  it('PARITY — the collinearity family matches its siblings on noun order', () => {
    const pairs: [string, string][] = [
      ['ישר GFH', 'GFH ישר'],
      ['ריבוע ABCD', 'ABCD ריבוע'],
      ['משולש ABC', 'ABC משולש'],
      ['מעוין ABCD', 'ABCD מעוין'],
    ];
    for (const [nounFirst, nounLast] of pairs) {
      const a = parse(nounFirst);
      const b = parse(nounLast);
      expect(a.ok, nounFirst).toBe(true);
      expect(b.ok, `${nounLast} (noun-last must parse wherever noun-first does)`).toBe(true);
      if (a.ok && b.ok) {
        expect(b.commands.map((c) => c.type), `${nounFirst} ≡ ${nounLast}`).toEqual(a.commands.map((c) => c.type));
      }
    }
  });
});

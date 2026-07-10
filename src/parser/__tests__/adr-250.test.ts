/**
 * ADR-250 — two honesty mechanisms (operator session m68n76e7, prod 2026-07-07):
 *
 * 1. `droppedGivenNumbers` — the NUMERIC sibling of droppedNewLabels (ADR-089). A first-match rule
 *    that claims an utterance while consuming only part of it must not silently drop a stated
 *    magnitude: "שטח AEB גדול פי 2.25 משוטח משולש CED" (typo משוטח) was claimed by the TRIANGLE rule
 *    and committed as a bare △AEB — 2.25 gone, the row ✓. The guard flags it so the App escalates to
 *    the LLM (whose job is typos) instead of committing the partial meaning.
 *    Class tests: the guard is GENEROUS (catalog-wide zero false positives; fraction/percent/π-size/
 *    N-gon-count lowerings all account), so a hit is always a real drop.
 *
 * 2. `withCarrierSegments` — a stated on-segment point implies its carrier segment is DRAWN:
 *    "D על המשך BC" shows B—C—D (base + extension leg), "G on AD" draws AD; `lineMeetsCircle` draws
 *    BOTH halves of the stated line (A—E and E—D), not just the off-circle half.
 */
import { describe, expect, it } from 'vitest';
import { COMMAND_CATALOG, buildParseCtx, droppedGivenNumbers, parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const parseSteps = (utterances: string[]): { facts: Fact[]; last: ReturnType<typeof parse> } => {
  const facts: Fact[] = [];
  let last: ReturnType<typeof parse> = { ok: false, reason: 'not-handled' };
  for (const u of utterances) {
    const fig = replay(facts);
    last = parse(u, buildParseCtx(fig.construction, fig.positions));
    if (last.ok) for (const c of last.commands) facts.push({ id: `${facts.length}-${c.type}`, group: u, enabled: true, utterance: u, cmd: c });
  }
  return { facts, last };
};

const segPairs = (cmds: AnyCommand[]): string[] =>
  cmds.flatMap((c) => (c.type === 'segment' ? [[c.a, c.b].sort().join('')] : []));

describe('ADR-250/1 — droppedGivenNumbers (no stated magnitude is silently dropped)', () => {
  it("flags the operator's typo: the triangle rule claims the area-ratio utterance and drops 2.25", () => {
    const { last } = parseSteps([
      'משולש ABC שווה צלעות חסום במעגל',
      'D על המשך הצלע BC',
      'AD חותך את המעגל בנקודה E',
      'שטח AEB גדול פי 2.25 משוטח משולש CED', // ← the typo (משוטח for משטח)
    ]);
    expect(last.ok).toBe(true); // the triangle rule still claims it…
    if (last.ok) {
      expect(last.commands.some((c) => c.type === 'set-area-ratio')).toBe(false); // …with the ratio GONE
      expect(droppedGivenNumbers('שטח AEB גדול פי 2.25 משוטח משולש CED', last.commands)).toEqual([2.25]); // → escalate, never commit
    }
  });

  it('the CORRECT spelling parses to the ratio and the guard stays silent', () => {
    const { last } = parseSteps([
      'משולש ABC שווה צלעות חסום במעגל',
      'D על המשך הצלע BC',
      'AD חותך את המעגל בנקודה E',
      'שטח AEB גדול פי 2.25 משטח משולש CED',
    ]);
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.commands.some((c) => c.type === 'set-area-ratio')).toBe(true);
      expect(droppedGivenNumbers('שטח AEB גדול פי 2.25 משטח משולש CED', last.commands)).toEqual([]);
    }
  });

  it('accounts the standard lowerings: fraction, percent, π-sizes, N-gon count, subscript labels', () => {
    // fraction → one ratio value
    expect(droppedGivenNumbers('SABC/SDEF = 3/4', [{ type: 'area-ratio', a: ['A', 'B', 'C'], b: ['D', 'E', 'F'], r: 0.75 } as unknown as AnyCommand])).toEqual([]);
    // percent → fraction
    expect(droppedGivenNumbers('נקודה E על AC ב-40%', [{ type: 'point-on-segment', id: 'E', a: 'A', b: 'C', t: 0.4 }])).toEqual([]);
    // circumference nπ → radius n/2 ; area nπ → radius √n
    expect(droppedGivenNumbers('מעגל שהיקפו 6π', [{ type: 'circle', id: 'circle-O', center: 'O', radius: 3 }])).toEqual([]);
    expect(droppedGivenNumbers('מעגל ששטחו 9π', [{ type: 'circle', id: 'circle-O', center: 'O', radius: 3 }])).toEqual([]);
    // a regular N-gon's count → ids.length
    expect(droppedGivenNumbers('regular 5-gon ABCDE', [{ type: 'polygon', ids: ['A', 'B', 'C', 'D', 'E'] } as unknown as AnyCommand])).toEqual([]);
    // a subscript digit is a LABEL, not a stated number
    expect(droppedGivenNumbers('מעגל O_1', [{ type: 'circle', id: 'circle-O1', center: 'O1', radius: 5 }])).toEqual([]);
    // and a genuinely dropped number IS flagged
    expect(droppedGivenNumbers('AB = 7 בערך', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([7]);
  });

  it('WORD magnitudes (issue #2): a stated רבע/חצי/half with no digit is flagged when dropped', () => {
    // "AB שווה לחצי BC" claimed as a plain equality drops the HALF — a silently wrong relation.
    expect(droppedGivenNumbers('AB שווה לחצי BC', [{ type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' } as unknown as AnyCommand])).toEqual([0.5]);
    expect(droppedGivenNumbers('שטח NCE שווה לרבע שטח ACD', [{ type: 'segment', a: 'N', b: 'C' }])).toEqual([0.25]);
    expect(droppedGivenNumbers('AB equals half BC', [{ type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' } as unknown as AnyCommand])).toEqual([0.5]);
    // …and accounted when the rule lowered it — as the value OR its inverse (the mirrored side's k).
    expect(droppedGivenNumbers('שטח NCE שווה לרבע שטח ACD', [{ type: 'area-ratio', ids1: ['A', 'C', 'D'], ids2: ['N', 'C', 'E'], k: 4 } as unknown as AnyCommand])).toEqual([]);
    expect(droppedGivenNumbers('AB שווה לחצי BC', [{ type: 'set-ratio', a: 'A', b: 'B', c: 'B', d: 'C', k: 0.5 } as unknown as AnyCommand])).toEqual([]);
    // The construct nouns are shapes, not magnitudes — never flagged (they also state no relation).
    expect(droppedGivenNumbers('חצי מעגל שקוטרו AB', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([]);
    expect(droppedGivenNumbers('רבע מעגל', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([]);
    // A relationless word context (a bisector "חוצה", bare nouns) is not a magnitude statement.
    expect(droppedGivenNumbers('CD חוצה זווית ACB', [{ type: 'segment', a: 'C', b: 'D' }])).toEqual([]);
  });

  it('catalog-wide zero false positives: every supported example that parses accounts all its numbers', () => {
    for (const c of COMMAND_CATALOG) {
      if (!c.supported) continue;
      for (const ex of [c.he, c.en]) {
        const r = parse(ex);
        if (!r.ok) continue; // parseability is the catalog guard's job; here only the number honesty
        expect(droppedGivenNumbers(ex, r.commands), `false positive on catalog example: ${ex}`).toEqual([]);
      }
    }
  });
});

describe('ADR-250/2 — a stated carrier is DRAWN (withCarrierSegments + lineMeetsCircle halves)', () => {
  it('"D על המשך הצלע BC" draws the base BC and the extension leg CD (He + En)', () => {
    for (const u of ['D על המשך הצלע BC', 'D on the extension of BC']) {
      const { last } = parseSteps(['משולש ABC', u]);
      expect(last.ok, u).toBe(true);
      if (last.ok) {
        const pairs = segPairs(last.commands);
        expect(pairs, u).toContain('BC');
        expect(pairs, u).toContain('CD');
      }
    }
  });

  it('an EXISTING point on the extension (set-line branch) also draws base + leg', () => {
    const { last } = parseSteps(['שני מעגלים נחתכים בנקודות A ו B', 'נקודה C על מעגל P', 'D על מעגל O', 'D על המשך CA']);
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.commands.some((c) => c.type === 'set-line')).toBe(true);
      const pairs = segPairs(last.commands);
      expect(pairs).toContain('AC'); // base C–A
      expect(pairs).toContain('AD'); // leg A–D
    }
  });

  it('"G on AD" draws the carrier AD even when A,D are new', () => {
    const { last } = parseSteps(['נקודה G על AD']);
    expect(last.ok).toBe(true);
    if (last.ok) expect(segPairs(last.commands)).toContain('AD');
  });

  it('"AD חותך את המעגל בנקודה E" draws BOTH halves A–E and E–D', () => {
    const { last } = parseSteps(['משולש ABC שווה צלעות חסום במעגל', 'D על המשך הצלע BC', 'AD חותך את המעגל בנקודה E']);
    expect(last.ok).toBe(true);
    if (last.ok) {
      const pairs = segPairs(last.commands);
      expect(pairs).toContain('AE');
      expect(pairs).toContain('DE');
    }
  });
});

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
import { honestyGateReport } from '@/app/honestyGates';
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
  it("the operator's typo escalates at the PARSE now (#497) — the triangle rule can no longer claim the area-ratio utterance", () => {
    const { last } = parseSteps([
      'משולש ABC שווה צלעות חסום במעגל',
      'D על המשך הצלע BC',
      'AD חותך את המעגל בנקודה E',
      'שטח AEB גדול פי 2.25 משוטח משולש CED', // ← the typo (משוטח for משטח)
    ]);
    // The #497 fail-closed leftover gate stops the triangle rule on the surviving «שטח … פי … משוטח»,
    // so the drop never even forms — the whole line escalates to the LLM (whose job is typos).
    expect(last.ok).toBe(false);
    // The gate itself remains the LLM-commit path's net: on a bare-triangle lowering it still names the drop.
    expect(droppedGivenNumbers('שטח AEB גדול פי 2.25 משוטח משולש CED', [{ type: 'triangle', ids: ['A', 'E', 'B'] } as AnyCommand])).toEqual([2.25]);
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

  it('a COUNT digit is not a magnitude (issue #160): "2 משיקים" ≡ "שני משיקים" — never spelling-gated', () => {
    // The operator's exact pxeb2ng8 sequence: the digit spelling produced the complete, correct Thales
    // construction and the gate threw it away as dropped:[2] — while the word spelling passed. A bare
    // integer quantifying a plural countable noun is consumed by the rule's STRUCTURE, not a payload.
    const pre = ['מעגל O ברדיוס 5'];
    const digitHe = parseSteps([...pre, 'מנקודה A יוצאים 2 משיקים למעגל']);
    const wordHe = parseSteps([...pre, 'מנקודה A יוצאים שני משיקים למעגל']);
    expect(digitHe.last.ok && wordHe.last.ok).toBe(true);
    if (digitHe.last.ok && wordHe.last.ok) {
      // command-identical: the two spellings of one word must agree
      expect(digitHe.last.commands).toEqual(wordHe.last.commands);
      expect(droppedGivenNumbers('מנקודה A יוצאים 2 משיקים למעגל', digitHe.last.commands)).toEqual([]);
    }
    const digitEn = parseSteps([['circle O with radius 5'], '2 tangents from A to the circle'].flat());
    expect(digitEn.last.ok).toBe(true);
    if (digitEn.last.ok) expect(droppedGivenNumbers('2 tangents from A to the circle', digitEn.last.commands)).toEqual([]);
    // sibling count slots in both languages — the class, not the instance
    expect(droppedGivenNumbers('2 מעגלים נחתכים בנקודות A ו B', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([]);
    expect(droppedGivenNumbers('החותכים אותו ב 3 נקודות', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([]);
    expect(droppedGivenNumbers('2 circles intersect at A and B', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([]);
  });

  it('count exemption never reaches real magnitudes: ratio/size/times digits stay gated (issue #160 anti-regression)', () => {
    expect(droppedGivenNumbers('רדיוס 5', [])).toEqual([5]);
    expect(droppedGivenNumbers('שטח AEB גדול פי 2 משיקים', [])).toEqual([2]); // פי-prefixed digit is a ratio
    expect(droppedGivenNumbers('AB = 2 times CD', [])).toEqual([2]); // "times" heads a ratio, not a countable
    expect(droppedGivenNumbers('AB גדול 2 פעמים מ CD', [])).toEqual([2]); // פעמים likewise
    expect(droppedGivenNumbers('AB = 6', [{ type: 'segment', a: 'A', b: 'B' }])).toEqual([6]);
    // a decimal is never a count ("2.5 tangents" is not a quantifier)
    expect(droppedGivenNumbers('2.5 tangents', [])).toEqual([2.5]);
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

/**
 * ADR-523 (#1161) — the scan is SIGN-AWARE.
 *
 * `droppedGivenNumbers` extracted stated numbers without their sign, so «E=(-1,7)» was scanned as an
 * occurrence of `1`, no command supplied an account for `+1`, and the multiset accountant reported a
 * dropped given against a parse that was perfectly faithful (`free-point x:-1 y:7`). A FALSE POSITIVE
 * in an honesty gate — it escalated a construction 2-D deliberately supports, burning a paid fallback
 * call and letting the LLM re-roll a right answer.
 *
 * Asserted as PARITY PAIRS: the negative row must reach the same verdict SHAPE as its positive twin.
 * A test that only asserted the parse would have stayed green through the entire bug — the parse was
 * always correct — so every row asserts the parse AND `honestyGateReport(...).clean`.
 */
describe('ADR-523 — a negative payload is not a dropped given (#1161)', () => {
  const gate = (u: string): { x: number; y: number; clean: boolean; nums: number[] } => {
    const r = parse(u);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    const fp = r.commands.find((c) => c.type === 'free-point');
    expect(fp).toBeDefined();
    const report = honestyGateReport(u, r.commands, {});
    return { x: (fp as { x: number }).x, y: (fp as { y: number }).y, clean: report.clean, nums: report.droppedNums };
  };

  // the six rows measured on the issue, positive and negative side by side
  it.each([
    ['E=(1,7)', 1, 7],
    ['E=(-1,7)', -1, 7],
    ['E=(3,5)', 3, 5],
    ['E=(-3,5)', -3, 5],
    ['E=(-1,-7)', -1, -7],
    ['A = (3,5)', 3, 5],
    ['A = (-3,-5)', -3, -5],
    ['הנקודה E=(-1,7)', -1, 7],
  ])('%s parses to its stated coordinates AND clears the gate', (u, x, y) => {
    const g = gate(u as string);
    expect([g.x, g.y]).toEqual([x, y]);
    expect(g.nums).toEqual([]);
    expect(g.clean).toBe(true);
  });

  // The class is the SCANNER, not `free-point` — an exemption for the reported construct would be the
  // per-input patch. A negative value reaches the gate the same way whatever command carries it.
  it('the scanner accounts a negative value wherever it appears, not only in a coordinate pair', () => {
    expect(droppedGivenNumbers('x = -4', [{ type: 'set-distance', a: 'A', b: 'B', value: -4 } as never])).toEqual([]);
    expect(droppedGivenNumbers('x = -4', [{ type: 'set-distance', a: 'A', b: 'B', value: 4 } as never])).toEqual([-4]);
  });

  // The sign is read ONLY where no operand can precede the minus. These are the three shapes that must
  // NOT be read as a sign — each would invert a stated magnitude and cause a FALSE DROP, which this
  // gate's doctrine forbids ("a false account only suppresses a warning; a false drop breaks a working
  // input").
  it.each([
    ['a Hebrew maqaf is not a minus', 'AB גדול ב-5 מ-CD', 5],
    ['a subtraction after a digit is not a minus', 'AB = (4-0)', 4],
    ['a subtraction after a Latin letter is not a minus', 'AB = x-3', 3],
  ])('%s', (_name, utterance, stated) => {
    // nothing accounts for it, so the STATED value is what the gate reports — unsigned
    expect(droppedGivenNumbers(utterance as string, [])).toContain(stated);
  });

  // The positive rows and the existing lowerings are untouched — the same accounting the gate
  // documented before this change.
  it('the existing accounts are unchanged by the sign pass', () => {
    const cases: [string, AnyCommand[]][] = [
      ['BC=10', parse('BC=10').ok ? (parse('BC=10') as { commands: AnyCommand[] }).commands : []],
      ['ריבוע במידות 4*4', parse('ריבוע במידות 4*4').ok ? (parse('ריבוע במידות 4*4') as { commands: AnyCommand[] }).commands : []],
      ['מלבן במידות 4*6', parse('מלבן במידות 4*6').ok ? (parse('מלבן במידות 4*6') as { commands: AnyCommand[] }).commands : []],
      ['היקף מעגל O1 הוא 6', parse('היקף מעגל O1 הוא 6').ok ? (parse('היקף מעגל O1 הוא 6') as { commands: AnyCommand[] }).commands : []],
      ['BM:MF=1:2', parse('BM:MF=1:2').ok ? (parse('BM:MF=1:2') as { commands: AnyCommand[] }).commands : []],
    ];
    for (const [u, cmds] of cases) expect([u, droppedGivenNumbers(u, cmds)]).toEqual([u, []]);
  });
});

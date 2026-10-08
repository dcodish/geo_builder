/**
 * #1888 / #1889 item C ([ADR-AG-251](../../docs/06c-decisions-analytic.md#adr-ag-251); workspace rule ADR-W-120) —
 * A LINE THAT LOSES A PART IS REFUSED WHOLE, AND NEVER HANDED TO THE MODEL.
 *
 * Operator, 2026-10-08: *"the syntax משולש ABC ישר זווית ב-B should be rejected"*, *"a line that loses a part gets the
 * existing one-input-per-line message … in every builder"*, *"Only when a part is lost"*, *"Teach the right form"*.
 * Analytic declined «משולש ABC ישר זווית ב-B» and «…בנקודה E על AB» to the model, and recorded its own drops
 * («C מחלקת את AB ביחס 3:2 ב-B») with the trailing part unread. «…E שהיא אמצע BD» keeps building: analytic reads both
 * parts.
 *
 * Every verdict here is the one `App.tsx` dispatches (`decideSubmit`, `decideEdit`, `reachesFallback`), and every text
 * is the one the page renders (`errorText`). No model call is reachable: a `not-handled` is only asserted.
 */
import { describe, expect, it } from 'vitest';
import { decideEdit, decideSubmit, reachesFallback, type SubmitVerdict } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { loweringKey } from '../app/lostPart';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
/** The locale wraps Latin runs in bidi isolates; the locks read the words. */
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(analyticI18n.getFixedT('he') as unknown as T);
const en = plain(analyticI18n.getFixedT('en') as unknown as T);

/** Type `lines` one by one, as the app does; the verdict of the LAST line, and the lines held before it. */
function typed(lines: readonly string[], seed = 0): { v: SubmitVerdict; held: string[] } {
  const held: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, held, seed);
    expect(v.kind, `«${line}» is context and must record`).toBe('record');
    if (v.kind === 'record') held.push(v.line);
  }
  return { v: decideSubmit(lines[lines.length - 1], held, seed), held };
}

const textOf = (v: SubmitVerdict, t: T) => {
  if (v.kind !== 'refused') throw new Error(`expected a refusal, got ${v.kind}`);
  return errorText(v.error, t);
};

const SPLIT_HE = 'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: ';
const taughtHe = (triangle: string, angle: string) =>
  `בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. כתבו קודם «משולש ${triangle}», ואחר כך בשורה נפרדת «∠${angle} = 90°».`;

describe('#1888 — «משולש ABC ישר זווית ב-<V>» is refused and TEACHES the two lines (any vertex, any context)', () => {
  const CASES: Array<[string, string[], string]> = [
    ['ב-B', ['משולש ABC ישר זווית ב-B'], 'ABC'],
    ['ב-A', ['משולש ABC ישר זווית ב-A'], 'CAB'],
    ['ב-C (where a default would sit)', ['משולש ABC ישר זווית ב-C'], 'BCA'],
    ['after «משולש ABC»', ['משולש ABC', 'משולש ABC ישר זווית ב-B'], 'ABC'],
    ['after «AB ⟂ BC» (the angle already at B)', ['משולש ABC', 'AB ⟂ BC', 'משולש ABC ישר זווית ב-B'], 'ABC'],
  ];
  it.each(CASES)('%s', (_n, lines, angle) => {
    const { v } = typed(lines);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error.key).toBe('split-statements');
    expect(reachesFallback(v)).toBe(false);
    expect(textOf(v, he)).toBe(taughtHe('ABC', angle));
  });

  it('English: the same refusal, worded as 2-D words it', () => {
    const { v } = typed(['right triangle ABC at B']);
    expect(textOf(v, en)).toBe(
      'One given per line — that way the tool can build and verify each one separately. Write «triangle ABC» first, and then, on a separate line, «∠ABC = 90°».',
    );
  });

  /** A taught remedy is a hypothesis: the two lines it teaches must build, with the right angle at the named vertex. */
  it.each([
    ['B', 'ABC'],
    ['A', 'CAB'],
    ['C', 'BCA'],
  ])('the taught lines build: «משולש ABC» then «∠%s… = 90°» puts the right angle at that vertex', (vertex, angle) => {
    const { v, held } = typed(['משולש ABC', `∠${angle} = 90°`]);
    expect(v.kind).toBe('record');
    for (const seed of [0, 1, 2]) {
      const d = derive([...held, `∠${angle} = 90°`], seed);
      const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
      const [a, , c] = [angle[0], angle[1], angle[2]];
      const o = p[vertex];
      const dot = (p[a].x - o.x) * (p[c].x - o.x) + (p[a].y - o.y) * (p[c].y - o.y);
      expect(Math.abs(dot), `seed ${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('#1889 — a crossing whose tail is a lost part is refused; one whose tail is READ keeps building', () => {
  it('«מרובע ABCD» · «AC ו-BD נפגשים בנקודה E על AB» → refused, the two parts in the student’s words', () => {
    const { v } = typed(['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E על AB']);
    expect(v.kind === 'refused' && v.error.key).toBe('split-statements');
    expect(reachesFallback(v)).toBe(false);
    expect(textOf(v, he)).toBe(`${SPLIT_HE}(1) AC ו-BD נפגשים בנקודה E  (2) על AB`);
  });

  it('«מרובע ABCD» · «AC ו-BD נפגשים בנקודה E שהיא אמצע BD» records, and E is the midpoint of BD', () => {
    const { v, held } = typed(['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E שהיא אמצע BD']);
    expect(v.kind).toBe('record');
    const d = derive([...held, 'AC ו-BD נפגשים בנקודה E שהיא אמצע BD'], 0);
    const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
    expect(p.E.x).toBeCloseTo((p.B.x + p.D.x) / 2, 4);
    expect(p.E.y).toBeCloseTo((p.B.y + p.D.y) / 2, 4);
  });
});

describe('the class — a part the reading never read is refused, in the student’s words', () => {
  const RATIO = ['A(0,0)', 'B(5,0)'];
  it.each([
    [[...RATIO, 'C מחלקת את AB ביחס 3:2 ב-B'], '(1) C מחלקת את AB ביחס 3:2  (2) ב-B'],
    [[...RATIO, 'C מחלקת את AB ביחס 3:2 על CA'], '(1) C מחלקת את AB ביחס 3:2  (2) על CA'],
    [[...RATIO, 'C מחלקת את AB ביחס 3:2 שנמצאת על CA'], '(1) C מחלקת את AB ביחס 3:2  (2) שנמצאת על CA'],
    [['משולש ABC שווה שוקיים ב-A'], '(1) משולש ABC שווה שוקיים  (2) ב-A'],
    [['טרפז ABCD ישר זווית ב-B'], '(1) טרפז ABCD ישר זווית  (2) ב-B'],
  ])('%j', (lines, all) => {
    const { v } = typed(lines);
    expect(v.kind === 'refused' && v.error.key).toBe('split-statements');
    expect(textOf(v, he)).toBe(SPLIT_HE + all);
  });

  it('a rest that SAYS something is not a lost part: «בקודקוד B», «ש-AE = EC» stay with the model', () => {
    for (const lines of [['משולש ABC ישר זווית בקודקוד B'], ['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E ש-AE = EC']]) {
      const { v } = typed(lines);
      expect(v.kind === 'refused' && v.error.key, lines.join(' · ')).toBe('not-handled');
      expect(reachesFallback(v)).toBe(true);
    }
  });

  it('still works (the ruling’s controls): every part honoured', () => {
    for (const lines of [
      ['משולש ABC', 'AB = 4, AC = 3'],
      ['משולש ABC', 'D על AB כך ש-AD = 3'],
      ['משולש ABC', 'D על BC כך ש-BD = DC'],
      ['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E'],
      ['משולש ABC ישר זווית'],
    ]) expect(typed(lines).v.kind, lines.join(' · ')).toBe('record');
  });
});

describe('the ✎ edit seam refuses what the submit seam refuses (ADR-W-006)', () => {
  const lines = ['מרובע ABCD', 'AC ו-BD נפגשים בנקודה E'];
  it('an edit that loses a part is refused; the clean edit is accepted', () => {
    expect(decideEdit(1, 'AC ו-BD נפגשים בנקודה E על AB', lines, [], 0)).toBe(false);
    expect(decideEdit(1, 'AC ו-BD נפגשים בנקודה F', lines, [], 0)).toBe(true);
    expect(decideEdit(0, 'משולש ABC ישר זווית ב-B', ['משולש ABC'], [], 0)).toBe(false);
  });
  it('a muted row may not hold a line that loses a part either', () => {
    const ratio = ['A(0,0)', 'B(5,0)', 'C מחלקת את AB ביחס 3:2'];
    expect(decideEdit(2, 'C מחלקת את AB ביחס 3:2 ב-B', ratio, [2], 0)).toBe(false);
  });
});

/**
 * CLASS LOCKS over the catalog (the plan's sweep, kept): every committing example, He and En, is never flagged; and
 * no committing example with a trailing qualifier built from its own labels records with the SAME reading — it is
 * read (a different reading), refused, or a co-reference (a point named twice, which the shared probe exempts).
 */
describe('class locks over the catalog', () => {
  const runnable = COMMAND_CATALOG_ANALYTIC.filter((e) => !e.lane).flatMap((e) => {
    const held: string[] = [];
    for (const p of (e as { needs?: string[] }).needs ?? []) {
      const v = decideSubmit(p, held, 0);
      if (v.kind !== 'record') return [];
      held.push(v.line);
    }
    return [{ e, held }];
  });

  it('no committing catalog example (He + En) is refused as a lost part', () => {
    const flagged: string[] = [];
    let exercised = 0;
    for (const { e, held } of runnable) {
      for (const ex of [e.he, e.en]) {
        if (!ex) continue;
        const v = decideSubmit(ex, held, 0);
        if (v.kind === 'refused' && v.error.key === 'split-statements') flagged.push(ex);
        if (v.kind === 'record') exercised++;
      }
    }
    expect(flagged).toEqual([]);
    expect(exercised).toBeGreaterThan(400);
  }, 120_000);

  it('a qualifier from the example’s own labels never records with an identical reading (co-references aside)', () => {
    const dropped: string[] = [];
    for (const { e, held } of runnable) {
      const base = parseLine(e.he);
      if (!base.ok || decideSubmit(e.he, held, 0).kind !== 'record') continue;
      const letters = [...new Set(e.he.match(/[A-Z]\d*/g) ?? [])];
      if (letters.length < 2) continue;
      const X = letters[letters.length - 1];
      const PQ = letters[0] + letters[1];
      for (const q of [`ב-${X}`, `שהיא אמצע ${PQ}`, `על ${PQ}`, `שנמצאת על ${PQ}`]) {
        const line = `${e.he} ${q}`;
        if (decideSubmit(line, held, 0).kind !== 'record') continue;
        const p = parseLine(line);
        if (!p.ok || loweringKey(p.facts) !== loweringKey(base.facts)) continue;
        // a co-reference: the qualifier's one letter is a single-letter run the line already reads («בנקודה T ב-T»)
        if (q === `ב-${X}` && new RegExp(`(?<![A-Z])${X}(?![A-Z\\d])`).test(e.he)) continue;
        dropped.push(line);
      }
    }
    expect(dropped).toEqual([]);
  }, 300_000);
});

/**
 * #1177 (ADR-AG-352) — THE LOCUS CHIP, the guide's ask row, and the one-line form taught as its two lines.
 *
 * Operator, 2026-09-17: *"I want to have a chip next to points in the input panel that can show their locus. This will
 * only be available for points that are not fully defined."* Ruled 2026-10-30: «הצג מקום גאומטרי» ↔ «הסתר מקום גאומטרי».
 *
 * Everything here calls the real decisions — `locusChips` (which calls the engine's `hasLocus`), `ask`, `toggleDrawn`,
 * `decideSubmit` — never a copy of them (#1102).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ask, type Answer } from '../app/ask';
import { isDrawn, removeAnswerAt, toggleDrawn } from '../app/answers';
import { errorText } from '../app/errorText';
import { locusChips, locusSentence } from '../app/locusChip';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { PROMPT_SPEC_ANALYTIC } from '../parser/llmSharedAnalytic';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' };
const kind = ((k: string) => HE[k] ?? k) as never;
const asked = (lines: readonly string[], q: string, seed = 0): Answer => ask(derive(lines, seed), q, fmt, kind);
/** The ask answers with a CURVE: a value and a drawing. */
const isCurve = (a: Answer) => a.value !== null && a.locus !== undefined;

const FIX = path.join(__dirname, 'fixtures');
const fixture = (name: string): string[] => JSON.parse(readFileSync(path.join(FIX, `${name}.analytic.json`), 'utf8')).lines;

const BISECTOR = ['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB'];
const CIRCLE = ['A(0,0)', 'נקודה M', 'MA = 5'];
const CHAIN = ['A(0,0)', 'נקודה M', 'MA = 5', 'B(6,0)', 'N אמצע MB'];
const TWO_DOF = ['A(0,0)', 'נקודה M', 'נקודה N'];
const TWO_MOVERS = ['נתון מעגל I שמשוואתו x^2+y^2=4', 'M על המעגל I', 'נתון מעגל II שמשוואתו (x-6)^2+y^2=1', 'N על המעגל II'];
const DETERMINED = ['A(0,0)', 'B(4,0)', 'C(0,3)'];

describe('#1177 — which points get a chip: the engine\'s `hasLocus`, on the row that introduced the point', () => {
  it.each([
    ['the bisector', BISECTOR, [['M', 2]]],
    ['the circle', CIRCLE, [['M', 1]]],
    ['a midpoint downstream of the mover', CHAIN, [['M', 1], ['N', 4]]],
    ['two 2-DOF points', TWO_DOF, []],
    ['two independent movers', TWO_MOVERS, []],
    ['a determined triangle', DETERMINED, []],
    // A point CREATED by reference («MA = 5» with no «נקודה M») sits on the line that created it.
    ['a point created by reference', ['A(0,0)', 'MA = 5'], [['M', 1]]],
  ])('%s', (_name, lines, expected) => {
    const chips = locusChips(derive(lines as string[], 0));
    expect(chips.map((c) => [c.id, c.line])).toEqual(expected);
    for (const c of chips) expect(c.sentence).toBe(locusSentence(c.id));
  });

  it('the operator\'s T9 sequence (the fixture): the chip is on «נקודה M» and asks the bisector', () => {
    const lines = fixture('issue-1177-locus-chip-t9');
    const chips = locusChips(derive(lines, 0));
    expect(chips).toEqual([{ line: 2, id: 'M', sentence: 'המקום הגיאומטרי של M' }]);
    expect(lines[chips[0].line]).toBe('נקודה M');
    expect(asked(lines, chips[0].sentence).value).toBe('ישר · x - 4 = 0');
  });
});

/**
 * THE AGREEMENT LOCK. A chip appears exactly where the ask has a locus to answer. Completeness is strict: no point the
 * ask answers with a curve may lack a chip. The converse holds everywhere except one known ask-lane gap, #2628 (a
 * translated parabola whose shape the fit does not gate, so the ask draws nothing). That gap is the ask's, not the
 * chip's: the chip asks exactly what typing asks.
 */
const ASK_GAPS: Record<string, string[]> = {
  'exam-2024w-locus-1138': ['C'], // #2628
  'exam-2024w-locus-param-1138': ['C'], // #2628
};
const LOCUS_FIXTURES = [
  'exam-2024sB-locus-1138',
  'exam-2024w-locus-1138',
  'exam-2024w-locus-param-1138',
  'issue-2383-q1-locus-line',
  'issue-2384-q1-area-locus',
  'issue-1177-locus-chip-t9',
];

describe('#1177 — the chip and the ask agree', () => {
  const cases: Array<[string, string[], string[]]> = [
    ['bisector', BISECTOR, []],
    ['circle', CIRCLE, []],
    ['chain', CHAIN, []],
    ['two-dof', TWO_DOF, []],
    ['two-movers', TWO_MOVERS, []],
    ...LOCUS_FIXTURES.map((n): [string, string[], string[]] => [n, fixture(n), ASK_GAPS[n] ?? []]),
  ];
  it.each(cases.flatMap(([n, lines, gaps]) => [0, 1, 2].map((seed) => [n, seed, lines, gaps] as const)))(
    '%s, seed %i',
    (_n, seed, lines, gaps) => {
      const d = derive(lines, seed);
      const chips = new Set(locusChips(d).map((c) => c.id));
      for (const p of d.figure.points) {
        const a = ask(d, locusSentence(p.id), fmt, kind);
        // the chip's sentence always round-trips through the ask lane's reader
        expect(a.unreadable, `${p.id}: unreadable`).toBeFalsy();
        expect(a.missing, `${p.id}: missing`).toBeFalsy();
        if (isCurve(a)) expect(chips.has(p.id), `${p.id} answers a curve and has no chip`).toBe(true);
        else if (chips.has(p.id)) expect(gaps, `${p.id} has a chip and its ask draws nothing`).toContain(p.id);
      }
    },
    60_000,
  );
});

describe('#1177 — the chip uses the ask lane\'s lifetime (ADR-AG-067)', () => {
  it('ask → row + drawing · again → drawing hidden, row kept · again → drawn · ✕ → both go', () => {
    const s = locusSentence('M');
    let qs = toggleDrawn([], s);
    expect(qs).toEqual([{ sentence: s, shown: true }]);
    expect(isDrawn(qs, s)).toBe(true); // the label reads «הסתר מקום גאומטרי»
    qs = toggleDrawn(qs, s);
    expect(qs).toEqual([{ sentence: s, shown: false }]);
    expect(isDrawn(qs, s)).toBe(false); // the label reads «הצג מקום גאומטרי»
    qs = toggleDrawn(qs, s);
    expect(isDrawn(qs, s)).toBe(true);
    expect(removeAnswerAt(qs, 0)).toEqual([]);
  });

  it('the label words are the ruled ones', () => {
    const he = analyticI18n.getFixedT('he');
    expect(he('locusChipShow')).toBe('הצג מקום גאומטרי');
    expect(he('locusChipHide')).toBe('הסתר מקום גאומטרי');
  });
});

describe('#1177 — the guide\'s ask row (ruling 2026-09-27)', () => {
  const row = COMMAND_CATALOG_ANALYTIC.find((e) => e.lane === 'ask' && e.he === 'המקום הגיאומטרי של M');

  it('is featured, in the locus section, with the two setup lines', () => {
    expect(row).toBeDefined();
    expect(row!.featured).toBe(true);
    expect(row!.category).toBe('locus');
    expect(row!.needs).toEqual(['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB']);
  });

  it('its needs plus its question answer the bisector, in both languages', () => {
    expect(asked(row!.needs!, row!.he).value).toBe('ישר · x - 2 = 0');
    expect(asked(row!.needs!, row!.en).value).toBe('ישר · x - 2 = 0');
  });

  it('is never taught to the model', () => {
    const vocab = PROMPT_SPEC_ANALYTIC.vocabulary('he');
    expect(JSON.stringify(vocab)).not.toContain(row!.he);
  });
});

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const heT = plain(analyticI18n.getFixedT('he') as unknown as T);
const textOf = (v: SubmitVerdict) => {
  if (v.kind !== 'refused') throw new Error(`expected a refusal, got ${v.kind}`);
  return errorText(v.error, heT);
};

describe('#1177 — the one-line locus point is refused, teaching its two lines (ruling 2026-09-27)', () => {
  const AB = ['A(0,0)', 'B(4,0)'];
  it.each(['M נקודה המקיימת MA = MB', 'M היא נקודה המקיימת MA = MB', 'נקודה M המקיימת MA = MB', 'הנקודה M שמקיימת MA = MB'])(
    '«%s»',
    (line) => {
      const v = decideSubmit(line, AB, 0);
      expect(v.kind).toBe('refused');
      expect(textOf(v)).toBe(
        'בכל שורה נתון אחד — כך הכלי יוכל לבנות ולאמת כל נתון בנפרד. זיהינו כאן שני נתונים — נסו להקליד אותם בשני שלבים: (1) נקודה M  (2) MA = MB',
      );
    },
  );

  it('the taught lines build, in order, and the question then answers (taught remedies are hypotheses)', () => {
    const v = decideSubmit('M נקודה המקיימת MA = MB', AB, 0);
    if (v.kind !== 'refused' || v.error.key !== 'split-statements') throw new Error('not taught');
    let lines = [...AB];
    for (const part of v.error.parts) {
      expect(decideSubmit(part, lines, 0).kind, part).toBe('record');
      lines = [...lines, part];
    }
    expect(asked(lines, 'המקום הגיאומטרי של M').value).toBe('ישר · x - 2 = 0');
    expect(locusChips(derive(lines, 0)).map((c) => c.id)).toEqual(['M']);
  });

  it('a property that would not record is not taught: the line keeps its old path', () => {
    expect(decideSubmit('M נקודה המקיימת MA = -3', AB, 0)).toMatchObject({ kind: 'refused', error: { key: 'not-handled' } });
  });
});

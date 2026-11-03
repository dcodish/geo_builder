/**
 * #2673 (ADR-AG-381) — THE LOCUS IS REACHED BY ITS CHIP ONLY.
 *
 * Operator, 2026-11-02: *"we should drop the ability to ask for המקום הגיאומטרי through the ask box. this is why we have the
 * chips."* 2026-11-03, on the conditional locus: *"what you suggest for point M is exaclty how i want this built. a student
 * should see what he is placing the point and this is part of the pedagogy of the builder."*
 *
 * Everything here calls the real decisions — `decideSubmit`, `derive`, `ask`, `locusChips`, `pressChip` — never a copy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { askOnceAnswer, chipState, isDrawn, pressChip, removeAnswerAt } from '../app/answers';
import { askLocus, locusChips, locusSentence } from '../app/locusChip';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';
import { PROMPT_SPEC_ANALYTIC } from '../parser/llmSharedAnalytic';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל', parabola: 'פרבולה', ellipse: 'אליפסה' };
const kind = ((k: string) => HE[k] ?? k) as never;
const BISECTOR = ['A(0,0)', 'B(4,0)', 'נקודה M', 'MA = MB'];

/** Every wording the locus grammar reads, typed in the ask box. */
const TYPED = [
  'המקום הגיאומטרי של M',
  'המקום הגאומטרי של M',
  'המקום הגיאומטרי של הנקודה M',
  'משוואת המקום הגיאומטרי של M',
  'מצאו את המקום הגיאומטרי של M',
  'מהו המקום הגיאומטרי של M?',
  'the locus of M',
  'locus of M',
  'the equation of the locus of M',
  'הראו כי המקום הגיאומטרי של M הוא ישר',
  'הראו כי המקום הגיאומטרי של כל הנקודות M נמצא על ישר, ומצאו את משוואתו',
  'הביעו באמצעות a את המקום הגיאומטרי של M',
  'המקום הגיאומטרי שעליו נמצאות כל הנקודות M',
  'המקום הגיאומטרי של כל הנקודות M המקיימות MA = MB',
  'the locus of all the points M such that MA = MB',
];

describe('#2673 — a typed locus question answers the pointer to the chip, never the locus', () => {
  const d = derive(BISECTOR, 0);
  it.each(TYPED)('«%s»', (q) => {
    const a = ask(d, q, fmt, kind);
    expect(a).toEqual({ question: q, value: null, chipOnly: true });
  });

  it('whatever the figure holds: a point it lacks, and an empty figure, get the same pointer', () => {
    expect(ask(d, 'המקום הגיאומטרי של Z', fmt, kind)).toMatchObject({ chipOnly: true });
    expect(ask(derive([], 0), 'המקום הגיאומטרי של M', fmt, kind)).toMatchObject({ chipOnly: true });
  });

  it('a conjoined question keeps its other part', () => {
    const a = ask(d, 'המקום הגיאומטרי של M ואת AB', fmt, kind);
    expect(a.parts?.map((p) => [p.question, p.chipOnly ?? false, p.value])).toEqual([
      ['המקום הגיאומטרי של M', true, null],
      ['AB', false, '4'],
    ]);
  });

  it('a measure of the locus stays understood, not supported (R69a)', () => {
    expect(ask(d, 'שיפוע המקום הגיאומטרי של M', fmt, kind)).toMatchObject({ unsupported: true });
  });

  it('the pointer\'s words name the chip by its own label, in both languages', () => {
    const he = analyticI18n.getFixedT('he');
    const en = analyticI18n.getFixedT('en');
    expect(he('askLocusByChip', { chip: he('locusChipShow') })).toBe('את המקום הגאומטרי מציגים בכפתור «הצג מקום גאומטרי» שליד הנקודה ברשימת הנתונים.');
    expect(en('askLocusByChip', { chip: en('locusChipShow') })).toBe('A locus is shown with the «Show locus» button beside the point in the givens list.');
  });
});

describe('#2673 — the chip is unchanged', () => {
  it('the chip\'s entry point answers the locus, as the typed question did before', () => {
    const d = derive(BISECTOR, 0);
    const a = askLocus(d, 'M', fmt, kind);
    expect(a.value).toBe('ישר · x - 2 = 0');
    expect(a.locus?.components.length).toBe(1);
    expect(a).toEqual(ask(d, locusSentence('M'), fmt, kind, 'chip'));
  });

  it('press → drawn · again → hidden, row kept · again → drawn · ✕ → gone; the record is marked `via: chip`', () => {
    const s = locusSentence('M');
    let qs = pressChip([], s);
    expect(qs).toEqual([{ sentence: s, shown: true, via: 'chip' }]);
    expect(chipState(qs, s)).toBe('drawn');
    qs = pressChip(qs, s);
    expect(qs).toEqual([{ sentence: s, shown: false, via: 'chip' }]);
    expect(chipState(qs, s)).toBe('hidden');
    qs = pressChip(qs, s);
    expect(chipState(qs, s)).toBe('drawn');
    expect(removeAnswerAt(qs, 0)).toEqual([]);
    expect(chipState([], s)).toBe('off');
  });

  it('the typed record and the chip\'s record are two rows: typing never lights or toggles the chip', () => {
    const s = locusSentence('M');
    let qs = askOnceAnswer([], s);
    expect(chipState(qs, s)).toBe('off');
    expect(isDrawn(qs, s)).toBe(true); // the typed row (answered with the pointer)
    qs = pressChip(qs, s);
    expect(qs).toEqual([{ sentence: s, shown: true, via: 'chip' }, { sentence: s, shown: true }]);
    qs = askOnceAnswer(qs, s); // re-typing refreshes the typed row only
    expect(qs).toEqual([{ sentence: s, shown: true }, { sentence: s, shown: true, via: 'chip' }]);
    expect(chipState(qs, s)).toBe('drawn');
  });
});

describe('#2673 — the conditional locus is built as givens, then its chip (ruling 2026-11-03)', () => {
  const FIX = path.join(__dirname, 'fixtures', 'issue-2673-conditional-locus-givens.analytic.json');
  const lines: string[] = JSON.parse(readFileSync(FIX, 'utf8')).lines;

  it('the givens record through the real submit gate, in order', () => {
    let built: string[] = [];
    for (const l of lines) {
      expect(decideSubmit(l, built, 0).kind, l).toBe('record');
      built = [...built, l];
    }
  });

  it.each([0, 1, 2])('seed %i: the chip sits on «M נקודה» and answers the bisector', (seed) => {
    const d = derive(lines, seed);
    const chips = locusChips(d);
    expect(chips.map((c) => [c.id, lines[c.line]])).toEqual([['M', 'M נקודה']]);
    expect(askLocus(d, 'M', fmt, kind).value).toBe('ישר · x - 2 = 0');
  });
});

describe('#2673 — the guide teaches the chip', () => {
  const rows = COMMAND_CATALOG_ANALYTIC.filter((e) => e.category === 'locus');

  it('one featured chip row, whose words are the chip\'s own label', () => {
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.lane).toBe('chip');
    expect(row.featured).toBe(true);
    expect(row.he).toBe(analyticI18n.getFixedT('he')('locusChipShow'));
    expect(row.en).toBe(analyticI18n.getFixedT('en')('locusChipShow'));
  });

  it('its needs build, and the chip then sits on its point\'s row and answers', () => {
    const [row] = rows;
    const d = derive(row.needs!, 0);
    expect(d.faults).toEqual([]);
    const chip = locusChips(d).find((c) => c.id === row.point);
    expect(chip, 'no chip on the row\'s point').toBeDefined();
    expect(askLocus(d, row.point!, fmt, kind).value).toBe('ישר · x - 2 = 0');
  });

  it('its description, in Hebrew', () => {
    const [row] = rows;
    expect(analyticI18n.getFixedT('he')('guideLocusChip', { lines: row.needs!.join(' · '), point: row.point }).replace(/[⁦-⁩]/g, '')).toBe(
      'הקלידו את הנתונים A(0,0) · B(4,0) · נקודה M · MA = MB, ואז לחצו על הכפתור בשורה של M.',
    );
  });

  it('is never taught to the model', () => {
    expect(JSON.stringify(PROMPT_SPEC_ANALYTIC.vocabulary('he'))).not.toContain(rows[0].he);
  });
});

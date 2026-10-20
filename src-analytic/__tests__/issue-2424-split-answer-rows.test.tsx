/**
 * #2424 (ADR-AG-326) — A SENTENCE THE AI SPLITS INTO PARTS SHOWS ONE ROW PER PART, WORDED AS THE PART.
 *
 * Operator, 2026-10-20 (playing round #2414 T21): *"the part where an input is separated into 2 is not clear to users
 * since they just see the same line twice. so it looks like a bug"*. Ruling the same day: **(c)** — one row per
 * part, each showing its own line, as 2-D does. A one-line AI answer still shows the student's sentence (#1297).
 *
 * Class: every surface that names a row by its text read `spokenFor[i] ?? line`, so each part of a split answer
 * showed the same sentence. The rule now lives in one function (`rowShownText`), next to the marker's writer and
 * reader. The marker itself stays stored: the question export (#1872) still prints the sentence ONCE.
 *
 * The locks: the real store writer (`recordLlmLines`), the real App render (server-side, the #1473 harness), the
 * real save → load (`loadAnalyticSession`), and the real export (`questionLines`). The fixture carries the lines a
 * model would emit for T21's first sentence (rule 2: the session is the oracle — the catalog's canonical pair,
 * catalogAnalytic.ts F5 «מרכז המעגל I הוא K» with its `needs` line), which build through the real parse path.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { analyticI18n } from '../i18n';
import { rowShownText, spokenPart, useAnalyticStore } from '../store/useAnalyticStore';
import { loadAnalyticSession } from '../app/loadSession';
import { questionLines } from '../app/questionLines';
import { activeOf } from '../app/active';
import { derive } from '../engine/derive';
import { stripFormatControls } from '../../shell/bidi';
import t21 from './fixtures/issue-2424-split-answer-t21.analytic.json';

vi.mock('../store/useAnalyticStore', async (importOriginal) => {
  const m = await importOriginal<typeof import('../store/useAnalyticStore')>();
  const real = m.useAnalyticStore;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useAnalyticStore: Object.assign(live, real) };
});

const store = () => useAnalyticStore.getState();

/** The givens list's rows, as the student reads them (tags and bidi isolates stripped, whitespace folded). */
function factRows(): string[] {
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={analyticI18n}>
      <App />
    </I18nextProvider>,
  );
  const list = html.match(/<ul[^>]*data-testid="analytic-facts"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  return [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) =>
    stripFormatControls(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
  );
}

/** A row's text with spaces dropped — MathText typesets the maths, so compare the letters, not the spacing. */
const squash = (s: string) => s.replace(/\s+/g, '');

beforeEach(() => {
  store().clearAll();
  void analyticI18n.changeLanguage('he');
});

describe('#2424 — the rule, one function', () => {
  it('an unmarked sentence is shown; a part is not; a typed row shows its line', () => {
    expect(rowShownText('line l1: y=x', 'המשפט שלי')).toBe('המשפט שלי');
    expect(rowShownText('line l1: y=x', spokenPart('המשפט שלי', 0, 2))).toBe('line l1: y=x');
    expect(rowShownText('line l1: y=x', spokenPart('המשפט שלי', 2, 3))).toBe('line l1: y=x');
    expect(rowShownText('A(0,0)', undefined)).toBe('A(0,0)');
  });
});

describe('#2424 — the givens list (the real App)', () => {
  it('a 2-part answer shows each part’s own line, and the sentence nowhere', () => {
    store().recordLlmLines('שני ישרים נוספים', ['נתון הישר l2: x+3y-10=0', 'נתון הישר l3: y=x']);
    const rows = factRows();
    expect(rows.length).toBe(2);
    expect(squash(rows[0])).toContain(squash('l2'));
    expect(squash(rows[0])).toContain('+3y');
    expect(squash(rows[1])).toContain(squash('l3'));
    for (const r of rows) {
      expect(r).not.toContain('שני ישרים נוספים');
      expect(r).not.toMatch(/\(\d\/\d\)/);
    }
    // the marker is still the stored truth the export reads
    expect(store().spokenFor).toEqual({ 0: 'שני ישרים נוספים (1/2)', 1: 'שני ישרים נוספים (2/2)' });
  });

  it('a 3-part answer shows three different rows', () => {
    store().recordLlmLines('שלוש נקודות', ['A(0,0)', 'B(4,0)', 'C(0,3)']);
    const rows = factRows().map(squash);
    expect(rows.length).toBe(3);
    expect(rows[0]).toContain('A(0,0)');
    expect(rows[1]).toContain('B(4,0)');
    expect(rows[2]).toContain('C(0,3)');
    expect(new Set(rows).size).toBe(3);
  });

  it('a 1-line answer still shows the student’s own sentence (#1297, unchanged)', () => {
    store().recordLlmLines('משוואת ישר 1 היא 2x-y+8=0', ['נתון הישר l1: 2x-y+8=0']);
    const rows = factRows();
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain('משוואת ישר');
    expect(rows[0]).not.toContain('נתון הישר');
  });

  it('a typed row and an AI single-line row beside a split answer each keep their own rule', () => {
    store().recordLine('A(0,0)');
    store().recordLlmLines('בעברית', ['B(4,0)']);
    store().recordLlmLines('שתיים', ['C(0,3)', 'D(4,3)']);
    const rows = factRows().map(squash);
    expect(rows[0]).toContain('A(0,0)');
    expect(rows[1]).toContain('בעברית');
    expect(rows[2]).toContain('C(0,3)');
    expect(rows[3]).toContain('D(4,3)');
  });
});

describe('#2424 — T21’s first sentence, split by the model (the fixture: the oracle’s lines)', () => {
  const SENTENCE = 'נתון מעגל I שמשוואתו (x − 3)² + (y − 4)² = 9 , ומרכזו בנקודה K .';

  it('the oracle’s lines build: circle I with its equation, and K its centre at (3, 4)', () => {
    const d = derive(t21.lines, 0);
    expect(d.faults).toEqual([]);
    const k = d.figure.points.find((p) => p.id === 'K');
    expect(k).toBeDefined();
    expect(k!.x).toBeCloseTo(3, 9);
    expect(k!.y).toBeCloseTo(4, 9);
  });

  it('an OLD save carrying the part markers loads clean and lists the two lines, not the sentence twice', () => {
    const r = loadAnalyticSession(JSON.parse(JSON.stringify(t21)) as Record<string, unknown>, 'file');
    expect(r.failed).toBe(0);
    expect(store().spokenFor[0]).toBe(`${SENTENCE} (1/2)`); // the stored marker survives the load
    const rows = factRows();
    expect(rows.length).toBe(2);
    expect(rows[0]).toContain('מעגל I');
    expect(squash(rows[1])).toContain(squash('מרכז המעגל I הוא K'));
    for (const row of rows) expect(row).not.toContain('ומרכזו בנקודה');
  });

  it('the question export still prints the student’s sentence ONCE (#1872)', () => {
    const lines = [...t21.lines];
    const spokenFor = Object.fromEntries(Object.entries(t21.spokenFor).map(([k, v]) => [Number(k), v]));
    const d = derive(activeOf(lines, []), 0);
    expect(questionLines(lines, [], spokenFor, new Set(d.construction.objects.map((o) => o.id)))).toEqual([SENTENCE]);
  });
});

describe('#2424 — every surface that names a row reads the one rule', () => {
  it('App.tsx names no row through `spokenFor[...] ?? …` any more', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    expect(src).not.toMatch(/spokenFor\[[^\]]+\]\]?\s*\?\?/);
    expect(src.match(/rowShownText\(/g)?.length).toBe(3);
  });
});

/**
 * PR #1637 phase B, group G3 (app / render) — ADR-AG-199.
 *
 * #1644 — «the −2 is not shown correctly» (PR #1637 T5, corpus 7/5). MEASURED before fixing: the canvas
 * label already read `C(4, -2)` in ASCII, with its glyphs laid out in order; the «2-» the operator saw
 * was the DATA PANEL's option row, «A = [(3/5, 4/5)] או (4, -2)», where the coordinate after the Hebrew
 * joiner «או» was swept into the right-to-left run. The row now goes through `panelRowText`, the one
 * display function every panel row calls. The canvas-label equality the issue asked for is kept too,
 * as a regression guard on the surface it named.
 *
 * #1632 — a loaded file lost the AI rows' display sentences: `loadAnalyticSession` never passed the
 * saved `spokenFor` to `restore`. The class lock is a WHOLE-ENVELOPE round trip: every field
 * `serialize` writes must come back from a load, so the next field added cannot be dropped silently.
 *
 * Every assertion CALLS the code the App calls (#1102): `buildScene`, `pointText`, `panelRowText`,
 * the store's `serialize`, and `loadAnalyticSession`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { buildScene } from '../render/scene';
import { pointText } from '../app/pointText';
import { panelKnowledge, panelRowText, slopeRowText } from '../app/panelRows';
import { analyticI18n } from '../i18n';
import { loadAnalyticSession } from '../app/loadSession';
import { fmtAnalytic } from '../format';
import { useAnalyticStore } from '../store/useAnalyticStore';

const BOX = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
const T5 = [
  'במעגל שמרכזו M המיתרים AB ו-BC שווים (ראה סרטוט)',
  'משוואת המעגל היא: (x − 3)² + (y − 1)² = 10',
  'נתון: C(4,−2)',
  'הישר BC מקביל לציר ה-x',
];
const FSI = String.fromCharCode(0x2068);
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

const labelOf = (lines: string[], id: string): string => {
  const p = buildScene(derive(lines, 0).figure, BOX, 600, 600).points.find((q) => q.id === id);
  return p ? `${p.label}(${(p.coords ?? []).map((c) => c.text + (c.sub ?? '')).join(', ')})` : '';
};

describe('#1644 — a stated coordinate with a Unicode minus', () => {
  it('the canvas label of «C(4,−2)» equals the label of «C(4,-2)», with no U+2212', () => {
    const typographic = labelOf(['נתון: C(4,−2)'], 'C');
    expect(typographic).toBe(labelOf(['נתון: C(4,-2)'], 'C'));
    expect(typographic).toBe('C(4, -2)');
    expect(typographic).not.toContain('−');
    // the operator's whole 7/5 sequence draws the same label
    expect(labelOf(T5, 'C')).toBe('C(4, -2)');
  });

  it('#1497 — the format of entry is kept: a stated 2/3 stays 2/3 on the label', () => {
    expect(labelOf(['נתון: C(2/3,−1/2)'], 'C')).toBe('C(2/3, -1/2)');
  });

  it('the panel option row isolates the Hebrew joiner, so «או» cannot swallow the coordinate after it', () => {
    // A figure with a GENUINE two-answer point: C on either side of AB. (This lock first used the operator's
    // 7/5 figure, whose «או» rows were themselves the #1638 defect — two letters collapsing onto one point.
    // With #1638 fixed 7/5 shows one value, so the case needs a figure that really has two.)
    const d = derive(['A(0,0)', 'B(4,0)', 'נקודה C', 'AC = 3', 'BC = 3'], 0);
    const pk = panelKnowledge(d);
    const rows = pk.points.map(({ id, x, y }) => `${id} = ${pointText(d, id, x, y, fmtAnalytic)}`);
    const optionRows = rows.filter((r) => r.includes(' או '));
    expect(optionRows.length).toBeGreaterThan(0); // the figure has an option row — the case is exercised
    for (const r of optionRows) {
      const shown = panelRowText(r);
      // the Hebrew joiner is its own island, so the coordinate after it keeps the row's direction
      // (the option not currently drawn is bracketed, «או [(2, -2.24)]» — the joiner isolates the same way)
      expect(shown).toMatch(new RegExp(` ${FSI}או${PDI} [[(]`));
      // every Hebrew letter of the row sits inside an isolate
      expect(shown.replace(new RegExp(`${FSI}[^${PDI}]*${PDI}`, 'g'), '')).not.toMatch(/[א-ת]/);
      // nothing is lost: stripping the isolates gives the row back
      expect(shown.replace(/[\u2066-\u2069]/g, '')).toBe(r);
    }
    expect(panelRowText('A = [(3/5, 4/5)] או (4, -2)')).toBe(`A = [(3/5, 4/5)] ${FSI}או${PDI} (4, -2)`);
  });

  it('a row with no Hebrew is returned without invisible characters', () => {
    expect(panelRowText('C = (4, -2)')).toBe('C = (4, -2)');
    expect(panelRowText('B = (x_B, 0)')).toBe('B = (x_{B}, 0)');
  });

  it('a row composed with its own isolates (the equations row, a t() string) is never nested', () => {
    const named = `${FSI}ישר 3${PDI}: 3x + 2y - 2 = 0`;
    expect(panelRowText(named)).toBe(named);
    const tString = `AB: ${LRI}x${PDI} ציר`;
    expect(panelRowText(tString)).toBe(tString);
  });
});

const store = () => useAnalyticStore.getState();

beforeEach(() => {
  store().clearAll();
  useAnalyticStore.temporal.getState().clear();
});

describe('#1632 — a saved file loads with everything it saved', () => {
  it('the AI lane’s display sentences survive save → load', () => {
    store().recordLine('A(0,0)');
    store().recordLlmLines('הנקודה B נמצאת ארבע יחידות מימין ל-A', ['B(4,0)']);
    const before = store().spokenFor;
    expect(before).toEqual({ 1: 'הנקודה B נמצאת ארבע יחידות מימין ל-A' });

    const saved = JSON.parse(JSON.stringify(store().serialize()));
    store().clearAll();
    expect(store().spokenFor).toEqual({});

    loadAnalyticSession(saved, 'file');
    expect(store().lines).toEqual(['A(0,0)', 'B(4,0)']);
    expect(store().spokenFor).toEqual(before);
  });

  it('CLASS LOCK: every field serialize writes comes back from a load (the whole envelope round-trips)', () => {
    store().restore({
      lines: ['A(0,0)', 'B(4,0)', 'M אמצע AB'],
      seed: 3,
      name: 'שאלה 7',
      spokenFor: { 2: 'M היא אמצע הקטע AB' },
      disabled: [2],
      seedNames: { A: 'B', B: 'A' },
      // #1653 (ADR-AG-201) — the segment display choices joined the envelope
      segStyle: { 'A|B': { dashed: true }, 'A|M': { hidden: true } },
    });
    const saved = JSON.parse(JSON.stringify(store().serialize()));
    // the fixture exercises every optional field — a field added to `serialize` without a value here
    // shows up as a key this list does not have, and fails the next line
    expect(Object.keys(saved).sort()).toEqual(['app', 'disabled', 'lines', 'name', 'seed', 'seedNames', 'segStyle', 'spokenFor', 'version']);

    store().clearAll();
    loadAnalyticSession(saved, 'fallback');
    expect(JSON.parse(JSON.stringify(store().serialize()))).toEqual(saved);
  });

  it('a hand-edited file cannot attach a sentence to a row it does not have', () => {
    loadAnalyticSession(
      { app: 'analytic-builder', version: 1, lines: ['A(0,0)'], seed: 0, spokenFor: { 0: 'נקודה A בראשית', 5: 'רוח', x: 'לא', 1: 7 } },
      'f',
    );
    expect(store().spokenFor).toEqual({ 0: 'נקודה A בראשית' });
  });
});

describe('#1646 — the «שיפועים» row keeps its parts in a fixed order', () => {
  // The REAL label strings, through the i18n post-processor the App's `t()` runs (isolates included).
  const he = (key: string) => analyticI18n.t(key, { lng: 'he' });

  it('the Hebrew angle label is ONE right-to-left island, its own inner isolate balanced inside it', () => {
    const label = he('angleWithX');
    const row = panelRowText(slopeRowText('AB', '2', label, '63.43°'));
    expect(row).toBe(`AB: 2 · ${FSI}${label}${PDI}: 63.43°`);
    // fixed order: name, slope, label island, angle
    const stripped = row.replace(/[\u2066-\u2069]/g, '');
    expect(stripped).toBe('AB: 2 · זווית עם ציר ה-x: 63.43°');
    // every isolate opened is closed, and no Hebrew letter sits outside the label's island
    let depth = 0;
    for (const ch of row) {
      if (ch >= '\u2066' && ch <= '\u2068') depth++;
      else if (ch === PDI) depth--;
      else if (/[א-ת]/.test(ch)) expect(depth).toBeGreaterThan(0);
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('the vertical verdict is an island too, and the English UI row has no invisible characters', () => {
    const row = slopeRowText('BC', he('slopeVertical'), he('angleWithX'), '90°');
    expect(row.startsWith(`BC: ${FSI}`)).toBe(true);
    expect(row.replace(/[\u2066-\u2069]/g, '')).toBe('BC: אנכי (אין שיפוע) · זווית עם ציר ה-x: 90°');
    const en = (key: string) => analyticI18n.t(key, { lng: 'en' });
    expect(slopeRowText('AB', '2', en('angleWithX'), '63.43°')).toBe('AB: 2 · angle with the x-axis: 63.43°');
  });
});

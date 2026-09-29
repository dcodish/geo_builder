/**
 * #1473 (ADR-AG-180) — THE PAGE, MID-POOL: a value not yet confirmed over every configuration is shown as
 * «בודק…», NEVER as a provisional number (operator ruling 2026-09-29, option B′).
 *
 * The real `App` is rendered (server-side, so no effect runs — which is exactly the state between the
 * render and the after-render completion of the configuration pool). The store hook is swapped for one
 * that reads the live state, because the server renderer otherwise reads the store's INITIAL state.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { analyticI18n } from '../i18n';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { derive } from '../engine/derive';
import { configurationPool, settled } from '../engine/evaluate';
import { panelKnowledge } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { completePoolAfterRender } from '../app/poolScheduler';
import { stripFormatControls } from '../../shell/bidi';
import { studentFacingViolations } from '../../shell/studentText';

vi.mock('../store/useAnalyticStore', async (importOriginal) => {
  const m = await importOriginal<typeof import('../store/useAnalyticStore')>();
  const real = m.useAnalyticStore;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useAnalyticStore: Object.assign(live, real) };
});

/** The page's visible text, one normalised string (tags and bidi isolates stripped). */
function page(lines: string[], questions: string[] = [], lng: 'he' | 'en' = 'he'): string {
  useAnalyticStore.getState().restore({ lines });
  useAnalyticStore.setState({ queries: questions.map((sentence) => ({ sentence, shown: true })) });
  void analyticI18n.changeLanguage(lng);
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={analyticI18n}>
      <App />
    </I18nextProvider>,
  );
  void analyticI18n.changeLanguage('he');
  return stripFormatControls(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}

const PART_B = [
  'נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2', 'k הוא פרמטר',
  'נתון הישר 3: (k+1)x+2y-12+5k=0', 'N על הישר 3', 'M נקודת החיתוך של הישר 3 עם ציר ה-y', 'דרך M עובר ישר l4',
  'A נקודת החיתוך של הישר l4 עם הישר 1', 'B נקודת החיתוך של הישר l4 עם הישר 2', 'M אמצע AB',
];
const CHECKING = 'בודק…';

describe('#1473 — mid-pool, the page shows «בודק…» and never a number', () => {
  it('the 572 exam’s line 11 (the one line whose pool completes after the render): A, B, k, l4 and the ask are «בודק…»', () => {
    const text = page(PART_B, ['A']);
    for (const row of ['A = ', 'B = ', 'M = ', 'N = ', 'k = ']) expect(text, row).toContain(`${row}${CHECKING}`);
    expect(text).toContain(`l4: ${CHECKING}`);
    // the settled values — A(−4, 0), B(4, 2), k = 2 — are NOT on the page yet: nothing provisional
    expect(text).not.toMatch(/A = \(-4, 0\)|B = \(4, 2\)|k = 2\b/);
    // the ask lane answers from the same gates, wrapped once (`askSettled`): the panel row AND the answer row
    expect(text.split(`A = ${CHECKING}`).length - 1).toBe(2);
  });

  it('T6: on the area triangle the C row never shows «−4» alone, even before the check completes', () => {
    const text = page(['משולש ABC', 'A(0,0)', 'B(6,0)', 'שטח המשולש ABC הוא 12'], ['C']);
    const cRow = text.match(/C = [^A-Z]*/g) ?? [];
    expect(cRow.length).toBeGreaterThan(0);
    for (const r of cRow) expect(r).not.toContain('-4');
  });

  it('«בודק…» names only what the student can see, in both locales (ADR-W-096)', () => {
    const d = derive(PART_B, 0);
    const names = [...d.figure.points.map((p) => p.id), ...d.figure.curves.map((c) => c.label.name), 'k'];
    const heRows = (page(PART_B).match(/[A-Za-z0-9]+ = בודק…/g) ?? []);
    expect(heRows.length).toBeGreaterThan(3);
    expect(studentFacingViolations(heRows, { typed: PART_B.join(' '), names })).toEqual([]);
    // English: the product's own translated word is part of the vocabulary the checker allows
    const en = analyticI18n.getFixedT('en')('checking');
    expect(en).not.toBe(CHECKING);
    const enRows = page(PART_B, [], 'en').match(/[A-Za-z0-9]+ = checking…/g) ?? [];
    expect(enRows.length).toBeGreaterThan(3);
    expect(studentFacingViolations(enRows, { typed: `${PART_B.join(' ')} ${en}`, names })).toEqual([]);
  });

  it('a figure whose pool the render itself completes settles BEFORE paint (the layout effect), never after', () => {
    // An open point's option walk — the walk the render always paid — completes the pool mid-render, after
    // earlier rows read pending. The page's layout effect then settles synchronously: no slice, no
    // visible «בודק…». Asserted on the real render path + the real scheduler.
    const d = derive(['A(0,0)', 'B(4,0)', 'נקודה C'], 0);
    const pool = configurationPool(d.construction);
    pool.defer();
    const pk = panelKnowledge(d);
    for (const p of pk.points) settled(() => pointText(d, p.id, p.x, p.y, String));
    expect(pool.pendingShown).toBe(true);
    expect(pool.complete()).toBe(true);
    let settledNow = 0;
    completePoolAfterRender(pool, () => (settledNow += 1), { schedule: () => { throw new Error('no slice may be needed'); }, cancel: () => {} });
    expect(settledNow).toBe(1);
    const a = panelKnowledge(d).points.find((p) => p.id === 'A')!;
    expect(pointText(d, 'A', a.x, a.y, String)).toBe('(0, 0)');
  });

  it('the canvas point labels never read the pool: identical mid-check and settled on every 572 line', () => {
    // Browser pre-play (round #1559): the canvas read «M(0, y_M)» while the panel said «בודק…». Measured:
    // that label is `figure.provenance` — the point's OWN givens («M on the y-axis» fixes x = 0 and says
    // nothing of y), computed inside `evaluate`, syntactically — so it is the same before, during and after
    // the check, and the same as before #1473. It is not a partial-pool verdict. Locked so it stays one.
    for (let n = 1; n <= PART_B.length; n += 1) {
      const mid = derive(PART_B.slice(0, n), 0);
      configurationPool(mid.construction).defer();
      panelKnowledge(mid);
      const during = JSON.stringify(mid.figure.provenance);
      configurationPool(mid.construction).fill();
      expect(JSON.stringify(mid.figure.provenance), `line ${n}`).toBe(during);
      expect(JSON.stringify(derive(PART_B.slice(0, n), 0).figure.provenance), `line ${n}`).toBe(during);
    }
  });

  it('App renders the pool’s completion from a LAYOUT effect, keyed on the derivation', () => {
    const src = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    expect(src).toMatch(/useLayoutEffect\(\(\) => completePoolAfterRender\(configurationPool\(d\.construction\)/);
    expect(src).toContain('configurationPool(out.construction).defer()');
  });
});

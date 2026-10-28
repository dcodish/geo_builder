/**
 * #2583 (ADR-AG-345) — A HELPER IS ON NO STUDENT SURFACE. The perpendicular bisector's unnamed midpoint is placed for its
 * line and is no point of the figure (operator ruling 2026-10-27 «B»): the canvas leaves it out (`figure.points`), and so
 * must every list the student reads — the data panel's «נקודות», the rename's letters — through the one enumerator,
 * `positionalOf`. Pre-play of round #2585 found the panel listing «~mid:E,K = –»: the panel read the construction, not
 * the figure.
 *
 * The lock is ADR-W-096's id-shape guard (`studentFacingViolations`) run over the panel MODEL and over the whole rendered
 * PAGE. The older page guard (#1473) only scanned rows shaped `[A-Za-z0-9]+ = …`, a pattern an id beginning with «~»
 * cannot match — which is why it never saw this one.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { analyticI18n } from '../i18n';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { panelKnowledge } from '../app/panelRows';
import { stripFormatControls } from '../../shell/bidi';
import { studentFacingViolations } from '../../shell/studentText';

vi.mock('../store/useAnalyticStore', async (importOriginal) => {
  const m = await importOriginal<typeof import('../store/useAnalyticStore')>();
  const real = m.useAnalyticStore;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useAnalyticStore: Object.assign(live, real) };
});

/** The page's visible text, tags and bidi isolates stripped. */
function page(lines: string[]): string {
  useAnalyticStore.getState().restore({ lines });
  const html = renderToStaticMarkup(
    <I18nextProvider i18n={analyticI18n}>
      <App />
    </I18nextProvider>,
  );
  return stripFormatControls(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
}

/** Only the id-shape findings: the page's prose is the locale's, and judging its words is the message floor's job. */
const idShaped = (values: string[], typed: string) =>
  studentFacingViolations(values, { typed, names: [] }).filter((v) => v.startsWith('id-shaped'));

const T30 = ['M(1,2)', 'K(1,0)', 'נקודה E', 'E על הישר x = -1', 'דרך E עובר ישר l1 מקביל לציר ה-x', 'l2 אנך אמצעי ל-EK', 'G נקודת החיתוך של הישר l1 עם הישר l2'];
const BARE = ['K(1,0)', 'נקודה E', 'E על הישר x = -1', 'אנך אמצעי ל-EK'];
const NAMED = [...BARE, 'P אמצע EK'];

describe('#2583 — the bisector’s helper midpoint is on no student surface', () => {
  for (const [label, lines, want] of [
    ['T30', T30, ['M', 'K', 'E', 'G']],
    ['the unnamed bisector', BARE, ['K', 'E']],
    ['named afterwards', NAMED, ['K', 'E', 'P']],
  ] as const) {
    it(`${label}: the panel model lists exactly the figure’s points, and no id-shaped token`, () => {
      const d = derive([...lines], 0);
      const listed = panelKnowledge(d).points.map((p) => p.id);
      expect(listed).toEqual(d.figure.points.map((p) => p.id));
      expect([...listed].sort()).toEqual([...want].sort());
      expect(idShaped(listed, lines.join(' '))).toEqual([]);
    });

    it(`${label}: the rendered page carries no id-shaped token`, () => {
      const text = page([...lines]);
      expect(text).toContain('E = ');
      expect(idShaped([text], lines.join(' '))).toEqual([]);
    });
  }
});

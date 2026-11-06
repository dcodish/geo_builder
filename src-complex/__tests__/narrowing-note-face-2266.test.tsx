/**
 * #2266 (ADR-W-180) — complex's «two named numbers on one dot» note turns from amber to 2-D's blue ⓘ strip, its words
 * unchanged (judged 2026-11-05, q13). The real App, server-rendered, over the lines the real submit decision records.
 * Complex has no forced-narrowing note: this is its one note on the face.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { decideSubmitCx } from '../app/submit';
import { complexI18n } from '../i18n';
import { useComplexStore } from '../store/useComplexStore';
import { noteFaceFaults, noteMarkup } from '../../shell/__tests__/fixtures/narrowing-note-rows';

vi.mock('../store/useComplexStore', async (importOriginal) => {
  const m = await importOriginal<typeof import('../store/useComplexStore')>();
  const real = m.useComplexStore;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useComplexStore: Object.assign(live, real) };
});

describe('#2266 — complex: the two-numbers note’s face', () => {
  it('the ⓘ, on the blue information strip', () => {
    const lines: string[] = [];
    let seed = 0;
    for (const line of ['z1 = 2+3i', 'z2 = 2+3i']) {
      const v = decideSubmitCx({ lines, disabled: [], seed }, line);
      if (v.kind !== 'record') throw new Error(`did not record: ${line}`);
      lines.push(v.line);
      seed = v.seed;
    }
    useComplexStore.setState({ lines, seed });
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={complexI18n}>
        <App />
      </I18nextProvider>,
    );
    const note = noteMarkup(html, 'converge-note');
    expect(note).toContain('נפלו על אותה נקודה');
    expect(noteFaceFaults(note, 'complex')).toEqual([]);
  });
});

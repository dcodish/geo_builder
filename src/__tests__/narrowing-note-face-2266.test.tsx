/**
 * #2266 (ADR-W-180) — 2-D's forced-narrowing note, the reference: the real App, server-rendered, shows the ⓘ on the blue
 * information strip, now through the suite's one `NarrowingNote`. For a student this builder is unchanged.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import App from '@/App';
import i18n from '@/i18n';
import { replay, useGeoStore } from '@/store/geoStore';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import type { RingNote } from '../../shell/narrowing';
import { noteFaceFaults, noteMarkup } from '../../shell/__tests__/fixtures/narrowing-note-rows';

vi.mock('@/store/geoStore', async (importOriginal) => {
  const m = await importOriginal<typeof import('@/store/geoStore')>();
  const real = m.useGeoStore;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useGeoStore: Object.assign(live, real) };
});

describe('#2266 — 2-D: the forced-narrowing note’s face', () => {
  it('the ⓘ, on the blue information strip', () => {
    const list: RingNote[] = [{ ring: 'ABCD', now: 'square', a: 'rectangle', b: 'rhombus' }];
    useGeoStore.setState((st) => ({ narrowed: { facts: st.facts, list } }));
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>,
    );
    const note = noteMarkup(html, 'narrowed-note');
    expect(note).toContain('ABCD');
    expect(noteFaceFaults(note, '2d')).toEqual([]);
  });

  it('two letters on one dot, on the same strip (judged 2026-11-05, q13)', async () => {
    useGeoStore.getState().clear();
    for (const line of ['משולש ABC', 'AB=4', 'נקודה D על AB', 'AD=4']) {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      const v = (await decideDeterministic2D(
        { facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } } as never,
        line,
        'he',
      )) as never as { kind: string };
      if (v.kind !== 'store-op') commitVerdict(v as never, line);
    }
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>,
    );
    const note = noteMarkup(html, 'converge-note');
    expect(note).toContain('נפלו על אותה נקודה');
    expect(noteFaceFaults(note, '2d')).toEqual([]);
  });
});

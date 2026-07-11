/**
 * Issue #42 — a persistent figure NAME: shown on the page, used as the save filename, derived
 * from the loaded file's name. Store semantics: session metadata OUTSIDE the undo history
 * (renaming the diagram is not a construction step) and reset by `clear`. Filename derivation:
 * `figureNameFromFileName` is the inverse of `namedFigureFileName` (drop extensions + the
 * per-product `-geo` suffix); the FILENAME wins on load — the embedded `name` is provenance only.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGeoStore } from '@/store/geoStore';
import { deserializeFigure, figureNameFromFileName, namedFigureFileName, serializeFigure } from '@/store/figureFile';

describe('issue #42 — figureNameFromFileName (the filename → name inverse)', () => {
  it('strips the .json extension and the -geo save suffix', () => {
    expect(figureNameFromFileName('2026summer-geo.json')).toBe('2026summer');
    expect(figureNameFromFileName('2026 קיץ מועד א-geo.json')).toBe('2026 קיץ מועד א');
    expect(figureNameFromFileName('foo.json')).toBe('foo');
    expect(figureNameFromFileName('foo-GEO.json')).toBe('foo'); // case-insensitive suffix
    // The pre-#20 date-stamped default is a real name too.
    expect(figureNameFromFileName('figure-2026-07-11.geo.json')).toBe('figure-2026-07-11');
  });

  it('round-trips through namedFigureFileName', () => {
    const d = new Date('2026-07-11T12:00:00Z');
    for (const name of ['2026summer', 'עמוד 78 שאלה 4', 'bagrut Q4']) {
      expect(figureNameFromFileName(namedFigureFileName(name, d))).toBe(name);
    }
  });
});

describe('issue #42 — the store name: outside undo, reset by clear', () => {
  beforeEach(() => {
    useGeoStore.getState().clear();
  });

  it('setFigureName sets; undo does NOT revert it (not a construction step)', () => {
    const st = () => useGeoStore.getState();
    st().execute({ type: 'triangle', ids: ['A', 'B', 'C'] }, 'משולש ABC', 'g0');
    st().setFigureName('bagrut Q4');
    expect(st().figureName).toBe('bagrut Q4');
    useGeoStore.temporal.getState().undo(); // reverts the triangle…
    expect(st().facts).toHaveLength(0);
    expect(st().figureName).toBe('bagrut Q4'); // …but never the name
  });

  it('clear resets the name', () => {
    useGeoStore.getState().setFigureName('temp');
    useGeoStore.getState().clear();
    expect(useGeoStore.getState().figureName).toBe('');
  });
});

describe('issue #42 — the saved file embeds the name (provenance only)', () => {
  it('serialize embeds; deserialize passes it through', () => {
    const json = serializeFigure(
      { facts: [{ id: 'g0.0', utterance: 'משולש ABC', group: 'g0', cmd: { type: 'triangle', ids: ['A', 'B', 'C'] }, enabled: true }], seed: 0, radiusOverrides: {} },
      { name: 'bagrut Q4' },
    );
    expect(JSON.parse(json).name).toBe('bagrut Q4');
    const r = deserializeFigure(json);
    expect(r.ok && r.file.name).toBe('bagrut Q4');
  });

  it('a name-less file stays name-less (older files load unchanged)', () => {
    const json = serializeFigure(
      { facts: [{ id: 'g0.0', cmd: { type: 'triangle', ids: ['A', 'B', 'C'] }, enabled: true }], seed: 0, radiusOverrides: {} },
    );
    expect('name' in JSON.parse(json)).toBe(false);
    const r = deserializeFigure(json);
    expect(r.ok && !('name' in r.file)).toBe(true);
  });
});

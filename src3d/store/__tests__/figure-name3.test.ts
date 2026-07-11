/**
 * Issue #42 — the persistent figure NAME, 3-D edition (COPIED per the isolation rule, never shared):
 * outside the undo history, reset by `clear`, filename ⇄ name inverses (`-vectors` suffix), and the
 * saved file embeds the name as provenance only (on load the FILENAME wins — operator ruling).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deserializeFigure3, figureNameFromFileName3, namedFigureFileName3, serializeFigure3 } from '../figureFile3';
import { useGeo3 } from '../store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, figureName: '', lastError: null });
  useGeo3.temporal.getState().clear();
}

describe('issue #42 (3-D) — figureNameFromFileName3', () => {
  it('strips the .json extension and the -vectors save suffix', () => {
    expect(figureNameFromFileName3('2026summer-vectors.json')).toBe('2026summer');
    expect(figureNameFromFileName3('2022 חורף-vectors.json')).toBe('2022 חורף');
    expect(figureNameFromFileName3('foo.json')).toBe('foo');
    expect(figureNameFromFileName3('vectors-2026-07-11.geo3.json')).toBe('vectors-2026-07-11');
  });

  it('round-trips through namedFigureFileName3', () => {
    const d = new Date('2026-07-11T12:00:00Z');
    for (const name of ['2026summer', '2022 קיץ Q2']) {
      expect(figureNameFromFileName3(namedFigureFileName3(name, d))).toBe(name);
    }
  });
});

describe('issue #42 (3-D) — the store name: outside undo, reset by clear', () => {
  beforeEach(reset);

  it('setFigureName sets; undo does NOT revert it', () => {
    const st = () => useGeo3.getState();
    st().submit('קובייה ABCD');
    st().setFigureName('2022 Q2');
    expect(st().figureName).toBe('2022 Q2');
    useGeo3.temporal.getState().undo();
    expect(st().facts).toHaveLength(0);
    expect(st().figureName).toBe('2022 Q2');
  });

  it('clear resets the name', () => {
    useGeo3.getState().setFigureName('temp');
    useGeo3.getState().clear();
    expect(useGeo3.getState().figureName).toBe('');
  });
});

describe('issue #42 (3-D) — the saved file embeds the name (provenance only)', () => {
  it('serialize embeds the name; a name-less save stays name-less; load still parses both', () => {
    useGeo3.getState().submit('קובייה ABCD');
    const { facts, seed } = useGeo3.getState();
    const named = serializeFigure3(facts, seed, '2022 Q2');
    expect(JSON.parse(named).name).toBe('2022 Q2');
    expect(deserializeFigure3(named).ok).toBe(true);
    const bare = serializeFigure3(facts, seed);
    expect('name' in JSON.parse(bare)).toBe(false);
    expect(deserializeFigure3(bare).ok).toBe(true);
  });
});

/** #1348 (ADR-W-095) — his exact line: «BC>=10» is honoured and RECORDED as «BC≥10» (the row, the save, the export). */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '../parser/parse';
import { useGeoStore } from '../store/geoStore';

beforeEach(() => useGeoStore.getState().clear?.());

describe('#1348 — a typed >= records as ≥', () => {
  it('«BC>=10» after a triangle', () => {
    for (const u of ['משולש ABC', 'BC>=10']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) for (const c of r.commands) useGeoStore.getState().execute(c, u);
    }
    const utterances = useGeoStore.getState().facts.map((f) => f.utterance);
    expect(utterances).toContain('BC≥10');
    expect(utterances.join('|')).not.toContain('>=');
  });
});

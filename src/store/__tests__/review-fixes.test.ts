/**
 * Regression locks for the 2026-07-03 Fable review — store findings S1/S2/S3 (see ADR-203):
 *  S1 — `relabelId` must rewrite a label at ANY position inside a concatenated structured id
 *       (`bis-ABC`'s middle letter), not only after a non-letter (the old lookbehind).
 *  S2 — RETIRED with the radius sliders (#875 / ADR-475): it locked that rename/swap remapped
 *       `radiusOverrides`, a mechanism that no longer exists.
 *  S3 — atomic-group poisoning runs to a FIXPOINT: blocking group A can make a LATER group newly
 *       mixed; its scaffolding must not survive half-drawn.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replay, useGeoStore } from '../geoStore';
import type { AnyCommand } from '@/engine';

const s = () => useGeoStore.getState();
const fig = () => replay(s().facts, s().seed);

beforeEach(() => s().clear());

describe('S1 — rename rewrites a label ANYWHERE inside a structured id', () => {
  it('rename B → P rewrites bis-ABC (middle letter) and the referencing intersection', () => {
    // Two bisectors meeting at E — the ids embed the vertex triples.
    const cmds: AnyCommand[] = [
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'bisector', id: 'bis-BAC', vertex: 'A', p: 'B', q: 'C' },
      { type: 'bisector', id: 'bis-BCA', vertex: 'C', p: 'B', q: 'A' },
      { type: 'line-intersection', id: 'E', line1: 'bis-BAC', line2: 'bis-BCA' },
    ];
    cmds.forEach((c) => s().execute(c, 'bisector meet', 'g'));
    expect(s().rename('B', 'P')).toEqual({ ok: true });
    const after = s().facts.map((f) => f.cmd);
    const bis = after.filter((c): c is Extract<AnyCommand, { type: 'bisector' }> => c.type === 'bisector');
    expect(bis.map((b) => b.id).sort()).toEqual(['bis-PAC', 'bis-PCA']); // the EMBEDDED B renamed (was stale)
    const li = after.find((c): c is Extract<AnyCommand, { type: 'line-intersection' }> => c.type === 'line-intersection');
    expect([li?.line1, li?.line2].sort()).toEqual(['bis-PAC', 'bis-PCA']); // references stay consistent
    // the figure still builds — all statuses ok
    for (const st of Object.values(fig().status)) expect(st).toBe('ok');
  });

  it('rename keeps a subscripted label intact inside an id (C → D leaves line-C1C2 alone)', () => {
    s().execute({ type: 'free-point', id: 'C', x: 0, y: 0, free: true }, 'point C');
    // a hand-crafted command carrying a subscript-bearing structured id in a string field
    s().execute({ type: 'free-point', id: 'C1', x: 1, y: 0, free: true }, 'point C1');
    expect(s().rename('C', 'D')).toEqual({ ok: true });
    const ids = s().facts.map((f) => (f.cmd as { id?: string }).id);
    expect(ids).toEqual(['D', 'C1']); // C1 is its own token — never eaten by the C rename
  });
});

describe('S3 — atomic-group poisoning reaches a fixpoint (no half-drawn cascade group)', () => {
  it('a group broken only by ROUND-1 poisoning is itself poisoned whole (no lone sibling segment survives)', () => {
    // Direct, minimal version of the verifier probe: g1 mixed (ok member + hard-fail member) owns E;
    // g2 = [segment E–K, segment P–Q] — E dies with g1, so g2 must die WHOLE (P–Q not drawn alone).
    s().execute({ type: 'free-point', id: 'E', x: 0, y: 0, free: true }, 'E', 'g1');
    s().execute({ type: 'line-intersection', id: 'X', line1: 'bis-NOP', line2: 'bis-QRS' }, 'bad meet', 'g1');
    s().execute({ type: 'segment', a: 'E', b: 'K' }, 'EK+PQ', 'g2');
    s().execute({ type: 'segment', a: 'P', b: 'Q' }, 'EK+PQ', 'g2');
    const d = fig();
    // g1 was poisoned (mixed); E is gone; g2's first member can't build → g2 must be atomic too:
    const drawn = d.construction.objects.map((o) => o.id);
    expect(drawn).not.toContain('seg-EK');
    expect(drawn, 'the cascade group may not survive half-drawn').not.toContain('seg-PQ');
    expect(d.positions.has('P')).toBe(false);
  });
});

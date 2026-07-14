/**
 * Issue #95 / ADR-317 — the BETWEEN phrasing is a free point on a segment.
 *
 * `E בין A ל-B` (E between A and B) built nothing (escalated to the LLM → built-nothing). It is exactly
 * `E על AB` — a free `point-on-segment`. `בין`/`between` are load-bearing in the ratio / angle-between /
 * swap / area-ratio rules, but those lead with a Hebrew word, so anchoring the subject to a Latin label at
 * the START (plus a keyword bow-out) keeps this from stealing them. Prod session `lrbdnp5v`.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const seg = (u: string) => {
  const r = parse(u, {});
  if (!r.ok) return null;
  return (r.commands.find((c: AnyCommand) => c.type === 'point-on-segment') ?? null) as
    | (AnyCommand & { id: string; a: string; b: string })
    | null;
};

describe('#95 — "between" builds a point on the segment', () => {
  for (const u of ['E בין A ל-B', 'E בין A ל B', 'E בין A ו-B', 'E between A and B', 'point E between A and B', 'נקודה E בין A ל-B']) {
    it(`«${u}» → point-on-segment E on AB`, () => {
      const c = seg(u);
      expect(c, `${u} should be a point-on-segment`).toBeTruthy();
      expect([c!.id, c!.a, c!.b]).toEqual(['E', 'A', 'B']);
    });
  }

  it('does NOT steal the collision rules (swap / angle-between / ratio / area-ratio)', () => {
    for (const u of ['החלף בין C ל-D', 'swap C and D', 'הזווית בין AB ל-CD', 'היחס בין AB ל-CD הוא 2', 'היחס בין שטח ABC ובין שטח DEF הוא 2']) {
      expect(seg(u), `${u} must not become a point-on-segment`).toBeNull();
    }
  });
});

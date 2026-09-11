/**
 * #554 ([ADR-503](../../../docs/06-decisions.md#adr-503)): «המשיקים נחתכים בנקודה E» after two tangents were
 * drawn ONE PER LINE — the incremental twin of the one-utterance «המשיק בנקודה B והמשיק בנקודה C … נפגשים».
 *
 * Prod, log-triage 2026-08-11 REC-2: with both tangents already drawn via the fully-supported named form,
 * the follow-up was `not-handled` — and the only row in the window where the paid LLM failed too. The
 * contextual plural existed only for the common-tangent (two-circle) family; the tangents-at-points family
 * had no follow-up form. Locks: the exact three-line prod sequence builds with E at the crossing (both
 * verbs); the English mirror; more than two tangents CLARIFIES instead of guessing; the named one-utterance
 * form is byte-identical; a bare «המשיקים …» with no tangents drawn stays not-handled (no invented figure).
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import { replay } from '@/replay/core';
import type { Fact } from '@/replay/core';

function factsFrom(steps: string[]): { facts: Fact[]; last: ReturnType<typeof parse> } {
  const facts: Fact[] = [];
  let last: ReturnType<typeof parse> = { ok: false, reason: 'not-handled' };
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    last = parse(u, buildParseCtx(construction, positions));
    if (!last.ok) break;
    for (const cmd of last.commands) facts.push({ id: `g${gi}.${facts.length}`, utterance: u, group: `g${gi}`, cmd, enabled: true });
  }
  return { facts, last };
}

const TWO_TANGENTS = ['מעגל O', 'משיק למעגל O בנקודה B', 'משיק למעגל O בנקודה C'];

describe('#554 — the incremental tangent-pair crossing', () => {
  it.each([['המשיקים נחתכים בנקודה E'], ['המשיקים נפגשים בנקודה E'], ['the tangents meet at E'], ['the tangents intersect at E']])(
    'after two drawn tangents, «%s» builds E at their crossing',
    (line) => {
      const { facts, last } = factsFrom([...TWO_TANGENTS, line]);
      expect(last.ok, `«${line}» must parse`).toBe(true);
      if (!last.ok) return;
      expect(last.commands[0]).toMatchObject({ type: 'line-intersection', id: 'E', line1: 'tan-B', line2: 'tan-C' });
      const fig = replay(facts, 0);
      expect(fig.lastError).toBeNull();
      expect(fig.violations).toEqual([]);
      const E = fig.positions.get('E')!;
      expect(E).toBeTruthy();
      // E lies on both tangents: each tangent is ⟂ its radius at the touch, so OB ⟂ BE and OC ⟂ CE
      const O0 = fig.positions.get('O')!;
      for (const id of ['B', 'C']) {
        const T = fig.positions.get(id)!;
        const dot = (T.x - O0.x) * (E.x - T.x) + (T.y - O0.y) * (E.y - T.y);
        expect(Math.abs(dot), `E lies on the tangent at ${id}`).toBeLessThan(1e-6 * Math.hypot(T.x - O0.x, T.y - O0.y) * Math.hypot(E.x - T.x, E.y - T.y));
      }
      // the two touches are on the circle and E is outside it — a real pole, not a touch point
      const O = fig.positions.get('O')!;
      const B = fig.positions.get('B')!;
      expect(Math.hypot(E.x - O.x, E.y - O.y)).toBeGreaterThan(Math.hypot(B.x - O.x, B.y - O.y) + 1e-6);
    },
  );

  it('MORE than two tangents drawn: the tool asks which two (a clarification naming the touch points), never guesses', () => {
    const { last } = factsFrom([...TWO_TANGENTS, 'משיק למעגל O בנקודה D', 'המשיקים נחתכים בנקודה E']);
    expect(last.ok).toBe(false);
    if (last.ok) return;
    expect(last.reason).toBe('tangents-ambiguous');
    if (last.reason !== 'tangents-ambiguous') return;
    expect(last.points).toEqual(['B', 'C', 'D']);
  });

  it('with NO tangents drawn the plural is still not-handled — no figure is invented', () => {
    const { last } = factsFrom(['מעגל O', 'המשיקים נחתכים בנקודה E']);
    expect(last.ok).toBe(false);
    if (last.ok) return;
    expect(last.reason).toBe('not-handled');
  });

  it('with ONE tangent drawn it is not this rule either', () => {
    const { last } = factsFrom(['מעגל O', 'משיק למעגל O בנקודה B', 'המשיקים נחתכים בנקודה E']);
    expect(last.ok).toBe(false);
  });

  it('the NAMED one-utterance form is byte-identical (twoTangentsMeet still owns it)', () => {
    const { last } = factsFrom(['מעגל O', 'המשיק בנקודה B והמשיק בנקודה C למעגל O נפגשים בנקודה E']);
    expect(last.ok).toBe(true);
    if (!last.ok) return;
    expect(last.commands).toEqual([
      { type: 'tangent', id: 'tan-B', circle: 'circle-O', at: 'B', visible: true },
      { type: 'tangent', id: 'tan-C', circle: 'circle-O', at: 'C', visible: true },
      { type: 'line-intersection', id: 'E', line1: 'tan-B', line2: 'tan-C' },
    ]);
  });

  it('a named pair beside the plural is NOT this rule («המשיקים AB ו-CD …» belongs to the common-tangent family)', () => {
    const { last } = factsFrom([...TWO_TANGENTS, 'המשיקים BE ו-CE נפגשים בנקודה E']);
    // whatever another rule makes of it, the incremental rule must not claim a sentence that names tangents
    if (last.ok) expect(last.commands[0]).not.toMatchObject({ type: 'line-intersection', line1: 'tan-B' });
  });
});

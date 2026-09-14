import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';
import { freeDofCount } from '@/engine';
import type { AnyCommand } from '@/engine';

/**
 * #248 / [ADR-516](../../docs/06-decisions.md#adr-516) — a BARE angle reference is a highlightable
 * MARKER, not an escalation.
 *
 * Prod session `quvq3txq` (2026-07-20): `זוית abc` reached the scope brush-off. Measured at HEAD before
 * this change, EVERY bare spelling — «זוית ABC», «זווית ABC», «∠ABC», «angle ABC», «זוית B», and the
 * lowercase form — returned `not-handled`, alone among its neighbours: every VALUED spelling built.
 *
 * The 3-D #94 design ported: a named angle is a marker, no DOF, no verification. The two lanes below
 * that are NOT the three-letter form (single vertex, side pair) are inherited from the `angleArms`
 * seam (#831/#967) rather than copied — locked here so a future value kind cannot quietly lose them.
 */

function ctxOf() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
}

function build(utterances: string[]) {
  const st = useGeoStore.getState();
  st.clear();
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    expect(r.ok, `setup «${u}»: ${JSON.stringify(r)}`).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) st.execute(c, u, `g-${u}`);
  }
}

const markOf = (cmds: AnyCommand[]) => cmds.find((c) => c.type === 'mark-angle') as { vertex: string; ray1: string; ray2: string } | undefined;

describe('#248 — a bare angle reference builds a marker', () => {
  it.each(['זוית ABC', 'זווית ABC', '∠ABC', 'angle ABC', 'זוית abc'])('«%s» marks the angle at B', (u) => {
    build(['משולש ABC']);
    const r = parse(u, ctxOf());
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    const m = markOf(r.commands);
    expect(m).toBeDefined();
    expect(m!.vertex).toBe('B');
    expect([m!.ray1, m!.ray2].sort()).toEqual(['A', 'C']);
  });

  it('the SINGLE-VERTEX lane is inherited from the shared arms reader — «זוית B»', () => {
    build(['משולש ABC']);
    const r = parse('זוית B', ctxOf());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(markOf(r.commands)!.vertex).toBe('B');
  });

  it('the SIDE-PAIR lane too (#967) — «הזווית בין BA ל-BC»', () => {
    build(['משולש ABC']);
    const r = parse('הזווית בין BA ל-BC', ctxOf());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = markOf(r.commands)!;
    expect(m.vertex).toBe('B');
    expect([m.ray1, m.ray2].sort()).toEqual(['A', 'C']);
  });

  it('the mark reaches the figure, states nothing, and costs no freedom', () => {
    build(['משולש ABC']);
    const before = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    const dofBefore = freeDofCount(before.construction);

    const r = parse('זוית ABC', ctxOf());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) useGeoStore.getState().execute(c, 'זוית ABC', 'g-mark');

    const after = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(after.lastError).toBeNull();
    // It is DRAWN…
    expect(after.angleMarks).toContainEqual({ vertex: 'B', ray1: 'A', ray2: 'C', right: false });
    // …and it is only a highlight: no DOF consumed (ADR-052 — the student stated no magnitude), no
    // violation, and never a right-angle knee (the arc form, as #106 established).
    expect(freeDofCount(after.construction), 'a marker states no magnitude, so it removes no freedom').toBe(dofBefore);
    expect(after.violations).toEqual([]);
    expect(after.angleMarks.every((m) => !m.right)).toBe(true);
  });

  it('a QUERY is still a question, not a statement', () => {
    build(['משולש ABC']);
    for (const u of ['∠ABC=?', 'מצא את זווית ABC', 'זווית ABC =']) {
      expect(parse(u, ctxOf()).ok, `«${u}» must NOT build a marker`).toBe(false);
    }
  });

  it('NO THEFT — every valued spelling keeps its own reading', () => {
    build(['משולש ABC']);
    const kinds = (u: string) => {
      const r = parse(u, ctxOf());
      expect(r.ok, `«${u}»`).toBe(true);
      return r.ok ? r.commands.map((c) => c.type) : [];
    };
    expect(kinds('זווית ABC = 40')).toContain('set-angle');
    expect(kinds('זווית ABC = α')).toContain('measure-angle');
    expect(kinds('זוית ABC ישרה')).toContain('set-angle');
    expect(kinds('זווית ABC קהה')).toContain('set-angle-acuteness');
    expect(kinds('זווית ABC > 40')).toContain('set-angle-bound');
    expect(kinds('נסמן זוית ABC כ-α')).toContain('measure-angle');
    for (const u of ['זווית ABC = 40', 'זווית ABC = α', 'זוית ABC ישרה', 'זווית ABC קהה', 'זווית ABC > 40']) {
      expect(kinds(u), `«${u}» must not become a bare marker`).not.toContain('mark-angle');
    }
  });
});

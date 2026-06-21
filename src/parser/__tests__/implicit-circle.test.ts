/**
 * Auto-materialise an IMPLICIT circle (operator session m26xv4m2 / live-Haiku Q4 decomposition).
 *
 * A whole-problem decomposition — typically the LLM fallback — treats the circle as *given* ("CD is a
 * chord IN the circle", "KB tangent to circle O at K", "A on circle O") and emits the CONSUMING step
 * without a step that CREATES the circle. The parser prepends a free circle (free centre + free radius)
 * the moment such a step references a `circle-<centre>` neither in the figure nor defined by the same
 * utterance — so the build doesn't collapse with an undefined centre. The injected circle is `ifAbsent`,
 * so it never clobbers a real circle when a later consuming step is parsed without context.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { isGeoPoint, circleMembers } from '@/engine';
import type { AnyCommand } from '@/engine';

const circleCreations = (cmds: AnyCommand[]) => cmds.filter((c) => c.type === 'circle');

describe('implicit circle — a consuming step with no circle in context materialises one', () => {
  it('"chord CD in circle O" with an empty figure prepends a free circle-O, then the chord', () => {
    const r = parse('מיתר CD במעגל O');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const circles = circleCreations(r.commands);
    expect(circles).toHaveLength(1);
    expect(circles[0]).toMatchObject({ type: 'circle', id: 'circle-O', center: 'O', freeRadius: true, ifAbsent: true });
    expect(r.commands[0].type).toBe('circle'); // prepended (before the on-circle points)
  });

  it('English "A on circle O" and "tangent to circle O at K" each materialise circle-O', () => {
    for (const u of ['A on circle O', 'tangent to circle O at K']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(circleCreations(r.commands).map((c) => (c as { id: string }).id), u).toContain('circle-O');
    }
  });

  it('does NOT inject when the circle already exists in context (no duplicate)', () => {
    const r = parse('מיתר CD במעגל O', { circles: ['O'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(circleCreations(r.commands)).toHaveLength(0);
  });

  it('the materialised circle is REAL: "quad BKCD" + "chord CD in circle O" lands C,D on it (one circle, clean)', () => {
    // The implicit circle isn't a phantom: an EXISTING free vertex declared on it genuinely becomes a chord
    // endpoint (ADR-080 — the free point converts to on-circle and lands on the circle). Threaded through
    // the real ctx path, as the app does. (The full reading-order Q4 decomposition adds KB∥CD-before-chord
    // and a tangent, which over-constrain trapezoid-first — the deeper ADR-073 reorder problem — so this
    // asserts the implicit-circle + chord behaviour on the clean subset, not that flawed whole.)
    const STEPS = ['מרובע BKCD', 'מיתר CD במעגל O'];
    const ctxOf = (facts: Fact[]) => {
      const { construction } = replay(facts);
      return {
        circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
        points: construction.objects.filter(isGeoPoint).map((o) => o.id),
        circleMembers: circleMembers(construction),
      };
    };
    const facts: Fact[] = [];
    let g = 0;
    let circleCreates = 0;
    for (const u of STEPS) {
      const r = parse(u, ctxOf(facts));
      expect(r.ok, `parse ${u}`).toBe(true);
      if (!r.ok) return;
      circleCreates += circleCreations(r.commands).length;
      const group = `g${g++}`;
      for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    }
    expect(circleCreates).toBe(1); // materialised exactly once (the first consuming step)
    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]); // C,D are genuinely on the circle — the chord is real, no "C not on circle"
    const O = fig.positions.get('O')!, C = fig.positions.get('C')!, D = fig.positions.get('D')!;
    const r = Math.hypot(O.x - C.x, O.y - C.y);
    expect(Math.hypot(O.x - D.x, O.y - D.y)).toBeCloseTo(r, 6); // C and D equidistant from O — both on the circle
  });
});

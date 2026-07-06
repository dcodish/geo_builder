/**
 * ADR-233 — a tangent's external-apex role is assigned by SEMANTICS (off the circle), not by the proxy
 * "the label that already exists".
 *
 * Operator session `pr1y4i70` (2026-07-06): after `משולש ACD` + `ACD חסום במעגל` (A, C, D on the circle),
 * `BA משיק למעגל` was read by `tangentFromExternal` as a tangent FROM A (the one existing label) to a NEW
 * touch B — but A is ON the circle, so the Thales aux-circle on OA is internally tangent and the computed
 * touch B collapsed onto A. The semantic truth: an on-circle named point is the TOUCH; the off-circle
 * endpoint (B, new) is the external end of the tangent AT A. This is the unclosed member of the
 * ADR-081/082 family (which handled only the case where BOTH endpoints already exist).
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { isGeoPoint, circleMembers } from '@/engine';
import type { AnyCommand } from '@/engine';

const kinds = (cmds: AnyCommand[]) => cmds.map((c) => c.type);

/** The REAL figure context, exactly as the app/scenarios build it (ADR-171). */
function ctxFrom(facts: Fact[]) {
  const { construction } = replay(facts);
  return {
    circles: construction.objects.flatMap((o) => (o.kind === 'circle' && !o.center.startsWith('~') ? [o.center] : [])),
    points: construction.objects.filter(isGeoPoint).map((o) => o.id),
    circleMembers: circleMembers(construction),
  };
}
function ctxOf(steps: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of steps) {
    const r = parse(u, ctxFrom(facts));
    if (!r.ok) throw new Error(`setup step did not parse: ${u}`);
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  return ctxFrom(facts);
}

describe('tangent AT an on-circle endpoint whose other endpoint is NEW (ADR-233)', () => {
  const ctx = ctxOf(['משולש ACD', 'ACD חסום במעגל']); // A, C, D on the circle; B does not exist

  for (const u of ['BA משיק למעגל', 'AB משיק למעגל', 'BA tangent to the circle']) {
    it(`"${u}" → tangent AT A + B a point along it (never the Thales external construction)`, () => {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const ks = kinds(r.commands);
      // The on-circle endpoint A is the TOUCH — a tangent line AT A.
      expect(r.commands.some((c) => c.type === 'tangent' && (c as { at?: string }).at === 'A'), 'tangent at A').toBe(true);
      // B is materialised as a point ON that tangent — nothing the student named is dropped (§6 honesty).
      expect(r.commands.some((c) => c.type === 'point-on-line' && (c as { id?: string }).id === 'B'), 'B on the tangent').toBe(true);
      // NOT the external-apex Thales construction, which computed a touch on the circle and collapsed B onto A.
      expect(ks, 'no circle∩aux touch').not.toContain('circle-circle-intersection');
      expect(ks, 'no hidden Thales aux circle').not.toContain('circle-through');
    });
  }

  it('a GENUINE external tangent (apex off the circle, touch NEW) still uses the Thales construction', () => {
    // E is an EXTERNAL existing point (NOT a circle member); D is a NEW touch point → the external path is right.
    const ext = { circles: ['O'], points: ['O', 'E'], circleMembers: [{ center: 'O', points: [] as string[] }] };
    const r = parse('מנקודה E משיק נוגע במעגל O בנקודה D', ext);
    expect(r.ok).toBe(true);
    if (r.ok) expect(kinds(r.commands), 'external tangent unchanged').toContain('circle-circle-intersection');
  });
});

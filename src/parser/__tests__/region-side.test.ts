/**
 * Issue #99 — a point's side of a POLYGON region ("E … בתוך המשולש KAO") is a first-class statement:
 * the ADR-254 circle-side family, polygon edition (the 2025-bagrut "E on the small circle inside
 * triangle KAO" definition). A carrier statement with a trailing region clause parses via the
 * `regionSideFallback` (head parsed normally + a `point-polygon-side` attached to the introduced
 * point); a bare region statement creates a free point seeded on the stated side (NEW id) or is an M1
 * statement about an existing one. The side is a REQUIREMENT: the verifier flags a wrong-side config
 * (figure.v.insideRegion/outsideRegion) so `meetsRequirements` gates sampling on it; a genuinely
 * contradicted side reads amber, never dropped.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, firstSatisfyingSeed, dryRunOutcome } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';
import { pointInPolygon } from '@/engine/geometry';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: (string | AnyCommand[])[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const group = `g${g++}`;
    if (typeof line !== 'string') {
      for (const cmd of line) facts.push({ id: `${group}.${facts.length}`, utterance: '(direct)', group, cmd, enabled: true });
      continue;
    }
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (got ${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const at = (fig: ReturnType<typeof replay>, id: string): Vec => fig.positions.get(id)!;

describe('issue #99 — point-polygon-side (region requirement)', () => {
  it.each([
    ['He carrier form', ['משולש KAO', 'הנקודה E נמצאת בתוך המשולש KAO'], 'E', 'inside'],
    ['En carrier form', ['triangle KAO', 'point E lies inside triangle KAO'], 'E', 'inside'],
    ['He outside', ['משולש KAO', 'M מחוץ למשולש KAO'], 'M', 'outside'],
    ['En outside', ['triangle KAO', 'point M lies outside triangle KAO'], 'M', 'outside'],
  ] as const)('%s parses to point-polygon-side and seeds on the stated side', (_t, lines, id, side) => {
    const facts = runLines([...lines]);
    const cmd = facts.find((f) => f.cmd.type === 'point-polygon-side')!.cmd as Extract<AnyCommand, { type: 'point-polygon-side' }>;
    expect(cmd.id).toBe(id);
    expect(cmd.side).toBe(side);
    expect(cmd.poly).toEqual(['K', 'A', 'O']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    const verts = ['K', 'A', 'O'].map((v) => at(fig, v));
    expect(pointInPolygon(at(fig, id), verts)).toBe(side === 'inside');
  });

  it('the 2025-bagrut form: an on-circle point constrained inside a triangle keeps BOTH (membership + region)', () => {
    // The real figure's shape: triangle KAO spans ACROSS the small circle (K far on the big circle), so
    // the small circle's arc genuinely passes through the triangle interior. (With K,A both ON circle O
    // the arc would bulge entirely outside chord KA — the region would be unsatisfiable.)
    const facts = runLines([
      'מעגל O',
      'מעגל P',
      'O נמצאת על מעגל P',
      'A היא אחת מנקודות החיתוך של מעגל O ומעגל P',
      'דרך הנקודה A העבירו משיק למעגל O',
      'המשיק חותך את מעגל P בנקודה K',
      'משולש KAO',
      'הנקודה E נמצאת על מעגל O בתוך המשולש KAO',
    ]);
    const kinds = facts.map((f) => f.cmd.type);
    expect(kinds).toContain('point-on-circle');
    expect(kinds).toContain('point-polygon-side');
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    // E is ON circle O and INSIDE triangle KAO simultaneously (A witnesses circle O's radius — K is on circle P)
    const O = at(fig, 'O'), E = at(fig, 'E');
    const r = Math.hypot(at(fig, 'A').x - O.x, at(fig, 'A').y - O.y);
    expect(Math.hypot(E.x - O.x, E.y - O.y)).toBeCloseTo(r, 5);
    expect(pointInPolygon(E, [at(fig, 'K'), at(fig, 'A'), O])).toBe(true);
  });

  it('bare subject with no point noun ("M בתוך המשולש ABC") is rescued, never a subject-less triangle', () => {
    const facts = runLines(['משולש ABC']);
    const r = parse('M בתוך המשולש ABC', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([{ type: 'point-polygon-side', id: 'M', poly: ['A', 'B', 'C'], side: 'inside' }]);
  });

  it('M1: a statement about an EXISTING free point re-seats its default to the stated side', () => {
    // `free: true` — a construct-style auto default (a PINNED student placement is honestly left where
    // stated and the verifier reports, like circle-side).
    const facts = runLines(['משולש ABC', [[{ type: 'free-point', id: 'M', x: 40, y: 40, free: true }] as AnyCommand[]][0], 'M בתוך המשולש ABC']);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    expect(fig.violations).toEqual([]);
    expect(pointInPolygon(at(fig, 'M'), ['A', 'B', 'C'].map((v) => at(fig, v)))).toBe(true);
  });

  it('a contradicted side reads AMBER (requirement, never dropped): a triangle VERTEX stated inside itself', () => {
    const facts = runLines(['משולש ABC']);
    // A is a vertex of ABC — it can never lie strictly inside ABC; the statement must surface, not vanish.
    const r = parse('הנקודה D בתוך המשולש ABC', ctxOf(facts));
    expect(r.ok).toBe(true);
    // force a contradiction directly: an on-vertex derived point stated inside
    const contradiction: Fact[] = [
      ...facts,
      { id: 'x.0', utterance: '(pin)', group: 'gx', cmd: { type: 'free-point', id: 'D', x: 50, y: 50, pinned: true } as AnyCommand, enabled: true },
      { id: 'x.1', utterance: 'D בתוך המשולש ABC', group: 'gy', cmd: { type: 'point-polygon-side', id: 'D', poly: ['A', 'B', 'C'], side: 'inside' } as AnyCommand, enabled: true },
    ];
    const fig = replay(contradiction);
    expect(fig.violations.some((v) => v.messageKey === 'figure.v.insideRegion')).toBe(true);
  });

  it('membership stated AFTER the region converts E at its OWN bearing — E stays on the circle AND inside (session yla2d4xo)', () => {
    // The operator's exact second-session order: region first (free E seeded inside), THEN "E על מעגל O".
    // The (c2) free→on-circle conversion used to jump E to an arbitrary slot angle, ignoring both its
    // seat and its region requirement. (The triangle must genuinely admit an on-circle interior point —
    // here K is on the BIG circle via the one-sentence tangent compound, so circle O's arc crosses △AKO.)
    const facts = runLines([
      'שני מעגלים נחתכים',
      'דרך A עובר משיק למעגל O שחותך את מעגל P בנקודה K',
      // ADR-342 (#177 ruling (b)): a bare positional «O על מעגל P» now creates a FRESH point O (the
      // unnamed circle's centre no longer squats the letter). The session's intent — the CENTRE rides
      // circle P — is expressed by first naming the centre through the semantic carve-out («רדיוס OA»
      // promotes the anonymous centre to O), after which the membership binds the real centre (M1).
      'רדיוס OA',
      'O על מעגל P',
      'משולש AKO',
      'נקודה E בתוך משולש AKO',
      'E על מעגל O',
    ]);
    const fig = replay(facts, firstSatisfyingSeed(facts));
    expect(fig.lastError).toBeNull();
    const O = at(fig, 'O'), E = at(fig, 'E'), A = at(fig, 'A'), K = at(fig, 'K');
    const r = Math.hypot(A.x - O.x, A.y - O.y);
    expect(Math.hypot(E.x - O.x, E.y - O.y), 'E on circle O').toBeCloseTo(r, 5);
    expect(pointInPolygon(E, [A, K, O]), 'E inside the region').toBe(true);
  });

  it('re-stating an EXISTING region requirement is a truthful no-op; a FRESH one commits (dryRunOutcome)', () => {
    const facts = runLines(['משולש ABC', 'נקודה E בתוך משולש ABC']);
    const r = parse('נקודה E בתוך משולש ABC', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // exact duplicate of an enabled fact → 'empty' (noop-exists is honest)
    expect(dryRunOutcome(facts, r.commands, 0).produced).toBe(false);
    // but a DIFFERENT region statement about the same existing point commits (zero coordinate delta)
    const facts3 = runLines(['משולש ABC', 'משולש ABD'.replace('ABD', 'ABD'), 'נקודה E בתוך משולש ABC']);
    const r3 = parse('נקודה E בתוך משולש ABD', ctxOf(facts3));
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(dryRunOutcome(facts3, r3.commands, 0).produced).toBe(true);
  });

  it('no-theft: inscription phrasings are untouched', () => {
    for (const [lines, expected] of [
      [['משולש ABC', 'מעגל חסום בתוך משולש ABC'], 'circle-through'],
      [['מעוין BDEF חסום במשולש ABC'], 'inscribe'],
    ] as const) {
      const facts = runLines([...lines]);
      expect(facts.some((f) => f.cmd.type === expected)).toBe(true);
      expect(facts.some((f) => f.cmd.type === 'point-polygon-side')).toBe(false);
    }
  });

  it('an all-NEW triangle region is created implicitly (the withImplicitCircles pattern, triangle edition)', () => {
    const r = parse('הנקודה E בתוך המשולש KAO', {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['triangle', 'point-polygon-side']);
  });

  it('defers on a PARTIALLY-known vertex set (a typo’d reference?) and on a non-triangle noun with new labels', () => {
    // K and A exist (vertices of KAB), O does not — ambiguous between a reference and a construction
    // → escalate, never guess.
    const facts = runLines(['משולש KAB']);
    const mixed = parse('הנקודה E בתוך המשולש KAO', ctxOf(facts));
    expect(mixed.ok).toBe(false);
    // a QUADRILATERAL noun over all-new labels stays reference-only (no implicit creation)
    const quad = parse('הנקודה E בתוך המרובע KLMN', {});
    expect(quad.ok).toBe(false);
  });
});

/**
 * Issue #152 — a bare «XY קוטר / XY מיתר» was attached to an existing circle even when an endpoint
 * CANNOT lie on it because it is that circle's own CENTRE.
 *
 * Operator session qx5a19co (bagrut Q27): «EO קוטר» (the Thales circle on segment EO, O = circle O's
 * centre) was claimed by the `diameter` rule, which resolved the circle implicitly to circle-O and
 * emitted `point-on-circle O` — impossible (a centre is never on its own circle) — so the step
 * deferred with unresolved deps; «EO קוטר במעגל חדש» no-op'ed. The impossibility IS the missing
 * disambiguator: `diameter`/`chord` now defer when an endpoint is the resolved circle's centre (a
 * real point — an ADR-342 anonymous centre's letter is free and never trips it), and
 * `circleOnDiameter` claims the statement as a NEW circle on that segment; «במעגל חדש» / "in a new
 * circle" is an explicit create signal.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

function ctxOf(facts: Fact[]) {
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
}
function runLines(lines: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const line of lines) {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, `expected to parse: ${line} (${!r.ok ? r.reason : ''})`).toBe(true);
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: line, group, cmd, enabled: true });
  }
  return facts;
}
const Q27_PREFIX = ['מעגל O', 'AB מיתר', 'CD מיתר', 'AB ו CD נחתכים בנקודה E'];

describe('#152 — endpoint-is-centre routes to circle creation', () => {
  it.each([['He «EO קוטר»', 'EO קוטר'], ['He explicit new «EO קוטר במעגל חדש»', 'EO קוטר במעגל חדש'], ['En "EO is a diameter"', 'EO is a diameter']])(
    '%s builds a NEW circle on diameter EO (midpoint centre), never a diameter of circle O',
    (_t, utterance) => {
      const facts = runLines(Q27_PREFIX);
      const r = parse(utterance, ctxOf(facts));
      expect(r.ok, `${utterance} must parse deterministically`).toBe(true);
      if (!r.ok) return;
      expect(r.commands.some((c) => c.type === 'midpoint'), 'centre = midpoint of EO').toBe(true);
      expect(r.commands.some((c) => c.type === 'circle-through'), 'a NEW circle through E').toBe(true);
      // never the impossible membership of O on its own circle
      expect(r.commands.some((c) => c.type === 'point-on-circle' && c.id === 'O' && c.circle === 'circle-O')).toBe(false);
    },
  );

  it('the chord sibling: «OB מיתר» beside circle O is never read as a chord of circle O', () => {
    const facts = runLines(['מעגל O', 'B על המעגל']);
    const r = parse('OB מיתר', ctxOf(facts));
    if (r.ok) {
      expect(r.commands.some((c) => c.type === 'point-on-circle' && c.id === 'O' && c.circle === 'circle-O')).toBe(false);
    }
  });

  it('regression: «CD קוטר» with NEW endpoints still ADDS a diameter to the existing circle', () => {
    const facts = runLines(['מעגל O']);
    const r = parse('CD קוטר', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commands.some((c) => c.type === 'diameter' && c.circle === 'circle-O')).toBe(true);
      expect(r.commands.some((c) => c.type === 'circle-through'), 'no new circle for an ordinary diameter').toBe(false);
    }
  });

  it('regression: «AB קוטר» with A,B already ON circle O keeps the ADR-137 constraint lowering', () => {
    const facts = runLines(['מעגל O', 'AB מיתר']);
    const r = parse('AB קוטר', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.commands.some((c) => c.type === 'set-collinear'), 'the through-centre collinearity').toBe(true);
      expect(r.commands.some((c) => c.type === 'circle-through'), 'no new circle').toBe(false);
    }
  });

  it.each([['He', 'CD קוטר'], ['En', 'CD is a diameter']])(
    '#221 cross-membership (%s): endpoints on two DIFFERENT circles → a NEW circle on that diameter, auto (hidden) centre',
    (_t, u) => {
      const facts = runLines(['מעגל O', 'מעגל P', 'C על מעגל O', 'D על מעגל P']);
      const r = parse(u, ctxOf(facts));
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      expect(r.commands.some((c) => c.type === 'midpoint'), 'centre = midpoint of CD').toBe(true);
      const ct = r.commands.find((c) => c.type === 'circle-through') as { autoCenter?: boolean } | undefined;
      expect(ct, 'a NEW circle through C').toBeTruthy();
      expect(ct!.autoCenter, 'unnamed → auto (hidden) centre, no invented letter').toBe(true);
    },
  );

  it('#221 membership resolution: «CE קוטר» with BOTH endpoints on ONE of several circles attaches to THAT circle', () => {
    const facts = runLines(['מעגל O', 'מעגל P', 'C על מעגל O', 'E על מעגל O']);
    const r = parse('CE קוטר', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-collinear'), 'the ADR-137 diameter constraint on the host').toBe(true);
    expect(r.commands.some((c) => c.type === 'circle-through'), 'no new circle').toBe(false);
  });

  it('#221 ambiguity: the SHARED members of two intersecting circles stay deferred (a chord of either)', () => {
    const facts = runLines(['שני מעגלים נחתכים בנקודות A ו-B']);
    const r = parse('AB קוטר', ctxOf(facts));
    // Two common hosts — never guessed, never a spurious third circle.
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle-through')).toBe(false);
  });

  it('the full Q27 flow: «EO קוטר» then the small circle is referenceable by its auto name', () => {
    const facts = runLines([...Q27_PREFIX, 'EO קוטר']);
    const fig = replay(facts);
    for (const [id, st] of Object.entries(fig.status)) expect(st, `status of ${id}`).toBe('ok');
    const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
    expect(circles, 'circle O + the new Thales circle').toHaveLength(2);
    const small = circles.find((c) => c.id !== 'circle-O')!;
    // centre = midpoint of EO: equidistant from E and O at half the span
    const cPos = fig.positions.get((small as { center: string }).center)!;
    const E = fig.positions.get('E')!;
    const O = fig.positions.get('O')!;
    const dE = Math.hypot(cPos.x - E.x, cPos.y - E.y);
    const dO = Math.hypot(cPos.x - O.x, cPos.y - O.y);
    expect(dE).toBeCloseTo(dO, 4);
    expect(dE + dO).toBeCloseTo(Math.hypot(E.x - O.x, E.y - O.y), 4);
  });
});

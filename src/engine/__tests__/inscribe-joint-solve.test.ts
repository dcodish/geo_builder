/**
 * A macro's defining constraints are ONE COUPLED SYSTEM — the CLASS test
 * ([ADR-338](docs/06-decisions.md#adr-338), issue #166).
 *
 * The gate from the issue: **all 6 variants × (right angle at A / B / C) either build a verified square /
 * rectangle or refuse honestly, and the plain-triangle baseline stays green.**
 *
 * Before the fix, on the operator's figure (right angle at A): variants 0/3 failed «GD ⟂ DE cannot hold»,
 * 2/4 failed «|DE| = |EF| cannot hold», and 1/5 went GREEN on a figure that was not a square (sides
 * 2.148/3.143/1.236/1.236, two verifier violations) — because each `applyStep` evaluates (moves the figure)
 * before the next constraint is attached, so the last constraint was asked to hold from a basin the earlier
 * ones had already committed to.
 */
import { describe, it, expect } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { factsOf } from '../../__tests__/scenarios-corpus';
import type { Vec } from '../types';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Vec, b: Vec, c: Vec) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))))) * 180) / Math.PI;
};

/** The prefix facts, plus an inscribe pinned to an explicit variant (the store cycles these). */
function withVariant(prefix: string[], shape: 'square' | 'rectangle', variant: number): Fact[] {
  const facts = factsOf(prefix);
  facts.push({
    id: `gI.${facts.length}`,
    group: 'gI',
    utterance: `${shape} DEFG inscribed in ABC (variant ${variant})`,
    cmd: { type: 'inscribe', shape, ids: ['D', 'E', 'F', 'G'], container: ['A', 'B', 'C'], variant } as Fact['cmd'],
    enabled: true,
  });
  return facts;
}

/**
 * THE 36-CONFIGURATION OUTCOME MAP (#920 arm 2, [ADR-493](docs/06-decisions.md#adr-493)).
 *
 * This replaces a `MARGINAL = new Set(['square@B#3'])` that asserted a state which had **stopped
 * occurring**: that configuration no longer lands green-with-violations, it REFUSES, so the `marginals`
 * list was always empty and its `toEqual([])` passed by checking nothing. #920 — an inscribed square that
 * used to draw and now refuses — went unseen for six weeks behind exactly that.
 *
 * The map form cannot degrade that way: every cell is named with its expected outcome, so a change in ANY
 * of the 36 fails by construction — a refusal that starts building, a build that starts refusing, and a
 * refusal whose blamed subject changes are each a different diff. It is the memory note *"locks and gates
 * are hypotheses"* made structural.
 *
 * Measured on `main` at the round-#961 tip. `square@B#3` is the one refusal and it is a **KNOWN OPEN
 * GAP**, recorded here rather than hidden: the hypotenuse seating genuinely exists and the refusal is
 * wrong, but three mechanisms have been refuted (tolerance; a Levenberg polish rung that converges 8,700×
 * and changes nothing; "re-listed obligations are enforced", measured false). The operator's 2026-09-09
 * ruling holds it pending a **second case in the same class** — constructive per-variant seeding stays the
 * leading candidate and gets a session when a case arrives, not a slot on speculation. Do NOT flip this
 * cell to make a change pass; if it starts building, that is the gap CLOSING and the cell is updated in
 * the same commit as the fix that closed it.
 */
type Outcome = 'builds' | { refuses: RegExp };
const OUTCOMES: Record<string, Outcome> = Object.fromEntries([
  ...(['A', 'B', 'C'] as const).flatMap((rt) =>
    [0, 1, 2, 3, 4, 5].flatMap((v) => [
      [`square@${rt}#${v}`, 'builds' as Outcome],
      [`rectangle@${rt}#${v}`, 'builds' as Outcome],
    ]),
  ),
  // the one open gap — and after ADR-493 arm 1 it names the SQUARE'S OWN obligation, never the
  // student's «∠ABC = 90°», which holds perfectly well and which they must not be sent to change.
  ['square@B#3', { refuses: /\|DE\| = \|EF\|/ } as Outcome],
]);

describe('a macro\'s defining constraints are solved as one coupled system (ADR-338 / #166)', () => {
  for (const shape of ['square', 'rectangle'] as const) {
    for (const rt of ['A', 'B', 'C'] as const) {
      it(`${shape} inscribed — right angle at ${rt}: every variant matches its cell in the 36-outcome map`, () => {
        for (let v = 0; v < 6; v++) {
          const key = `${shape}@${rt}#${v}`;
          const expected = OUTCOMES[key];
          expect(expected, `${key}: every configuration has a cell`).toBeDefined();
          const fig = replay(withVariant(['משולש ABC', `זוית ${rt} ישרה`], shape, v), 0);
          const failed = Object.values(fig.status).filter((s) => s !== 'ok');

          if (expected !== 'builds') {
            expect(failed.length, `${key}: the map says this configuration refuses`).toBeGreaterThan(0);
            // Refusing is allowed — but only HONESTLY: nothing of the failed step may remain (ADR-337).
            for (const id of ['D', 'E', 'F', 'G'])
              expect(fig.positions.has(id), `${key}: refused, so ${id} must not exist`).toBe(false);
            // ADR-493 arm 1: the named constraint is one the MACRO added…
            expect(fig.lastError, `${key}: the refusal names the macro's own obligation`).toMatch(expected.refuses);
            // …and never the student's own prior given, which holds perfectly well. This is the
            // honesty assertion in general form: whatever the prefix stated must not be accused.
            expect(fig.lastError, `${key}: the student's «זוית ${rt} ישרה» is not accused`).not.toMatch(new RegExp(`∠\\w*${rt}\\w*\\s*=\\s*90`));
            continue;
          }

          expect(failed, `${key}: the map says this configuration builds`).toEqual([]);
          const [d, e, f, g] = ['D', 'E', 'F', 'G'].map((id) => fig.positions.get(id)!);
          const sides = [dist(d, e), dist(e, f), dist(f, g), dist(g, d)];
          const angles = [angle(g, d, e), angle(d, e, f), angle(e, f, g), angle(f, g, d)];
          // Whatever it built must BE the named shape — the old failure mode was a green non-square.
          for (const [i, a] of angles.entries())
            expect(Math.abs(a - 90), `${key}: right angle at corner ${i}`).toBeLessThan(0.05);
          expect(Math.abs(sides[0] - sides[2]), `${key}: opposite sides equal`).toBeLessThan(1e-2);
          expect(Math.abs(sides[1] - sides[3]), `${key}: opposite sides equal`).toBeLessThan(1e-2);
          if (shape === 'square')
            expect(Math.max(...sides) - Math.min(...sides), `${key}: all four sides equal`).toBeLessThan(1e-2);
          // …and it must SATISFY ITS GIVENS (the ADR-053 verifier) — the green-but-violating case.
          expect(fig.violations, `${key}: builds AND verifies`).toEqual([]);
        }
      });
    }
  }

  it('the map covers every configuration exactly once — no cell can be quietly dropped', () => {
    const keys = (['square', 'rectangle'] as const).flatMap((shape) =>
      (['A', 'B', 'C'] as const).flatMap((rt) => [0, 1, 2, 3, 4, 5].map((v) => `${shape}@${rt}#${v}`)),
    );
    expect(keys).toHaveLength(36);
    expect(Object.keys(OUTCOMES).sort()).toEqual(keys.sort());
  });

  it('the PINNED corner variant reaches the t=0 boundary and matches the closed-form oracle (ADR-338)', () => {
    // Variant 0 with the right angle at A forces D exactly onto A — the corner square of side
    // 1/(1/b + 1/c) over the legs (proved by an oracle importing nothing from the engine). This pins the
    // joint solve's boundary reachability + the ADR-123 forced-coincidence surfacing. The DEFAULT no longer
    // draws this configuration (ADR-339 settles it to general position); it stays reachable by cycling —
    // this test replays the pinned variant directly, the persisted-variant path cycling uses.
    const fig = replay(withVariant(['משולש ABC', 'זוית A ישרה'], 'square', 0), 0);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((id) => fig.positions.get(id)!);
    expect(dist(d, a), 'D ≡ A — the forced corner').toBeLessThan(1e-6);
    expect(fig.coincidences, 'the forced coincidence is surfaced, not silent').toContainEqual(['A', 'D']);
    const side = dist(d, fig.positions.get('E')!);
    expect(Math.abs(side - 1 / (1 / dist(a, b) + 1 / dist(a, c))), 'side = the closed-form corner-square side').toBeLessThan(1e-3);
  });

  it('the plain-triangle baseline stays green (both shapes, default variant)', () => {
    for (const shape of ['square', 'rectangle'] as const) {
      const fig = replay(factsOf(['משולש ABC', `${shape === 'square' ? 'ריבוע' : 'מלבן'} DEFG חסום במשולש ABC`]), 0);
      for (const [, s] of Object.entries(fig.status)) expect(s, `${shape} baseline`).toBe('ok');
      expect(fig.violations, `${shape} baseline verifier`).toEqual([]);
    }
  });
});

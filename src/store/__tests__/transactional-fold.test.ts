/**
 * A fact's lowering is TRANSACTIONAL — the CLASS test ([ADR-337](docs/06-decisions.md#adr-337), issue #167).
 *
 * ONE fact can lower to MANY engine commands (every macro: `inscribe` ADR-262, `shape-variant` ADR-138, the
 * named shapes ADR-110, regular polygon ADR-111, common tangent ADR-239, the concentric pair ADR-244). The
 * build fold used to commit each apply unit's success into the shared construction as it ran, so a failure
 * on a LATER unit of the same fact left the earlier ones on the figure: objects from a red step rendered,
 * the prior figure moved, and the failing constraint never reached `applied` so the verifier read clean on a
 * violated figure.
 *
 * The invariant: **a fact whose status is not 'ok' contributes NOTHING** — none of the ids it would
 * introduce exist, and every pre-existing point is bit-identical to the figure built from the prefix alone.
 *
 * WITNESS NOTE. ADR-337's original witnesses (a square/rectangle inscribed in a right triangle) now BUILD —
 * [ADR-338](docs/06-decisions.md#adr-338)/#166 made the macro's defining constraints solve jointly, which is
 * the point of that fix. They moved to the scenario corpus as success cases. The witness kept here is one
 * that still genuinely fails while CREATING its riders: a square sharing the container's vertex A
 * (`ריבוע ADEF` — D,E,F ride the sides) inscribed in a triangle whose three sides are all PINNED (3-4-5), so
 * the figure has no freedom left to satisfy the square and the coupled solve refuses honestly. Verified to
 * leak D,E,F onto the figure when the trial split is reverted — i.e. this test still fails without ADR-337.
 */
import { describe, it, expect } from 'vitest';
import { replay } from '@/store/geoStore';
import type { Derived } from '@/store/geoStore';
// The corpus's SHARED fact builder (a plain module, not a .test.ts — safe to import): it drives the exact
// parse-with-context → fact list path the app does, so this test can't drift from production (ADR-171).
import { factsOf } from '../../__tests__/scenarios-corpus';

/** The invariant: a red fact leaves zero trace, and the prefix figure is untouched. */
function expectZeroTrace(full: Derived, prior: Derived, introduced: string[], keep: string[]) {
  expect(Object.values(full.status).some((s) => s !== 'ok'), 'the macro step is red').toBe(true);
  for (const id of introduced)
    expect(full.positions.has(id), `${id} must not exist — the step introducing it failed`).toBe(false);
  for (const id of keep) {
    const a = full.positions.get(id);
    const b = prior.positions.get(id);
    expect(a, `${id} exists`).toBeDefined();
    expect(b, `${id} exists in the prior figure`).toBeDefined();
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y), `${id} moved — a failed step must not touch the prior figure`).toBeLessThan(1e-9);
  }
}

describe("a fact's lowering is transactional (ADR-337 / #167)", () => {
  const PINNED = ['משולש ABC', 'AB=3', 'BC=4', 'AC=5'];

  it('a failing macro leaves zero trace and keeps the prior figure', () => {
    const prior = replay(factsOf(PINNED), 0);
    const full = replay(factsOf([...PINNED, 'ריבוע ADEF חסום במשולש ABC']), 0);
    expectZeroTrace(full, prior, ['D', 'E', 'F'], ['A', 'B', 'C']);
  });

  it('the SUCCESS branch still commits — a legitimate multi-command macro lands whole', () => {
    const fig = replay(factsOf(['משולש ABC', 'מלבן DEFG חסום במשולש ABC']), 0);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
    for (const id of ['D', 'E', 'F', 'G']) expect(fig.positions.has(id), `${id} exists`).toBe(true);
  });
});

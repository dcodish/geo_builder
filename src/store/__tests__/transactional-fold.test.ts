/**
 * A fact's lowering is TRANSACTIONAL — the CLASS test ([ADR-337](docs/06-decisions.md#adr-337), issue #167).
 *
 * ONE fact can lower to MANY engine commands (every macro: `inscribe` ADR-262, `shape-variant` ADR-138, the
 * named shapes ADR-110, regular polygon ADR-111, common tangent ADR-239, the concentric pair ADR-244). The
 * build fold used to commit each command's success into the shared construction as it ran, so a failure on a
 * LATER command of the same fact left the earlier ones on the figure: objects from a red step rendered, the
 * prior figure moved, and the failing constraint never reached `applied` so the verifier read clean on a
 * violated figure.
 *
 * The invariant, stated once and asserted per macro family: **a fact whose status is not 'ok' contributes
 * NOTHING — none of the ids it would introduce exist, and every pre-existing point is bit-identical to the
 * figure built from the prefix alone.**
 *
 * SCOPE NOTE (honest): the failure position reachable through the real macros is always at or after the
 * expansion's constraint block — a macro's leading commands are point/shape CREATIONS, which don't fail
 * (a creation on an existing id is idempotent M1 reuse, and a broken dependency is caught by the `broken`
 * pre-check before the fold runs). So "fails on its FIRST command" is not a reachable state through the
 * public surface, and a mock-injected one would assert the mock, not the engine. What IS varied here is the
 * expansion SHAPE and the failing command's index within it: a 9-command inscribe (square: 4 riders +
 * polygon + 4 constraints), a 6-command inscribe (rectangle: 4 riders + polygon + 3 constraints), and a
 * 2-command shape-variant (isosceles: triangle + one equality) — i.e. the failure lands at index 8, 5 and 1
 * of three differently-shaped expansions.
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

describe('a fact\'s lowering is transactional (ADR-337 / #167)', () => {
  const cases: { name: string; prefix: string[]; failing: string; introduced: string[]; keep: string[] }[] = [
    {
      // 9-command expansion; fails in the constraint block (index 8): "over-constrained: |DE| = |EF| …"
      name: 'inscribe SQUARE (9 commands — 4 riders + polygon + 4 constraints)',
      prefix: ['right-triangle ABC', 'זוית A ישרה'],
      failing: 'ריבוע DEFG חסום במשולש ABC',
      introduced: ['D', 'E', 'F', 'G'],
      keep: ['A', 'B', 'C'],
    },
    {
      // 6-command expansion; fails placing a rider against a constraint (index 5).
      name: 'inscribe RECTANGLE (6 commands — 4 riders + polygon + 3 constraints)',
      prefix: ['right-triangle ABC', 'זוית A ישרה'],
      failing: 'מלבן DEFG חסום במשולש ABC',
      introduced: ['D', 'E', 'F', 'G'],
      keep: ['A', 'B', 'C'],
    },
  ];

  for (const c of cases) {
    it(`${c.name}: a red step leaves zero trace and keeps the prior figure`, () => {
      const prior = replay(factsOf(c.prefix), 0);
      const full = replay(factsOf([...c.prefix, c.failing]), 0);
      expectZeroTrace(full, prior, c.introduced, c.keep);
    });
  }

  it('the SUCCESS branch still commits — a legitimate multi-command macro lands whole', () => {
    const fig = replay(factsOf(['משולש ABC', 'מלבן DEFG חסום במשולש ABC']), 0);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
    for (const id of ['D', 'E', 'F', 'G']) expect(fig.positions.has(id), `${id} exists`).toBe(true);
  });
});

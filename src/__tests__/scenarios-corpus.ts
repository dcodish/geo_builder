/**
 * Scenario corpus AGGREGATOR (S4.1b of docs/24). The harness (Step/Scenario/ctxOf/factsOf/run)
 * lives in scenarios-harness.ts; the scenario objects live in scenarios-corpus-{1..4}.ts (append
 * new ones to the LAST chunk). Every existing consumer import path is unchanged: shards and props
 * files import SCENARIOS + the harness from THIS module.
 */
export * from './scenarios-harness';
import type { Scenario } from './scenarios-harness';
import { SCENARIOS_1 } from './scenarios-corpus-1';
import { SCENARIOS_2 } from './scenarios-corpus-2';
import { SCENARIOS_3 } from './scenarios-corpus-3';
import { SCENARIOS_4 } from './scenarios-corpus-4';

export const SCENARIOS: Scenario[] = [...SCENARIOS_1, ...SCENARIOS_2, ...SCENARIOS_3, ...SCENARIOS_4];


/**
 * Seed-sweep oracle ([docs/15-hardening-plan.md](../../docs/15-hardening-plan.md) A2 / TST-1).
 *
 * The `run` test above checks each scenario at ONE seed (the app's default, `firstSatisfyingSeed`). But
 * the dominant historical escape class is *wrong-configuration-at-another-seed* — a figure that builds
 * clean yet is geometrically wrong in some OTHER valid draw the student can reach via "show another
 * configuration" (ADR-085/098/127/166 all shipped past seed-0 suites). This re-runs each scenario's OWN
 * geometric `check` — the independent oracle that already exists — at EVERY seed the app would actually
 * DISPLAY (`meetsRequirements` true), asserting the ground-truth relations hold in every shown config, not
 * just the default one.
 *
 * Scope (principled, not arbitrary): only scenarios with FREE DOFs are swept — a determined figure is
 * seed-invariant, so the single-seed test already covers it. Heavy figures (a seed-0 replay over the
 * threshold) are skipped and LOGGED (no silent caps — repo rule). A scenario whose `check` asserts a
 * CONFIG-SPECIFIC fact (a branch / vertex order that legitimately varies) opts out via `seedSweepExempt`.
 */
/**
 * CONFIG-SPECIFIC scenarios exempt from the seed-sweep — their `check` asserts a value that legitimately
 * VARIES across the valid configs "show another configuration" reaches (a free radius, an unstated
 * extension distance, an arc position, a size-dependent separation / convexity gap), so it can only hold at
 * the default seed. Their geometric INVARIANTS (angle relations, on-circle membership, collinearity) DO
 * hold across seeds — verified when this oracle was built; only the config-pinned numbers move. The
 * single-seed `run` test above still guards each at its default. (Kept as ONE legible list, id → why.)
 */
export const SEED_SWEEP_EXEMPT: Record<string, string> = {
  'symbolic-2alpha-drives-shape-not-the-fixed-point': 'D is on an UNSTATED extension (המשך BC, no distance) — an ADR-052 free DOF, so its t legitimately varies; the ∠BOC=2∠CAD invariant holds every seed',
  'two-collinear-chain-solves': 'the check pins circle P’s radius (|PD|≈3.6) — a free-radius DOF that varies across views',
  'line-through-intersection-collinear': 'pins |PC| to the default free radius; the collinearity invariant holds every seed',
  'second-intersection-avoids-shared-point': 'pins E’s distance to the default radius and a size-dependent A–C separation; E stays on the circle',
  'redefine-existing-point-onto-circle': 'the E–A separation (>0.5) scales with the free radii; E stays ON circle P and A,C,E collinear every seed',
  'point-on-arc-no-midpoint-word': 'a FREE point on the arc — its position varies by design (ADR-042); no fixed arc coordinate is an invariant',
  'perp-constraint-keeps-quad-convex': 'the convex-gap threshold (15°) is stricter than the app’s displayable-convexity gate; a valid ~12° corner appears at some seeds',
  'tangent-chord-bisector': 'same convex-gap threshold vs the displayable gate — a valid tight corner at one seed',
  'tangent-secant-detection-honours-valid-configs': 'the check runs detectRelations/detectShapes, which sample the figure internally across their own seeds — the ground-truth relations it asserts are seed-invariant by construction, so a per-display-seed re-run only repeats the same internal detection',
};

/**
 * KNOWN-HEAVY scenarios (a single replay is slow — coupled solves / reflection sweeps / large corpora),
 * pre-skipped so the default sweep doesn't pay their cost even to MEASURE them. The `THRESHOLD_MS` guard
 * below still auto-catches any NEW heavy scenario. Populated from the sweep's own timing log; each is swept
 * only in the deep pass (`SEED_SWEEP_MULT` set). Their default config is still guarded by the `run` test.
 */
export const SEED_SWEEP_HEAVY = new Set<string>([
  'segment-meet-lands-on-segments', 'emergent-shapes-through-crossings', 'incircle-of-trapezoid-flexes-tangential',
  'area-ratio-converges-points-allowed', 'driven-extension-point-stays-beyond', 'q4-constraints-order-independent',
  'collinear-flexes-redundant-carrier-kite-tangents', 'diameter-from-point-cuts-side-onto-segment',
  'alpha-less-than-beta-reshapes', 'kite-tangents-redundant-equality-not-over-constrained',
]);



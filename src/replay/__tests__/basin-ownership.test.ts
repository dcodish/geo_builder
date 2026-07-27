/**
 * Issues #150 + #359 ([ADR-399](../../../docs/06-decisions.md#adr-399) /
 * [ADR-400](../../../docs/06-decisions.md#adr-400)) — the driven-solve basin family.
 *
 * Two members of one family: the valid-configuration space of a buildable figure collapsed to a
 * fraction of its seeds.
 *
 * #150 (ownership at accept, M2): a consuming constraint committed while the CURRENT drawing happens
 * to satisfy it was accepted as an UNOWNED CHECK — no DOF claimed, nothing re-solved per seed, so
 * every sampled configuration violated it. Q27's default chords are symmetric to machine epsilon, so
 * `EF=EG` bound nothing and the figure converged from 1/64 seeds; detection ran on a 1-sample pool
 * and the book labeling (BE=DE) was unreachable. Now the accept path probes with the REAL sampler and,
 * when a probe blames the new constraint (the ADR-398 `violated` attribution), assigns ownership with
 * the standard recruiter — same statement, same owner, regardless of the accidental residual.
 *
 * #359 (per-seed basin retry): the fold's rescue ladder runs only at fold time; the tail was ONE
 * evaluate, so a seed whose sampled solver starts fall outside the driven system's convergence basin
 * was lost (tailChoice fell back to the weaker pending fold) even though the fold's own committed
 * solution is a start that provably converges. Now the tail retries once, warm-starting every
 * directive-carrying carrier from the fold's values (the ADR-238 retry-only pattern).
 *
 * The third test is the fix's own tripwire: a REDUNDANT (structurally implied) equality must survive
 * the probes untouched and stay an unowned check — claiming a DOF for it would freeze sampling
 * variety (the ADR-139/140 redundant-kite-equality class).
 */

import { describe, expect, it } from 'vitest';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements, replay } from '@/store/geoStore';
import { drivenConstraintsOf } from '@/engine';
import type { Fact } from '@/store/geoStore';

const Q27_CHORDS = [
  'מעגל O',
  'AB מיתר',
  'CD מיתר',
  'AB ו CD נחתכים בנקודה E',
  'P אמצע EO',
  'קוטר מעגל P הוא EO',
  'מעגל P חותך את AB בנקודה F',
  'מעגל P חותך את DC בנקודה G',
];

const TANG = [
  'שני מעגלים O1 ו O2 משיקים מבחוץ בנקודה M',
  'AB משיק משותף לשני המעגלים',
  'מנקודה N יוצאים שני משיקים למעגל O1 בנקודות M ו B',
  'מנקודה N יוצאים שני משיקים למעגל O2 בנקודות M ו A',
  'A נמצאת על המשך BN',
  'O1M=9',
  'O2M=16',
];

const d = (fig: { positions: Map<string, { x: number; y: number }> }, a: string, b: string): number => {
  const p = fig.positions.get(a);
  const q = fig.positions.get(b);
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : NaN;
};

function q27Health(facts: Fact[]) {
  // The equality must have an OWNER in the committed figure (a solve directive somewhere carries it).
  const fig0 = replay(facts, 0);
  const driven = drivenConstraintsOf(fig0.construction);
  expect(
    driven.some((k) => k.type === 'equal'),
    'EF=EG must be OWNED (a driven carrier), not a bare check',
  ).toBe(true);

  let evalOk = 0;
  let displayable = 0;
  let beDe = 0;
  let aeDe = 0;
  for (let s = 0; s < 64; s++) {
    const fig = replay(facts, s);
    if (fig.lastError === null) evalOk++;
    if (!meetsRequirements(facts, s)) continue;
    displayable++;
    // a displayable configuration is never a numeric blow-up (the near-parallel-chords degenerate
    // roots exist but must all be filtered by the meet-on-segments requirement)
    let ext = 0;
    for (const p of fig.positions.values()) ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y));
    expect(ext, `seed ${s} displayable extent`).toBeLessThan(1e4);
    const be = d(fig, 'B', 'E');
    const de = d(fig, 'D', 'E');
    const ae = d(fig, 'A', 'E');
    if (Math.abs(be - de) < 1e-3 * Math.max(be, de)) beDe++;
    else if (Math.abs(ae - de) < 1e-3 * Math.max(ae, de)) aeDe++;
  }
  // was 1/64 before ADR-399 — the constraint now re-solves at every seed
  expect(evalOk, 'every seed re-solves the owned equality').toBe(64);
  // a healthy detection pool (was exactly 1)
  expect(displayable, 'a healthy displayable pool').toBeGreaterThanOrEqual(8);
  // the book labeling BE=DE is REACHABLE by "show another configuration" (was 0/64), and so is its mirror
  expect(beDe, 'the BE=DE labeling is reachable').toBeGreaterThan(0);
  expect(aeDe, 'the AE=DE labeling is reachable').toBeGreaterThan(0);
}

describe('#150 — an accidentally-satisfied binding constraint claims its DOF (ADR-399)', () => {
  it('Q27: EF=EG is owned; the pool is healthy; both labelings are reachable; no displayable blow-up', () => {
    q27Health(factsOf([...Q27_CHORDS, 'EF=EG']));
  });

  it('slot mirror (docs/17 §6): the same statement written EG=EF gets the same ownership and health', () => {
    q27Health(factsOf([...Q27_CHORDS, 'EG=EF']));
  });

  it('a REDUNDANT equality (structurally implied) stays an unowned check — sampling variety untouched', () => {
    // Refs must all be DERIVED so the statement genuinely lands as a check (a free ref like the
    // square's own A/B is claimed by driveOrCheck's EAGER pick — pre-existing, harmless: the
    // regularised re-solve keeps the sampled spot on a residual-flat manifold). Varignon: the
    // square's edge midpoints E,F,G,H form a quad whose opposite sides are equal in EVERY sampled
    // configuration — so the ADR-399 probes can never blame `EF=GH`, and no DOF is claimed for it
    // (claiming one would freeze sampling variety — the ADR-139/140 redundant-equality class).
    const facts = factsOf(['ריבוע ABCD', 'E אמצע AB', 'F אמצע BC', 'G אמצע CD', 'H אמצע AD', 'EF=GH']);
    const fig0 = replay(facts, 0);
    expect(drivenConstraintsOf(fig0.construction).some((k) => k.type === 'equal')).toBe(false);
    expect(fig0.construction.constraints.some((k) => k.type === 'equal')).toBe(true);
    for (const s of [0, 1, 2, 3]) expect(replay(facts, s).lastError, `seed ${s}`).toBeNull();
  });
});

describe('#359 — the per-seed tail retries from the fold solution (ADR-400)', () => {
  it('the two-tangent-circles figure reaches the closed form (r1=9, r2=16, |O1O2|=25, |NM|=12) at EVERY seed', () => {
    const facts = factsOf(TANG);
    for (let s = 0; s < 16; s++) {
      const fig = replay(facts, s);
      expect(fig.lastError, `seed ${s}`).toBeNull();
      expect(d(fig, 'O1', 'M'), `seed ${s} |O1M|`).toBeCloseTo(9, 5);
      expect(d(fig, 'O2', 'M'), `seed ${s} |O2M|`).toBeCloseTo(16, 5);
      expect(d(fig, 'O1', 'O2'), `seed ${s} |O1O2|`).toBeCloseTo(25, 5);
      expect(d(fig, 'N', 'M'), `seed ${s} |NM|`).toBeCloseTo(12, 5);
      // the pending base fold must never be shown in place of the complete figure (the silent
      // "given still deferred" fallback this fix retires for these seeds)
      expect(fig.pending, `seed ${s} not pending`).toBe(false);
    }
  });
});

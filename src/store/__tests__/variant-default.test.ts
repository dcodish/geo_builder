/**
 * A cyclable variant's DEFAULT settles to the first cleanly-building configuration at commit — the CLASS
 * test ([ADR-339](docs/06-decisions.md#adr-339), issue #176).
 *
 * The parser emits `variant: 0` blindly, but a coincidence that variant 0 forces and a SIBLING variant
 * avoids is a DEFAULT collision (ADR-123: avoided), not a given-forced one (allowed + notice) — "forced" is
 * a property of the variant FAMILY, not the chosen member. Reported case: a square inscribed in a right
 * triangle at A drew the degenerate CORNER square (D≡A) although the hypotenuse variants put all four
 * vertices genuinely on the sides.
 *
 * The contract locked here:
 *  - settle happens ONCE, at commit (`commitCommands` — both `execute`/`executeMany` — and the edit path
 *    `replaceGroup`); afterwards the persisted variant is authoritative;
 *  - a clean default KEEPS variant 0 reference-identically (no needless motion, no phantom undo entries);
 *  - `cycleVariant` steps VERBATIM from the settled value — the corner square stays reachable, with its
 *    honest ADR-123 coincidence notice;
 *  - an all-variants-failing macro keeps variant 0's honest error (and, per ADR-337, zero trace).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay, settleVariantDefaults } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { factsOf } from '../../__tests__/scenarios-corpus';
import type { Vec } from '@/engine';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Drive the REAL store exactly as the App does: parse each utterance with the live figure context,
 *  commit through executeMany (→ commitCommands → the settle chokepoint). */
function type(utterances: string[]) {
  for (const u of utterances) {
    const st = useGeoStore.getState();
    const fig = replay(st.facts, st.seed);
    const r = parse(u, buildParseCtx(fig.construction, fig.positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    st.executeMany(r.commands, u);
  }
}
const inscribeFact = (facts: Fact[]) => facts.find((f) => f.cmd.type === 'inscribe') as Fact & { cmd: { variant: number } };

describe("a cyclable variant's default settles at commit (ADR-339 / #176)", () => {
  beforeEach(() => useGeoStore.getState().clear());

  it('the reported sequence settles OFF the degenerate corner variant — all four vertices land on the sides', () => {
    type(['משולש ישר זוית ABC', 'זוית A ישרה', 'ריבוע DEFG חסום במשולש ABC']);
    const st = useGeoStore.getState();
    expect(inscribeFact(st.facts).cmd.variant, 'settled off the coinciding variant 0').not.toBe(0);
    const fig = replay(st.facts, st.seed);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(fig.coincidences, 'no coincidence in the default drawing').toEqual([]);
    const P = (id: string) => fig.positions.get(id)!;
    const [d, e, f, g] = ['D', 'E', 'F', 'G'].map(P);
    // A genuine square…
    const sides = [dist(d, e), dist(e, f), dist(f, g), dist(g, d)];
    expect(Math.max(...sides) - Math.min(...sides), 'four equal sides').toBeLessThan(1e-3);
    // …in GENERAL POSITION: every square vertex strictly away from every container vertex.
    for (const s of ['D', 'E', 'F', 'G'])
      for (const c of ['A', 'B', 'C'])
        expect(dist(P(s), P(c)), `${s} clear of ${c}`).toBeGreaterThan(0.5);
  });

  it('a clean default KEEPS variant 0 — right angle at C and the plain triangle (reference-identical, no motion)', () => {
    for (const prefix of [['משולש ABC', 'זוית C ישרה'], ['משולש ABC']]) {
      useGeoStore.getState().clear();
      type([...prefix, 'ריבוע DEFG חסום במשולש ABC']);
      expect(inscribeFact(useGeoStore.getState().facts).cmd.variant, `after ${prefix.join(' / ')}`).toBe(0);
    }
    // Reference identity — the settle must not rewrite the array when nothing changed.
    const facts = factsOf(['משולש ABC', 'ריבוע DEFG חסום במשולש ABC']);
    expect(settleVariantDefaults(facts, () => true, 0)).toBe(facts);
  });

  it('cycling steps VERBATIM from the settled variant — the corner square stays reachable with its notice', () => {
    type(['משולש ישר זוית ABC', 'זוית A ישרה', 'ריבוע DEFG חסום במשולש ABC']);
    const settled = inscribeFact(useGeoStore.getState().facts).cmd.variant;
    useGeoStore.getState().cycleVariant();
    const cycled = inscribeFact(useGeoStore.getState().facts).cmd.variant;
    expect(cycled, 'cycle is +1 verbatim, never re-settled').toBe((settled + 1) % 6);
    // Walk the full family: the coinciding corner-square variants are REACHABLE and draw with the
    // honest coincidence notice (ADR-123) — settling changed the default, not the family.
    let sawCorner = false;
    for (let i = 0; i < 6; i++) {
      const st = useGeoStore.getState();
      const fig = replay(st.facts, st.seed);
      if (fig.coincidences.some((p) => p.includes('A'))) sawCorner = true;
      st.cycleVariant();
    }
    expect(sawCorner, 'the corner square is reachable by cycling').toBe(true);
  });

  it('an all-variants-failing macro keeps variant 0 and its honest error (zero trace per ADR-337)', () => {
    type(['משולש ABC', 'AB=3', 'BC=4', 'AC=5', 'ריבוע ADEF חסום במשולש ABC']);
    const st = useGeoStore.getState();
    expect(inscribeFact(st.facts).cmd.variant, 'no variant helps — keep the canonical one').toBe(0);
    const fig = replay(st.facts, st.seed);
    expect(Object.values(fig.status).some((s) => s !== 'ok'), 'the step is honestly red').toBe(true);
    for (const id of ['D', 'E', 'F']) expect(fig.positions.has(id), `${id} leaked`).toBe(false);
  });

  it('the edit path settles too — re-lowering an inscribe through replaceGroup re-advances the default', () => {
    type(['משולש ישר זוית ABC', 'זוית A ישרה', 'ריבוע DEFG חסום במשולש ABC']);
    const st = useGeoStore.getState();
    const target = inscribeFact(st.facts);
    const key = target.group ?? target.id;
    // Re-lower the same utterance at its prefix context (the app's ✎ path, ADR-241) — the parser emits
    // variant 0 again; replaceGroup must settle it back off the corner.
    const start = st.facts.findIndex((f) => (f.group ?? f.id) === key);
    const prefix = replay(st.facts.slice(0, start), st.seed);
    const r = parse('ריבוע DEFG חסום במשולש ABC', buildParseCtx(prefix.construction, prefix.positions));
    if (!r.ok) throw new Error('edit re-parse failed');
    st.replaceGroup(key, r.commands, 'ריבוע DEFG חסום במשולש ABC');
    expect(inscribeFact(useGeoStore.getState().facts).cmd.variant, 'edit-path parity').not.toBe(0);
  });
});

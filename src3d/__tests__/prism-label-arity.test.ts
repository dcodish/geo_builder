/**
 * #392 ([ADR-3D-143](../../docs/06b-decisions-3d.md)) — bare «מנסרה ABCA'B'C'»: the base arity is
 * DERIVED from the label run when it is unambiguous (2n labels, n = 3..4, primed-mirror second half).
 * Prod (log-triage 2026-07-28): «מנסרה ABCA'B'C'» was not-handled while «מנסרה משולשת …» built —
 * operator approved 2026-07-29: "ABCA'B'C' should create a triangular base."
 *
 * The derived base is the GENERAL triangle/quad and the prism stays OBLIQUE — deriving a
 * parallelogram, regularity, or rightness would assert a property the student never stated (ADR-052).
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { cross3, dot3, norm3, sub3 } from '../engine/vec3';

function build(lines: string[], seed = 0) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return { st, d, pos: d.positions, c: d.construction };
}

describe('#392 — the primed-mirror run derives the base arity', () => {
  it.each([
    ["מנסרה ABCA'B'C'", 'prism3', ['A', 'B', 'C', "A'", "B'", "C'"]],
    ["prism ABCA'B'C'", 'prism3', ['A', 'B', 'C', "A'", "B'", "C'"]],
    ["מנסרה ABCDA'B'C'D'", 'prism4g', ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"]],
    ["prism ABCDA'B'C'D'", 'prism4g', ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"]],
  ] as const)('«%s» → %s, oblique', (line, kind, ids) => {
    const p = parse3(line);
    expect(p.ok, `«${line}» parses: ${JSON.stringify(p)}`).toBe(true);
    if (p.ok) expect(p.commands[0]).toMatchObject({ type: 'solid', kind, ids: [...ids], oblique: true });
  });

  it('the oblique tilt is a genuinely FREE sampled DOF — two seeds, two tilts', () => {
    const tiltAt = (seed: number) => {
      const { st, pos } = build(["מנסרה ABCA'B'C'"], seed);
      expect(st.lastError).toBeNull();
      const [A, B, C, A1] = ['A', 'B', 'C', "A'"].map((id) => pos.get(id)!);
      const n = cross3(sub3(B, A), sub3(C, A));
      const e = sub3(A1, A);
      return dot3(e, n) / (norm3(e) * norm3(n)); // cos(edge, base normal)
    };
    const [t0, t1] = [tiltAt(0), tiltAt(1)];
    expect(Math.abs(t0 - t1), 'the lateral tilt varies across seeds (unstated ⇒ free)').toBeGreaterThan(1e-3);
  });

  it('«המנסרה ישרה» composes — the #289 M1 make-right pins the derived prism upright', () => {
    const { st, pos } = build(["מנסרה ABCA'B'C'", 'המנסרה ישרה']);
    expect(st.lastError).toBeNull();
    const [A, B, C, A1] = ['A', 'B', 'C', "A'"].map((id) => pos.get(id)!);
    const n = cross3(sub3(B, A), sub3(C, A));
    const e = sub3(A1, A);
    const cos = Math.abs(dot3(e, n)) / (norm3(e) * norm3(n));
    expect(cos, 'lateral edge along the base normal — a RIGHT prism').toBeGreaterThan(1 - 1e-6);
  });
});

describe('#392 — mismatched runs keep the honest refusal (never a guessed solid)', () => {
  it.each([
    "מנסרה ABCA'B'", // odd half — 5 labels
    'מנסרה ABCDEF', // 6 labels, unmirrored
    "מנסרה ABCDEA'B'C'D'E'", // n=5 — regular bases stay refused (ADR-3D-089 boundary)
    "מנסרה A'BCA'B'C'", // primed label in the head
  ])('«%s» stays not-handled', (line) => {
    expect(parse3(line).ok, line).toBe(false);
  });

  it('the stated-base forms keep their owners byte-identical', () => {
    const bare = parse3("מנסרה ABCA'B'C'");
    const stated = parse3("מנסרה משולשת ABCA'B'C'");
    expect(bare.ok && stated.ok).toBe(true);
    if (bare.ok && stated.ok) {
      expect(stated.commands[0]).toMatchObject({ type: 'solid', kind: 'prism3', oblique: true });
      expect(bare.commands[0]).toEqual(stated.commands[0]); // the derived read agrees with the spelled-out one
    }
  });
});

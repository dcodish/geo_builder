/**
 * #2292 (ADR-3D-372, ADR-W-146; amends ADR-3D-310 Am. and ADR-3D-358) — GIVENS THAT HOLD ONLY IN THE LIMIT WHERE A
 * DECLARED POLYGON COLLAPSES ARE REFUSED, never drawn as a sliver.
 *
 * «משולש ABC · |BA| = |BC| · ∠ACB = 90°» has no triangle in it: a right angle at C makes BC a leg and BA the
 * hypotenuse. The sphere |BC| = |BA| about B and the Thales sphere on AB touch only at A, so the residual vanishes
 * only to second order as C → A. The pivot stalled at C ≈ 0.003 from A (openness ~2.5e-3: inside the 1e-2 sliver
 * band, above the 1e-4 collapse line), and the sliver release asked whether the RELEASED figure was exact (1e-20)
 * and collapsed — a tangent root reaches neither, so the sliver was kept and drawn green at every seed.
 *
 * The release is now the tightened re-solve (2-D ADR-537, analytic ADR-AG-143): a thin candidate re-solved on its
 * own residuals that fails the tightened floor while the ring thins is a limit root, and refused as the forced
 * collapse it is (`polygon-collapsed`, `forced`), with the same words «AB ⊥ AC» already got. A genuinely thin
 * triangle is exact where it stands and keeps building. Everything runs through the real `decideSubmit3`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';

type St = { facts: Fact3[]; seed: number };

function run(lines: readonly string[], seed: number) {
  let st: St = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null, kind: v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null, kind: 'record' as const };
}

const he = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('en')(k, o) as string;
const plain = (s: string | null): string => (s ?? '').replace(/[⁦-⁩]/g, '');
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Refused on the LAST line as a forced collapse of ABC, naming `others`; keep-prior (the line is not a fact). */
function refusedCollapse(lines: readonly string[], seed: number, others: readonly string[]): void {
  const r = run(lines, seed);
  const last = lines.length - 1;
  expect(r.refusedAt, `seed ${seed}: refused at «${lines[last]}» (got ${r.kind} at ${r.refusedAt})`).toBe(last);
  expect(r.error, `seed ${seed}`).toMatchObject({ code: 'polygon-collapsed', stated: lines[last], ring: 'ABC', forced: true });
  const msg = errorText3(he, r.error)!;
  for (const o of others) expect(msg, `seed ${seed}`).toContain(`«${o}»`);
  expect(r.st.facts.length, 'keep-prior: the refused line is not a fact').toBe(last);
}

describe('#2292 — a right isosceles triangle with the right angle at the apex is refused, never a sliver', () => {
  it.each<[string, string[], string[]]>([
    ['the reported sequence', ['משולש ABC', '|BA| = |BC|', '∠ACB = 90°'], ['|BA| = |BC|']],
    ['the ⊥ spelling', ['משולש ABC', '|BA| = |BC|', 'AC ⊥ BC'], ['|BA| = |BC|']],
    ['the ⊥ spelling from C', ['משולש ABC', '|BA| = |BC|', 'CA ⊥ CB'], ['|BA| = |BC|']],
    ['the reversed order', ['משולש ABC', '∠ACB = 90°', '|BA| = |BC|'], ['∠ACB = 90°']],
    ['the reversed order, ⊥', ['משולש ABC', 'AC ⊥ BC', '|BA| = |BC|'], ['AC ⊥ BC']],
    ['the right-isosceles head', ['משולש ישר זווית שווה שוקיים ABC', '∠ACB = 90°'], ['משולש ישר זווית שווה שוקיים ABC']],
    ['the other leg (refused before, unchanged)', ['משולש ABC', '|BA| = |BC|', 'AB ⊥ AC'], ['|BA| = |BC|']],
  ])('%s is refused polygon-collapsed at all 24 seeds', (_name, lines, others) => {
    for (const seed of SEEDS_24) refusedCollapse(lines, seed, others);
  }, 120_000);

  it('the exact Hebrew and English wording is the forced-collapse message «AB ⊥ AC» gets', () => {
    const r = run(['משולש ABC', '|BA| = |BC|', '∠ACB = 90°'], 0);
    expect(plain(errorText3(he, r.error))).toBe(
      'לא ניתן: «∠ACB = 90°» יחד עם «|BA| = |BC|» מתקיימים רק אם המשולש ABC שטוח (כל קודקודיו על ישר אחד) — וקו ישר אינו משולש.',
    );
    expect(plain(errorText3(en, r.error))).toBe(
      "Can't do that: «∠ACB = 90°» together with «|BA| = |BC|» hold only if triangle ABC is flat (all its vertices on one line) — and a line is not a triangle.",
    );
  });

  it('«|AB| = 2 · |BC| = 2 · AC ⊥ BC» is never drawn: refused at all 24 seeds', () => {
    const lines = ['משולש ABC', '|AB| = 2', '|BC| = 2', 'AC ⊥ BC'];
    for (const seed of SEEDS_24) {
      const r = run(lines, seed);
      expect(r.refusedAt, `seed ${seed}: ${r.kind}`).toBe(3);
      expect(['polygon-collapsed', 'givens-contradict'], `seed ${seed}`).toContain((r.error as { code?: string } | null)?.code);
    }
  }, 120_000);
});

describe('#2292 — controls: a thin but real triangle keeps building', () => {
  /** Every line records and every fact is ok; returns the shortest side over the longest. */
  function builds(lines: readonly string[], seed: number): number {
    const r = run(lines, seed);
    expect(r.refusedAt, `seed ${seed}: «${lines[r.refusedAt]}» → ${JSON.stringify(r.error ?? r.kind)}`).toBe(-1);
    const d = derive3(r.st.facts, r.st.seed);
    for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
    const [A, B, C] = ['A', 'B', 'C'].map((id) => d.positions.get(id)!);
    const sides = [dist(A, B), dist(B, C), dist(A, C)];
    return Math.min(...sides) / Math.max(...sides);
  }
  it.each<[string, string[], number]>([
    ['|AB| = 2 · |BC| = 1 · AC ⊥ BC (a real right triangle)', ['משולש ABC', '|AB| = 2', '|BC| = 1', 'AC ⊥ BC'], 0.4],
    ['∠ACB = 90° · |BA| = 1.0001|BC| (a needle, but real)', ['משולש ABC', '∠ACB = 90°', '|BA| = 1.0001|BC|'], 1e-2],
    ['5 · 3 · 7.9999 (thinner than the sliver band)', ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9999'], 0.3],
    ['5 : 3 : 7.999 (scale-free, thin)', ['משולש ABC', 'AB : BC = 5 : 3', 'AB : AC = 5 : 7.999'], 0.3],
    ['|AC| = 1.9999|AB| on an isosceles triangle', ['משולש ABC', '|AB| = |BC|', '|AC| = 1.9999|AB|'], 0.4],
  ])('%s builds at all 24 seeds', (_name, lines, minRatio) => {
    for (const seed of SEEDS_24) expect(builds(lines, seed), `seed ${seed}`).toBeGreaterThan(minRatio);
  }, 120_000);
});

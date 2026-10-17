/**
 * #1847 (ADR-3D-361, amends ADR-3D-309) — THE REVERSE ORDER OF #1815 NAMES BOTH STATEMENTS.
 *
 * «משולש ABC · M אמצע BC · M על AB» was refused `claim-refuted` at 24/24 seeds («הטענה לא מתקיימת בציור — בדקו
 * את החישוב»), while the other order («M על AB» first, a rider) is refused by name, «M אמצע BC» סותר את «M על
 * AB». M is a derived point there, so «M על AB» is a CLAIM about it and was judged against the sampled triangle —
 * one conflict, two answers by entry order. 2-D and analytic name the collapse in both orders (measured at
 * 5edeeca1, the plan). Now a refuted membership claim is re-solved as the pin it states, on the pivot's own
 * failure-path search, and when only a flat polygon could hold it the claim is refused as that collapse.
 * Everything runs through the App's real pre-LLM decision, `decideDeterministic3`.
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';

const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);
const he = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('en')(k, o) as string;
/** The locale wraps interpolated Latin runs in bidi isolates (U+2066–U+2069); compared without them. */
const plain = (s: string | null): string => (s ?? '').replace(/[⁦-⁩]/g, '');

function run(lines: readonly string[], seed: number) {
  let st: { facts: Fact3[]; seed: number } = { facts: [], seed };
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const v = decideDeterministic3(st, lines[i], () => `f${++n}`);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null, kind: v.kind };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null, kind: 'record' as const };
}

/** |Newell normal| / span² of the ring — 0 for a collinear ring. */
function ringArea(pos: ReadonlyMap<string, { x: number; y: number; z: number }>, ids: readonly string[]): number {
  const P = ids.map((i) => pos.get(i)!);
  let nx = 0, ny = 0, nz = 0, span = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
    for (const q of P) span = Math.max(span, Math.hypot(a.x - q.x, a.y - q.y, a.z - q.z));
  }
  return Math.hypot(nx, ny, nz) / (span * span);
}

/** Refused on the LAST line as the (not forced) collapse, naming every one of `others`; the triangle stays open. */
function refusesCollapse(lines: readonly string[], seed: number, others: readonly string[]): string {
  const r = run(lines, seed);
  const last = lines.length - 1;
  expect(r.refusedAt, `seed ${seed}: refused at «${lines[last]}» (got ${r.kind} at ${r.refusedAt})`).toBe(last);
  expect(r.error, `seed ${seed}`).toMatchObject({ code: 'polygon-collapsed', stated: lines[last], ring: 'ABC', sides: 3 });
  expect((r.error as { forced?: true }).forced, `seed ${seed}: the incidence invented it, the givens do not force it`).toBeUndefined();
  const msg = plain(errorText3(he, r.error));
  for (const o of others) expect(msg, `seed ${seed}`).toContain(`«${o}»`);
  expect(r.st.facts.length, 'keep-prior: the refused line is not a fact').toBe(last);
  expect(ringArea(derive3(r.st.facts, r.st.seed).positions, ['A', 'B', 'C']), `seed ${seed}: the standing triangle is open`).toBeGreaterThan(0.1);
  return msg;
}

describe('#1847 — a membership on an existing midpoint that only a flat triangle satisfies is refused by name', () => {
  it('the reported order at all 24 seeds, in the forward order\'s own words', () => {
    for (const seed of SEEDS_24) refusesCollapse(['משולש ABC', 'M אמצע BC', 'M על AB'], seed, ['M אמצע BC']);
    expect(refusesCollapse(['משולש ABC', 'M אמצע BC', 'M על AB'], 0, ['M אמצע BC'])).toBe(
      'לא ניתן: «M על AB» סותר את «M אמצע BC» — אי אפשר לקיים את שניהם יחד: הם מתקיימים רק אם המשולש ABC שטוח (כל קודקודיו על ישר אחד).',
    );
  }, 120_000);

  it.each<[string, string[], string[]]>([
    ['the mirror slot', ['משולש ABC', 'D אמצע AC', 'D על AB'], ['D אמצע AC']],
    ['a metric given first (not named)', ['משולש ABC', 'AB = 3', 'M אמצע BC', 'M על AB'], ['M אמצע BC']],
    ['the long Hebrew form', ['משולש ABC', 'נקודה M היא אמצע BC', 'נקודה M על הצלע AB'], ['נקודה M היא אמצע BC']],
    ['English', ['triangle ABC', 'M is the midpoint of BC', 'M on AB'], ['M is the midpoint of BC']],
    ['a line through two midpoints', ['משולש ABC', 'M אמצע BC', 'N אמצע AC', 'M על AN'], ['M אמצע BC', 'N אמצע AC']],
  ])('%s is refused at all 24 seeds', (_name, lines, others) => {
    for (const seed of SEEDS_24) refusesCollapse(lines, seed, others);
  }, 120_000);

  it('the metric given takes no part in the conflict, so it is not named', () => {
    expect(plain(errorText3(he, run(['משולש ABC', 'AB = 3', 'M אמצע BC', 'M על AB'], 0).error))).not.toContain('«AB = 3»');
  });

  it('the English locale words the same refusal', () => {
    expect(plain(errorText3(en, run(['triangle ABC', 'M is the midpoint of BC', 'M on AB'], 0).error))).toBe(
      "Can't do that: «M on AB» contradicts «M is the midpoint of BC» — they can't both hold: only a flat triangle ABC (all its vertices on one line) satisfies both.",
    );
  });
});

describe('#1847 — what does not change', () => {
  it('the forward order keeps its refusal (#1815)', () => {
    for (const seed of SEEDS_24) {
      const r = run(['משולש ABC', 'M על AB', 'M אמצע BC'], seed);
      expect(r.refusedAt).toBe(2);
      expect(r.error).toMatchObject({ code: 'polygon-collapsed', stated: 'M אמצע BC', others: ['M על AB'] });
    }
  }, 120_000);

  it('a membership claim that holds still records (the centroid on the median)', () => {
    for (const seed of SEEDS_24.slice(0, 8)) {
      const r = run(['משולש ABC', 'E מפגש התיכונים במשולש ABC', 'M אמצע BC', 'E על AM'], seed);
      expect(r.refusedAt, `seed ${seed}: ${JSON.stringify(r.error)}`).toBe(-1);
      const d = derive3(r.st.facts, r.st.seed);
      for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
    }
  }, 60_000);

  it('a false membership a non-flat figure could satisfy keeps «בדקו את החישוב» (scope: no flat polygon collapses)', () => {
    // #1897 (armed) makes this sentence BUILD; when it lands it flips this lock in place. Not re-asserted beyond it.
    for (const seed of SEEDS_24) {
      const r = run(['פירמידה SABC', 'SO גובה הפירמידה', 'M אמצע BC', 'O על AM'], seed);
      expect(r.refusedAt, `seed ${seed}`).toBe(3);
      expect(r.error, `seed ${seed}`).toMatchObject({ code: 'claim-refuted' });
    }
  }, 120_000);
});

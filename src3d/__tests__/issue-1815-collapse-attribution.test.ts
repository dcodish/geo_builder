/**
 * #1815 (ADR-3D-309) — A COLLAPSE AN INCIDENCE INVENTED IS REFUSED; A COLLAPSE THE GIVENS STATE IS DRAWN.
 *
 * «משולש ABC» · «M על AB» · «M אמצע BC» built GREEN with the triangle flattened onto a line (24/24
 * seeds, every fact `ok`): M can be on AB and the midpoint of BC at once only when A, B, C are
 * collinear. The pivot's flat-ring rule (ADR-3D-268 part 2) kept an all-collapsed pool on the inference
 * "nothing else satisfies the givens, so the collapse was stated" — but "nothing else satisfies" means the
 * givens FORCE the flatness, not that the student stated it.
 *
 * The fix attributes the collapse: the figure is re-solved without the residual rows the riders read
 * (the incidences). If that reduced figure can be open, an incidence invented the collapse — refused,
 * naming both statements (`err.polygonCollapsed`). If the reduced figure is still flat, the
 * non-incidence givens force it («AB = 5 · BC = 3 · AC = 8») and it is drawn, as before (FR-RD-7).
 * Everything goes through the real submit decision `decideSubmit3`; the per-fix unit test reads the
 * pivot's own record through `resolve3`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, type Construction3 } from '../engine/types';
import { parse3 } from '../parser/parse3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';

type St = { facts: Fact3[]; seed: number };
type P3 = { x: number; y: number; z: number };

/** Submit the lines from an empty canvas at `seed`; stops at the first line that does not record. */
function run(lines: readonly string[], seed: number) {
  let st: St = { facts: [], seed };
  let lastMs = 0;
  for (let i = 0; i < lines.length; i++) {
    const t0 = performance.now();
    const v = decideSubmit3(st, lines[i]);
    lastMs = performance.now() - t0;
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null, kind: v.kind, lastMs };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null, kind: 'record' as const, lastMs };
}

/** |Newell normal| / span² of the ring — 0 for a collinear ring, ≈0.4–0.7 for an ordinary triangle. */
function ringArea(pos: ReadonlyMap<string, P3>, ids: readonly string[]): number {
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

const he = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('he')(k, o) as string;
const en = (k: string, o?: Record<string, unknown>) => i18n3d.getFixedT('en')(k, o) as string;
/** The locale wraps interpolated Latin runs in bidi isolates (U+2066–U+2069); compared without them. */
const plain = (s: string | null): string => (s ?? '').replace(/[\u2066-\u2069]/g, '');

const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);

/** Refused at the last line, by the collapse refusal, naming `stated` and `other`; the triangle stays open. */
function refusesCollapse(lines: readonly string[], seed: number, stated: string, other: string): string {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: refused at the last line (got ${r.kind} at ${r.refusedAt})`).toBe(lines.length - 1);
  expect(r.error?.code, `seed ${seed}`).toBe('polygon-collapsed');
  const msg = errorText3(he, r.error)!;
  expect(msg).toContain(`«${stated}»`);
  expect(msg).toContain(`«${other}»`);
  // keep-prior: the standing figure is the open triangle it was before the line
  const d = derive3(r.st.facts, r.st.seed);
  expect(ringArea(d.positions, ['A', 'B', 'C']), `seed ${seed}: the standing triangle is open`).toBeGreaterThan(0.1);
  return msg;
}

/** Builds at `seed`: every line records, every fact is ok. Returns the ring's area ratio. */
function builds(lines: readonly string[], seed: number, ring: readonly string[]): number {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: «${lines[r.refusedAt]}» → ${JSON.stringify(r.error ?? r.kind)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
  return ringArea(d.positions, ring);
}

describe('#1815 — an incidence that only a flat triangle satisfies is refused', () => {
  it('the reported case is refused at all 24 seeds, naming both statements, the triangle unchanged', () => {
    for (const seed of SEEDS_24) refusesCollapse(['משולש ABC', 'M על AB', 'M אמצע BC'], seed, 'M אמצע BC', 'M על AB');
    const msg = refusesCollapse(['משולש ABC', 'M על AB', 'M אמצע BC'], 0, 'M אמצע BC', 'M על AB');
    expect(plain(msg)).toBe('לא ניתן: «M אמצע BC» סותר את «M על AB» — אי אפשר לקיים את שניהם יחד: הם מתקיימים רק אם המשולש ABC שטוח (כל קודקודיו על ישר אחד).');
  }, 120_000);

  it('with «AB = 3» first it is refused too — in under a second (it took 8–11 s to build flat)', () => {
    const lines = ['משולש ABC', 'AB = 3', 'M על AB', 'M אמצע BC'];
    for (const seed of SEEDS_24) refusesCollapse(lines, seed, 'M אמצע BC', 'M על AB');
    const r = run(lines, 0);
    expect(r.lastMs).toBeLessThan(1000);
    // the metric given is not part of the conflict, so it is not named
    expect(errorText3(he, r.error)).not.toContain('«AB = 3»');
  }, 120_000);

  it.each<[string, string[], string, string]>([
    ['the mirror slot', ['משולש ABC', 'D על AB', 'D אמצע AC'], 'D אמצע AC', 'D על AB'],
    ['an extra, unrelated rider', ['משולש ABC', 'D על AB', 'E על BC', 'D אמצע AC'], 'D אמצע AC', 'D על AB'],
    ['the long Hebrew form', ['משולש ABC', 'נקודה M על הצלע AB', 'M היא אמצע BC'], 'M היא אמצע BC', 'נקודה M על הצלע AB'],
    ['English', ['triangle ABC', 'M on AB', 'M is the midpoint of BC'], 'M is the midpoint of BC', 'M on AB'],
  ])('%s is refused at all 24 seeds', (_name, lines, stated, other) => {
    for (const seed of SEEDS_24) refusesCollapse(lines, seed, stated, other);
  }, 120_000);

  it('the extra rider E is not named — it takes no part in the conflict', () => {
    const r = run(['משולש ABC', 'D על AB', 'E על BC', 'D אמצע AC'], 0);
    expect(errorText3(he, r.error)).not.toContain('«E על BC»');
  });

  it('the English locale words the same refusal', () => {
    const r = run(['triangle ABC', 'M on AB', 'M is the midpoint of BC'], 0);
    expect(plain(errorText3(en, r.error))).toBe(
      "Can't do that: «M is the midpoint of BC» contradicts «M on AB» — they can't both hold: only a flat triangle ABC (all its vertices on one line) satisfies both.",
    );
  });

  it('the reverse order («M אמצע BC» then «M על AB») is refused, the triangle unchanged', () => {
    // The plan asked for the SAME named refusal here. It is not reachable by this mechanism: the reverse
    // order records «M על AB» as a CLAIM about a derived point (no rider, no pivot), so it keeps its
    // pre-existing `claim-refuted`. Refused either way — never drawn flat. (Deviation recorded in ADR-3D-309;
    // the wording is #1847.)
    for (const seed of [0, 1, 2, 3]) {
      const r = run(['משולש ABC', 'M אמצע BC', 'M על AB'], seed);
      expect(r.refusedAt).toBe(2);
      expect(ringArea(derive3(r.st.facts, r.st.seed).positions, ['A', 'B', 'C'])).toBeGreaterThan(0.1);
    }
  });
});

describe('#1815 — a flatness the givens themselves force is still drawn (FR-RD-7)', () => {
  it.each<[string, string[]]>([
    ['5 · 3 · 8', ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']],
    ['4 · 4 · 8', ['משולש ABC', 'AB = 4', 'BC = 4', 'AC = 8']],
  ])('the degenerate triangle %s builds at all 24 seeds', (_name, lines) => {
    for (const seed of SEEDS_24) expect(builds(lines, seed, ['A', 'B', 'C'])).toBeLessThan(1e-4);
  }, 300_000);

  it.each<[string, string[]]>([
    ['the rider last', ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8', 'D על AB', 'CD = 4']],
    ['the rider first', ['משולש ABC', 'D על AB', 'CD = 4', 'AB = 5', 'BC = 3', 'AC = 8']],
  ])('5 · 3 · 8 with a rider and a length on it builds (%s) — the incidence-free givens are flat', (_name, lines) => {
    for (const seed of [0, 1]) expect(builds(lines, seed, ['A', 'B', 'C'])).toBeLessThan(1e-4);
  }, 300_000);

  it.each<[string, string[]]>([
    ['Hebrew', ['מרובע ABCD', 'AB מתלכד עם CD']],
    ['English', ['quadrilateral ABCD', 'AB coincides with CD']],
  ])('a stated coincidence of two sides is drawn (%s)', (_name, lines) => {
    for (const seed of SEEDS_24) builds(lines, seed, ['A', 'B', 'C', 'D']);
  }, 120_000);

  it.each<[string, string[]]>([
    ['a rider length (#1735)', ['משולש ABC', 'D על AB', 'AD = 3']],
    ['a placement condition (#1730)', ['משולש ABC', 'D על BC ונתון כי AD = AC']],
    ['a perpendicular from a midpoint (#1499)', ['ABC משולש', 'M אמצע BC', 'SM⊥ABC']],
  ])('an open figure with a rider still builds open: %s', (_name, lines) => {
    for (const seed of [0, 1, 2, 3]) expect(builds(lines, seed, ['A', 'B', 'C'])).toBeGreaterThan(0.1);
  }, 120_000);
});

describe('#1815 — the pivot records an invented collapse (unit)', () => {
  const build = (lines: string[]): Construction3 => {
    let c = emptyConstruction3();
    for (const line of lines) {
      const p = parse3(line);
      if (!p.ok) throw new Error(`parse «${line}»`);
      for (const cmd of p.commands) {
        const r = applyCommand3(c, cmd);
        if (!r.ok) throw new Error(`apply «${line}»: ${JSON.stringify(r.error)}`);
        c = r.next;
      }
    }
    return c;
  };

  it('an incidence-forced collapse: no solution, and the record names the ring and the rider', () => {
    const pivot = resolve3(build(['משולש ABC', 'M על AB', 'M אמצע BC']), 0).pivot;
    expect(pivot?.solutions).toBe(0);
    // joined, so the #1394 harvest does not read these id lists as a typed sequence
    expect(pivot?.collapse?.ring.join('')).toBe('ABC');
    expect(pivot?.collapse?.riderKeys.join(',')).toBe('M');
  });

  it('a metric-forced collapse with a rider: solved, flat, and no record', () => {
    const pivot = resolve3(build(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8', 'D על AB', 'CD = 4']), 0).pivot;
    expect(pivot?.solutions).toBeGreaterThan(0);
    expect(pivot?.collapse).toBeUndefined();
  }, 60_000);
});

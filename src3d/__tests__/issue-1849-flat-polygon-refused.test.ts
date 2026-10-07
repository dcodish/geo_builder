/**
 * #1849 (ADR-3D-310, operator ruling 2026-10-07, ADR-W-115) — A DECLARED POLYGON THE GIVENS COLLAPSE FLAT
 * IS REFUSED, whatever forced it.
 *
 * The operator: *"refuse on all tools with a message since it contradicts ABC is a triangle and a flat line
 * is not a triangle"*. Before this, 3-D drew «משולש ABC · AB = 5 · BC = 3 · AC = 8» flat with no notice, and
 * built «מרובע ABCD · AB מתלכד עם CD». #1815 (ADR-3D-309) refused only a collapse an incidence on a rider
 * INVENTED; ADR-3D-268 part 2 kept every other all-collapsed pool. That exception is retired for declared
 * polygons: the pivot keeps only solutions with every declared ring open (`settleFlatRings`), and with none
 * the line that completed the collapse is refused (`polygon-collapsed`, `forced`), naming the givens that
 * force it. A polygon declared over points that ALREADY exist is a statement about them (M1, #116): its
 * ring-open meaning is now recorded as a `polygon-open` claim and verified, so the same rule reaches it.
 *
 * Not changed: the #936 notice for a SOLID the givens flatten (a pyramid's apex in its base plane) — a solid
 * is not a declared polygon (ADR-W-115 keeps the notice there), and a thin-but-real triangle builds.
 * Everything runs through the real submit decision `decideSubmit3`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { applyCommand3 } from '../engine/apply';
import { emptyConstruction3, type Construction3 } from '../engine/types';
import { ringCollapsed3, v3 } from '../engine/vec3';
import { parse3 } from '../parser/parse3';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';

type St = { facts: Fact3[]; seed: number };
type P3 = { x: number; y: number; z: number };

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

/** |spanning normal| / span² of the ring — 0 for a collinear ring. */
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
const plain = (s: string | null): string => (s ?? '').replace(/[⁦-⁩]/g, '');
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);

/** Refused on the LAST line with the forced-collapse wording, naming `stated` and `others`; the line was not added. */
function refused(lines: readonly string[], seed: number, ring: string, others: readonly string[]): number {
  const r = run(lines, seed);
  const last = lines.length - 1;
  expect(r.refusedAt, `seed ${seed}: refused at «${lines[last]}» (got ${r.kind} at ${r.refusedAt})`).toBe(last);
  expect(r.error, `seed ${seed}`).toMatchObject({ code: 'polygon-collapsed', stated: lines[last], ring, forced: true });
  const msg = errorText3(he, r.error)!;
  for (const o of others) expect(msg, `seed ${seed}`).toContain(`«${o}»`);
  expect(r.st.facts.length, 'keep-prior: the refused line is not a fact').toBe(last);
  return r.lastMs;
}

/** Builds at `seed`: every line records, every fact is ok. Returns the ring's area ratio. */
function builds(lines: readonly string[], seed: number, ring: readonly string[]): number {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: «${lines[r.refusedAt]}» → ${JSON.stringify(r.error ?? r.kind)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
  return ringArea(d.positions, ring);
}

describe('#1849 — a declared polygon the givens force flat is refused, naming the givens', () => {
  it.each<[string, string[], string, string[]]>([
    ['5 · 3 · 8, the other order', ['משולש ABC', 'AC = 8', 'BC = 3', 'AB = 5'], 'ABC', ['AC = 8', 'BC = 3']],
    ['a coincidence of two sides of a triangle', ['משולש ABC', 'AB מתלכד עם BC'], 'ABC', []],
    ['a triangle on three collinear coordinates (bound)', ['A(0,0,0)', 'B(1,0,0)', 'C(2,0,0)', 'משולש ABC'], 'ABC', ['A(0,0,0)', 'B(1,0,0)', 'C(2,0,0)']],
    ['a triangle through a side\'s midpoint (bound)', ['משולש ABC', 'D אמצע AB', 'משולש ADB'], 'ADB', ['D אמצע AB']],
    ['the coordinates given after the triangle', ['משולש ABC', 'A(0,0,0)', 'B(1,0,0)', 'C(2,0,0)'], 'ABC', ['A(0,0,0)', 'B(1,0,0)']],
  ])('%s is refused at all 24 seeds', (_name, lines, ring, others) => {
    for (const seed of SEEDS_24) refused(lines, seed, ring, others);
  }, 120_000);

  it('the exact Hebrew and English wording names every given and says a line is not a triangle', () => {
    const r = run(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'], 0);
    expect(plain(errorText3(he, r.error))).toBe(
      'לא ניתן: «AC = 8» יחד עם «AB = 5», «BC = 3» מתקיימים רק אם המשולש ABC שטוח (כל קודקודיו על ישר אחד) — וקו ישר אינו משולש.',
    );
    expect(plain(errorText3(en, r.error))).toBe(
      "Can't do that: «AC = 8» together with «AB = 5», «BC = 3» hold only if triangle ABC is flat (all its vertices on one line) — and a line is not a triangle.",
    );
    const q = run(['מרובע ABCD', 'AB מתלכד עם CD'], 0);
    expect(plain(errorText3(he, q.error))).toBe(
      'לא ניתן: «AB מתלכד עם CD» מתקיים רק אם המרובע ABCD שטוח (כל קודקודיו על ישר אחד) — וקו ישר אינו מרובע.',
    );
  });

  it('the refusal is fast — under a second for the completing line, at every seed', () => {
    for (const seed of SEEDS_24) {
      expect(refused(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8'], seed, 'ABC', ['AB = 5', 'BC = 3'])).toBeLessThan(1000);
      expect(refused(['מרובע ABCD', 'AB מתלכד עם CD'], seed, 'ABCD', [])).toBeLessThan(1000);
    }
  }, 120_000);

  it('an unrelated given elsewhere on the figure is not named', () => {
    const r = run(['משולש ABC', 'משולש DEF', '∠DEF = 50°', 'AB = 5', 'BC = 3', 'AC = 8'], 0);
    expect(r.refusedAt).toBe(5);
    expect(errorText3(he, r.error)).not.toContain('∠DEF');
  });
});

describe('#1849 — controls: a thin but real figure builds, and so does a coincidence across two polygons', () => {
  it.each<[string, string[], string[]]>([
    ['5 · 3 · 7.99 (thin, not flat)', ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.99'], ['A', 'B', 'C']],
    ['an angle of 3°', ['משולש ABC', '∠ABC = 3°'], ['A', 'B', 'C']],
    ['a triangle on three non-collinear coordinates (bound)', ['A(0,0,0)', 'B(1,0,0)', 'C(2,1,0)', 'משולש ABC'], ['A', 'B', 'C']],
    ['a triangle through a side\'s midpoint and the opposite vertex (bound)', ['משולש ABC', 'D אמצע AB', 'משולש ACD'], ['A', 'C', 'D']],
    ['two sides of different triangles coincide', ['משולש ABC', 'משולש DEF', 'AB מתלכד עם DE'], ['A', 'B', 'C']],
  ])('%s builds open at all 24 seeds', (_name, lines, ring) => {
    for (const seed of SEEDS_24) expect(builds(lines, seed, ring), `seed ${seed}`).toBeGreaterThan(1e-3);
  }, 120_000);

  it('a SOLID the givens flatten keeps its #936 notice (ADR-W-115 scopes the refusal to declared polygons)', () => {
    const lines = ['פירמידה SABCD', '∠BAS = 40', '∠DAS = 50'];
    const r = run(lines, 0);
    expect(r.refusedAt).toBe(-1);
    expect(derive3(r.st.facts, r.st.seed).notices.some((n) => n.kind === 'solid-degenerate')).toBe(true);
  });
});

describe('#1849 — the mechanism (unit)', () => {
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

  it('a metric-forced collapse with no rider: the pivot has no solution and records a forced collapse', () => {
    const pivot = resolve3(build(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']), 0).pivot;
    expect(pivot?.solutions).toBe(0);
    expect(pivot?.collapse).toMatchObject({ forced: true });
    expect(pivot?.collapse?.ring.join('')).toBe('ABC');
  });

  it('a thin triangle solves, with no record', () => {
    const pivot = resolve3(build(['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.99']), 0).pivot;
    expect(pivot?.solutions).toBeGreaterThan(0);
    expect(pivot?.collapse).toBeUndefined();
  });

  it('a polygon declared over existing points records ONE ring-open claim, whatever the order', () => {
    const c = build(['A(0,0,0)', 'B(1,0,0)', 'C(2,1,0)', 'משולש ABC', 'משולש CBA']);
    expect(c.claims.filter((k) => k.type === 'polygon-open')).toHaveLength(1);
    // a declaration over a polygon the figure already has adds none
    expect(build(['משולש ABC', 'משולש CAB']).claims.filter((k) => k.type === 'polygon-open')).toHaveLength(0);
  });

  it('the one flatness predicate: collinear is collapsed, thin is not', () => {
    expect(ringCollapsed3([v3(0, 0, 0), v3(1, 0, 0), v3(2, 0, 0)])).toBe(true);
    expect(ringCollapsed3([v3(0, 0, 0), v3(5, 0, 0), v3(2.5, 0.05, 0)])).toBe(false);
  });
});

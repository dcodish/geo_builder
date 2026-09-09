/**
 * #936 ([ADR-3D-234](../../docs/06b-decisions-3d.md), [ADR-W-048](../../docs/06w-decisions-workspace.md)) —
 * A FIGURE WHOSE GIVENS FORCE IT FLAT SAYS SO.
 *
 * The operator, playing round #931's T12: *"the image collapsed to a 2d diagram."* He was right about
 * what he saw, and the tool was right too — «∠BAS = 40» + «∠DAS = 50» at a right-angled corner puts the
 * apex exactly in the base plane, because `cos²40° + cos²50° ≡ 1`. Every given was honoured. What was
 * missing is that nothing TOLD him.
 *
 * Operator ruling, 2026-09-08 (`/decisions`): a **notice**, not the DOF cue (a number cannot name which
 * statements forced the collapse) and not a refusal (the drawing is the only one satisfying the givens).
 *
 * The tolerance is the deliverable, so the calibration is a LOCK rather than a one-off measurement: the
 * corpus sweep below is the false-positive net, and it is the test that matters.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { derive3, useGeo3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';
import { DEGENERATE_FLAT_RATIO, type BuildNotice3 } from '../engine/notices';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const build = (us: string[]) => {
  reset();
  for (const u of us) st().submit(u);
  return derive3(st().facts, st().seed);
};
type Degenerate = Extract<BuildNotice3, { kind: 'solid-degenerate' }>;
const flat = (us: string[]): Degenerate[] =>
  build(us).notices.filter((n): n is Degenerate => n.kind === 'solid-degenerate');

describe('#936 — the reported figure says it is flat, and names the statements', () => {
  beforeEach(reset);

  it('«פירמידה» + ∠BAS=40 + ∠DAS=50 produces exactly one notice', () => {
    const notices = flat(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 40', 'זווית DAS = 50']);
    expect(notices, 'one notice, for the one solid').toHaveLength(1);
    expect(notices[0].ids.join(''), 'named the way the student named it').toBe('ABCDS');
  });

  it('the notice names the STUDENT’S statements — the two angles, not the «פירמידה» line', () => {
    const [n] = flat(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 40', 'זווית DAS = 50']);
    expect(n.because).toEqual([
      { kind: 'angle', ids: ['B', 'A', 'S'], value: 40 },
      { kind: 'angle', ids: ['D', 'A', 'S'], value: 50 },
    ]);
    // The declaration is not a given that forces anything — blaming it would send the student to the
    // wrong line. This is the half the DOF cue was explicitly rejected for.
    expect(n.because.every((b) => b.kind === 'angle'), 'only the angles are implicated').toBe(true);
  });

  it('every fact still reports ok — this is a NOTICE, never a refusal', () => {
    const d = build(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 40', 'זווית DAS = 50']);
    expect(st().lastError, 'nothing failed').toBeNull();
    for (const f of st().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  });

  it('the CLASS, not the instance: any complementary pair at the corner trips it', () => {
    // cos²θ + cos²(90−θ) ≡ 1 for every θ — 40/50 is one member of a family, and the predicate is over
    // coplanarity, not over "pyramids with two angles at A".
    for (const [a, b] of [
      [30, 60],
      [35, 55],
      [20, 70],
    ]) {
      expect(flat(['פירמידה SABCD שבסיסה ריבוע', `זווית BAS = ${a}`, `זווית DAS = ${b}`]), `${a}/${b}`).toHaveLength(1);
    }
  });
});

describe('#936 — the false-positive net (the one that matters)', () => {
  beforeEach(reset);

  it('the SAME figure with non-complementary angles is silent', () => {
    expect(flat(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 50', 'זווית DAS = 60'])).toEqual([]);
  });

  it('ordinary solids are silent', () => {
    expect(flat(['פירמידה SABCD שבסיסה ריבוע']), 'a bare pyramid').toEqual([]);
    expect(flat(["קובייה ABCDA'B'C'D'"]), 'a cube').toEqual([]);
    expect(flat(["תיבה ABCDA'B'C'D'"]), 'a box').toEqual([]);
    expect(flat(['מנסרה ישרה משולשת ABC']), 'a prism').toEqual([]);
  });

  it('the FLAT-BY-DESIGN polygon lane is exempt — it never had an extent to collapse', () => {
    expect(flat(['מרובע ABCD']), 'the V8-g 2-D vector lane').toEqual([]);
    expect(flat(['משולש ABC'])).toEqual([]);
  });

  it('a legitimately THIN solid is not a degenerate one — the boundary, measured', () => {
    // THE lock on the tolerance. One degree off complementary is the nearest figure that is genuinely
    // thin rather than collapsed: measured flatness 9.8e-2 against the degenerate case's 1.8e-3, a 54×
    // step across a single degree. If ε ever widens far enough to swallow this, a student gets told
    // their perfectly drawable pyramid is flat — so this is the assertion that guards the constant.
    expect(flat(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 41', 'זווית DAS = 50']), '41/50 is thin, not flat').toEqual([]);
    // …and the rest of the near-miss family, so the boundary is not a single lucky point.
    for (const [a, b] of [
      [42, 50],
      [35, 56],
      [30, 61],
    ]) {
      expect(flat(['פירמידה SABCD שבסיסה ריבוע', `זווית BAS = ${a}`, `זווית DAS = ${b}`]), `${a}/${b}`).toEqual([]);
    }
  });
});

/**
 * THE CALIBRATION LOCK. `DEGENERATE_FLAT_RATIO` is the deliverable of this issue, and a threshold
 * asserted only against the figure that motivated it is a threshold nobody is measuring. Every fixture
 * in the corpus replays through the real load path and must stay clear of it — so a future change that
 * flattens a legitimate figure, or a widened tolerance, fails HERE rather than by shipping a false
 * notice to a student.
 */
describe('#936 — ε calibrated against the whole fixtures3 corpus', () => {
  const DIR = join(__dirname, '..', '..', 'fixtures3');
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')) : [];

  it('the corpus is actually there (a vacuous sweep proves nothing)', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it('no corpus figure produces a degeneracy notice', () => {
    const offenders: string[] = [];
    let solidsSeen = 0;
    for (const file of files) {
      const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
      if (!r.ok) continue;
      const d = derive3(r.facts, r.seed);
      solidsSeen += d.construction.solids.length;
      for (const n of d.notices) {
        if (n.kind === 'solid-degenerate') offenders.push(`${file}: ${n.ids.join('')}`);
      }
    }
    // The counter is the anti-vacuity guard: a sweep that examined no solids would pass silently.
    expect(solidsSeen, 'the sweep actually examined solids').toBeGreaterThan(0);
    expect(offenders, 'a corpus figure tripped the degeneracy predicate').toEqual([]);
  });

  it('the threshold is where the ADR says it is', () => {
    expect(DEGENERATE_FLAT_RATIO).toBe(1e-2);
  });
});

describe('#936 — i18n', () => {
  it('both languages carry the notice and every cause wording', () => {
    for (const [lang, j] of [
      ['he', he],
      ['en', en],
    ] as const) {
      const n = (j as { notice: Record<string, unknown> }).notice;
      expect(n.solidDegenerate, `${lang}: the notice`).toBeTruthy();
      expect(n.solidDegenerateBare, `${lang}: the no-causes variant`).toBeTruthy();
      expect(n.causeJoin, `${lang}: the join`).toBeTruthy();
      const cause = n.cause as Record<string, string>;
      // Every cause kind the engine can emit must have wording, in both languages.
      for (const kind of ['angle', 'length']) expect(cause?.[kind], `${lang}: cause.${kind}`).toBeTruthy();
      expect(String(n.solidDegenerate), `${lang}: names the solid and the reason`).toContain('{{ids}}');
      expect(String(n.solidDegenerate), `${lang}: carries the statements`).toContain('{{because}}');
    }
  });
});

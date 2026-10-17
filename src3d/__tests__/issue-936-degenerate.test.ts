/**
 * #936 ([ADR-3D-234](../../docs/06b-decisions-3d.md)) → #1860 ([ADR-3D-358](../../docs/06b-decisions-3d.md#adr-3d-358)) —
 * A SOLID WHOSE GIVENS FORCE IT FLAT.
 *
 * The operator, playing round #931's T12: *"the image collapsed to a 2d diagram."* «∠BAS = 40» + «∠DAS = 50» at a
 * right-angled corner puts the apex exactly in the base plane, because `cos²40° + cos²50° ≡ 1`. #936 (ruling
 * 2026-09-08) answered with a NOTICE. **Flipped in place by the ruling of 2026-10-07 on #1860** (*"we should refuse
 * this as well since it contradicts the pyramid statement"*; *"a flat figure is not a pyramid / prism / …"*): the
 * line that completes the flatness is REFUSED and the pyramid is never drawn flat. The notice is retired.
 *
 * What stays from #936, and is the part that matters: the boundary. A thin but real solid (41/50 and the near-miss
 * family) builds with no notice and no refusal, and no figure in the `fixtures3/` corpus is refused.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';
import { SOLID_THIN_RATIO } from '../engine/solve3';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

function run(lines: readonly string[], seed = 0) {
  let st: { facts: Fact3[]; seed: number } = { facts: [], seed };
  for (let i = 0; i < lines.length; i++) {
    const v = decideSubmit3(st, lines[i]);
    if (v.kind !== 'record') return { st, refusedAt: i, error: v.kind === 'refused' ? v.error : null };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, error: null };
}
const builds = (lines: readonly string[]) => {
  const r = run(lines);
  expect(r.refusedAt, `«${lines[r.refusedAt]}» → ${JSON.stringify(r.error)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(d.notices.map((n) => n.kind as string), 'no flat-solid notice exists any more').not.toContain('solid-degenerate');
};
const refusedFlat = (lines: readonly string[]) => {
  const r = run(lines);
  expect(r.refusedAt, lines.join(' · ')).toBe(lines.length - 1);
  expect(r.error).toMatchObject({ code: 'polygon-collapsed', forced: true, solid: 'pyramid' });
};

describe('#936 → #1860 — the reported figure is refused, not drawn flat', () => {
  it('«פירמידה» + ∠BAS=40 + ∠DAS=50 is refused on its third line', () => {
    refusedFlat(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 40', 'זווית DAS = 50']);
  });

  it('the CLASS, not the instance: any complementary pair at the corner is refused', () => {
    for (const [a, b] of [
      [30, 60],
      [35, 55],
      [20, 70],
    ]) refusedFlat(['פירמידה SABCD שבסיסה ריבוע', `זווית BAS = ${a}`, `זווית DAS = ${b}`]);
  }, 60_000);
});

describe('#936 — the false-positive net (the one that matters)', () => {
  it('the SAME figure with non-complementary angles builds', () => {
    builds(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 50', 'זווית DAS = 60']);
  });

  it('ordinary solids build', () => {
    builds(['פירמידה SABCD שבסיסה ריבוע']);
    builds(["קובייה ABCDA'B'C'D'"]);
    builds(["תיבה ABCDA'B'C'D'"]);
    builds(['מנסרה ישרה משולשת ABC']);
  });

  it('a legitimately THIN solid is not a flat one — the boundary, measured', () => {
    // One degree off complementary is the nearest figure that is genuinely thin rather than collapsed (#936's
    // calibration: flatness 9.8e-2 against the degenerate case's 1.8e-3). If the judgement ever reaches it, a
    // student is refused a perfectly drawable pyramid — so this guards the band.
    builds(['פירמידה SABCD שבסיסה ריבוע', 'זווית BAS = 41', 'זווית DAS = 50']);
    for (const [a, b] of [
      [42, 50],
      [35, 56],
      [30, 61],
    ]) builds(['פירמידה SABCD שבסיסה ריבוע', `זווית BAS = ${a}`, `זווית DAS = ${b}`]);
  }, 60_000);

  it('the thin band is where the ADRs say it is', () => {
    expect(SOLID_THIN_RATIO).toBe(1e-2);
  });
});

describe('#936 — the fixtures3 corpus', () => {
  const DIR = join(__dirname, '..', '..', 'fixtures3');
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')) : [];

  it('no corpus figure is refused as a flat solid', () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
    const offenders: string[] = [];
    let solidsSeen = 0;
    for (const file of files) {
      const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
      if (!r.ok) continue;
      const d = derive3(r.facts, r.seed);
      solidsSeen += d.construction.solids.length;
      for (const f of r.facts) {
        const s = d.status[f.id];
        if (typeof s === 'object' && s.code === 'polygon-collapsed' && s.solid) offenders.push(`${file}: «${f.utterance}»`);
      }
    }
    expect(solidsSeen, 'the sweep actually examined solids').toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe('#1860 — i18n: the notice is retired in both languages', () => {
  it('no locale carries the flat-solid notice', () => {
    for (const j of [he, en]) {
      const n = (j as { notice: Record<string, unknown> }).notice;
      expect(n.solidDegenerate).toBeUndefined();
      expect(n.solidDegenerateBare).toBeUndefined();
      expect(n.cause).toBeUndefined();
    }
  });
});

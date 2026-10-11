/**
 * #1987 ([ADR-622](../../../docs/06-decisions.md#adr-622)) — A FREE QUADRILATERAL READ IN A SECOND ORDER IS
 * DRAWN AS A CONCAVE QUADRILATERAL, NOT REFUSED.
 *
 * Operator ruling (#1927, 2026-10-09, re-affirmed on #1987 2026-10-10): *"Search first, refuse last … Refuse
 * only when nothing the student wrote can save it."* Four points in NON-convex position have three simple
 * ring orders, not one, so «מרובע ABCD» followed by «מרובע ABDC» has a drawing — and analytic draws it.
 *
 * Measured on `main` @ 06fc51dd through the real submit door (`decideDeterministic2D` → `forcedCrossedRing`):
 * the line was refused with the ring message in 14 ms. [ADR-613](../../../docs/06-decisions.md#adr-613) had
 * taught `polygonsConvex` to YIELD the convexity default to a second declared ring, but left every vertex on
 * the convex SEAT and registered no axis naming the choice, so `findValidConfig` returned null in 2 ms (2 of
 * 200 raw seeds are concave; the sweep covers 40). The root cause is the missing CONFIGURATION DIMENSION, not
 * the predicate.
 *
 * Driven through the REAL door (`runSubmit` with the App's post-commit view search); the model is mocked and
 * must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { replay, useGeoStore } from '@/store/geoStore';
import { configurationAxes, findValidConfig, meetsRequirements } from '@/replay/core';
import { factsOf } from '../../__tests__/scenarios-harness';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

const strip = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
const RING_HE = (line: string) =>
  `הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: "${line}". אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.`;
const NO_CONFIG_HE = () => strip(i18n.t('figure.noValidConfig', { lng: 'he' }) as string);

type P = { x: number; y: number };

/** Play `lines` through the submit door with the App's resolve wiring; the notes the student saw on the LAST line. */
async function play(lines: string[]) {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
  useGeoStore.getState().clear();
  let notes: string[] = [];
  let beforeFacts = useGeoStore.getState().facts;
  for (const [i, line] of lines.entries()) {
    if (i === lines.length - 1) beforeFacts = useGeoStore.getState().facts;
    notes = [];
    let resolving: Promise<void> = Promise.resolve();
    const deps: SubmitDeps = {
      t: (key, opts) => t(key, opts),
      locale: 'he',
      ui: { setInputNote: (m) => m && notes.push(strip(m)), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const r = replay(st.facts, st.seed);
        return { construction: r.construction, positions: r.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {
        resolving = runViewResolve({
          getState: () => useGeoStore.getState(),
          meetsRequirements,
          autoResolve: async (facts, seed) => {
            const f = findValidConfig(facts, seed);
            return f ? { ...f, fold: null } : null;
          },
          applyView: (found) => useGeoStore.getState().applyView({ facts: found.facts, seed: found.seed }),
          setPending: () => {},
          onExhausted: () => notes.push(strip(t('figure.noValidConfig'))),
          isCancelled: () => false,
        });
      },
      llmAbortRef: { current: null },
      explainError: (raw, said) => humanizeError(raw, t, said),
    };
    await runSubmit(line, deps);
    await resolving;
  }
  const st = useGeoStore.getState();
  return { notes, facts: st.facts, seed: st.seed, positions: replay(st.facts, st.seed).positions as Map<string, P>, beforeFacts };
}

/** Do two non-adjacent sides of the ring properly cross at these positions? */
function crossed(ids: string[], at: Map<string, P>): boolean {
  const p = ids.map((id) => at.get(id));
  if (p.some((q) => !q)) return false;
  const q = p as P[];
  const side = (o: P, a: P, b: P) => Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
  const n = q.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [q[i], q[(i + 1) % n], q[j], q[(j + 1) % n]];
      if (side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0) return true;
    }
  return false;
}

/** Is the ring CONVEX at these positions (every turn the same way)? */
function convexRing(ids: string[], at: Map<string, P>): boolean {
  const p = ids.map((id) => at.get(id)) as P[];
  if (p.some((q) => !q)) return false;
  const n = p.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const turn = Math.sign((p[(i + 1) % n].x - p[i].x) * (p[(i + 2) % n].y - p[i].y) - (p[(i + 1) % n].y - p[i].y) * (p[(i + 2) % n].x - p[i].x));
    if (turn === 0) return false;
    if (sign === 0) sign = turn;
    else if (turn !== sign) return false;
  }
  return true;
}

const axisKinds = (lines: string[]) => {
  const facts = factsOf(lines);
  return configurationAxes(facts, replay(facts).construction).map((a) => a.kind);
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1987 — a free quadrilateral read in a second order commits and draws concave', () => {
  // The operator's row, and every other second order of the same four free points: the CLASS is "another
  // order", not the letters ABDC. Four points in non-convex position have three simple rings.
  for (const second of ['מרובע ABDC', 'מרובע ACBD', 'מרובע ADBC']) {
    it(`«מרובע ABCD · ${second}» commits, and both rings are drawn simple`, async () => {
      const r = await play(['מרובע ABCD', second]);
      expect(r.notes, 'no refusal and no exhausted search').toEqual([]);
      expect(r.facts.length, 'the line committed').toBeGreaterThan(r.beforeFacts.length);
      expect(crossed(['A', 'B', 'C', 'D'], r.positions), 'the first ring ABCD').toBe(false);
      const ring = second.split(' ')[1].split('');
      expect(crossed(ring, r.positions), `the declared ring ${ring.join('')}`).toBe(false);
      expect(convexRing(['A', 'B', 'C', 'D'], r.positions), 'the four points are NOT in convex position').toBe(false);
      expect(llmParseMock, 'never escalated to the model').not.toHaveBeenCalled();
    });
  }

  it('the ring stated FIRST is the same figure — the order the student types does not decide it', async () => {
    const r = await play(['מרובע ABDC', 'מרובע ABCD']);
    expect(r.notes).toEqual([]);
    expect(crossed(['A', 'B', 'C', 'D'], r.positions)).toBe(false);
    expect(crossed(['A', 'B', 'D', 'C'], r.positions)).toBe(false);
  });

  it('a kite read in a second order keeps ADR-613’s dart (the reflection tier still owns it)', async () => {
    const r = await play(['דלתון ABCD', 'מרובע ABDC']);
    expect(r.notes).toEqual([]);
    expect(crossed(['A', 'B', 'C', 'D'], r.positions)).toBe(false);
    expect(crossed(['A', 'B', 'D', 'C'], r.positions)).toBe(false);
  });
});

describe('#1987 — the reflex-vertex AXIS is registered exactly where the convexity default yielded', () => {
  it('a plain «מרובע ABCD» registers none — convexity is still its default, and seed 0 draws it convex', async () => {
    expect(axisKinds(['מרובע ABCD'])).not.toContain('reflex');
    const r = await play(['מרובע ABCD']);
    expect(r.notes).toEqual([]);
    expect(convexRing(['A', 'B', 'C', 'D'], r.positions), 'the default drawing is unchanged').toBe(true);
  });

  it('a second order over the same points registers one per yielding ring', () => {
    expect(axisKinds(['מרובע ABCD', 'מרובע ABDC']).filter((k) => k === 'reflex')).toHaveLength(2);
  });

  it('a ring whose vertices are not ours to seat registers none (a midpoint ring)', () => {
    expect(axisKinds(['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABDE'])).not.toContain('reflex');
  });

  it('the axis can put the figure BACK: with the second ring disabled, the search finds a convex drawing', async () => {
    await play(['מרובע ABCD', 'מרובע ABDC']);
    const st0 = useGeoStore.getState();
    useGeoStore.getState().toggle(st0.facts[st0.facts.length - 1].id);
    const st = useGeoStore.getState();
    const found = findValidConfig(st.facts, st.seed);
    expect(found, 'a convex drawing is found again').not.toBeNull();
    expect(convexRing(['A', 'B', 'C', 'D'], replay(found!.facts, found!.seed).positions as Map<string, P>)).toBe(true);
  });
});

describe('#1987 — the shapes that are convex whenever simple keep ADR-608’s refusal', () => {
  // ADR-613: a square, rectangle, rhombus, parallelogram or trapezoid cannot be a dart, so no reflex seat
  // can save its crossed order — the refusal is honest and must not have been widened away.
  for (const lines of [
    ['ריבוע ABCD', 'מרובע ACBD'],
    ['מלבן ABCD', 'מרובע ABDC'],
    ['מעוין ABCD', 'מרובע ABDC'],
    ['מקבילית ABCD', 'מרובע ACBD'],
    ['טרפז ABCD', 'מרובע ACBD'],
    ['מחומש משוכלל ABCDE', 'מחומש ACEBD'],
  ]) {
    it(`«${lines.join(' · ')}» is still refused, naming its line`, async () => {
      const r = await play(lines);
      expect(r.notes).toEqual([RING_HE(lines[1])]);
      expect(r.facts.length, 'nothing committed').toBe(r.beforeFacts.length);
      expect(r.notes, 'never the exhausted-search note').not.toContain(NO_CONFIG_HE());
    });
  }
});

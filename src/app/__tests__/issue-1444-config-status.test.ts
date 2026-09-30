/**
 * #1444 ([ADR-556](../../../docs/06-decisions.md#adr-556)) — ZERO DEGREES OF FREEDOM IS NOT "ONE SHAPE":
 * THE STATUS LINE SAYS WHEN ANOTHER CONFIGURATION EXISTS.
 *
 * External review relayed 2026-09-27: «משולש ישר זווית ABC» + «AB=3, BC=4» read «✓ הציור נקבע במלואו»
 * while the values panel withheld AC, because two shapes are admissible (the right angle at A, AC = √7, or
 * at B, AC = 5). Operator rulings 2026-09-30: no notice about which vertex the tool picked (it read as
 * though A were forced); a note is ADDED to the DOF report —
 *   DOF > 0 → «דרגות חופש: N»; DOF 0 and >1 shape → «דרגות חופש: 0 · יש N תצורות אפשריות — לחצו «הציגו
 *   תצורה אחרת»» (N only when stable across the pool, else «יש יותר מתצורה אחת»); DOF 0 and one shape →
 *   «✓ הציור נקבע במלואו על ידי הנתונים».
 * The verdict is the general `figureDeterminacy` — so the locks are one representative per CAUSE measured
 * by the corpus sweep in ADR-556 (a right-angle seat, a circle–circle crossing choice, a ± root), plus the
 * unique figures and a free one.
 *
 * Driven through the REAL door: `runSubmit` → the commit → `runViewResolve` with the real config search →
 * `applyView`; the status through the store's always-on detect sweep (`detectCrossings`, inline in tests)
 * and the App's own `figureStatus` / `figureStatusParams`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { figureStatus, figureStatusParams } from '../figureStatus';
import { replay, useGeoStore } from '@/store/geoStore';
import { figureDeterminacy, findValidConfig, meetsRequirements, searchAnotherView, sharedSamples } from '@/replay/core';
import { freeDofCount } from '@/engine';
import { studentFacingViolations } from '../../../shell/studentText';
import { factsOf } from '../../__tests__/scenarios-harness';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

const REPORTED = ['משולש ישר זווית ABC', 'AB=3, BC=4'];
/** Measured groups (ADR-556 sweep table) — one representative each. */
const CIRCLE_CROSSING = ['משולש ABC', 'AB=6, BC=5, AC=7', 'מעגל A ברדיוס 4', 'מעגל B ברדיוס 5', 'G חיתוך מעגל A ומעגל B'];
const AREA_ROOT = ['משולש שווה שוקיים ABC', 'AB=AC=5', 'שטח משולש ABC = 12'];
const CIRCLE_MIRROR = ['AB = 6', 'מעגל A ברדיוס 4', 'מעגל B ברדיוס 5', 'G חיתוך מעגל A ומעגל B'];

const TWO_HE = 'דרגות חופש: 0 · יש 2 תצורות אפשריות — לחצו «הציגו תצורה אחרת»';
const MANY_HE = 'דרגות חופש: 0 · יש יותר מתצורה אחת — לחצו «הציגו תצורה אחרת»';
const UNIQUE_HE = '✓ הציור נקבע במלואו על ידי הנתונים';

const strip = (s: string) => s.replace(/[⁦-⁩]/g, ''); // bidi isolates around labels
const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

/** Play `lines` through the submit door with the App's resolve wiring; collect every note the student sees. */
async function play(lines: string[], locale: 'he' | 'en' = 'he') {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: locale }) as string;
  const notes: string[] = [];
  useGeoStore.getState().clear();
  for (const line of lines) {
    let resolving: Promise<void> = Promise.resolve();
    const deps: SubmitDeps = {
      t: (key, opts) => t(key, opts),
      locale,
      ui: { setInputNote: (m) => m && notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
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
          onExhausted: () => notes.push(t('figure.noValidConfig')),
          isCancelled: () => false,
        });
      },
      llmAbortRef: { current: null },
      explainError: (raw, said) => humanizeError(raw, t, said),
    };
    await runSubmit(line, deps);
    await resolving;
  }
  await useGeoStore.getState().detectCrossings();
  const after = useGeoStore.getState();
  const fig = replay(after.facts, after.seed);
  const verdict = after.determinacy?.facts === after.facts ? after.determinacy : null;
  const status = figureStatus(after.facts.length, freeDofCount(fig.construction), verdict);
  return { notes, facts: after.facts, seed: after.seed, fig, status, statusText: status ? strip(t(status.key, figureStatusParams(status))) : null }; // bidi isolates stripped
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1444 — the reported sequence, through the real door', () => {
  it('no notice about the seat; the status adds «יש 2 תצורות אפשריות» to «דרגות חופש: 0»', async () => {
    const r = await play(REPORTED);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => r.fig.positions.get(id)!);
    expect(d(A, B)).toBeCloseTo(3, 4);
    expect(d(B, C)).toBeCloseTo(4, 4);
    expect(d(A, C), 'the default seat C cannot hold; the tool draws one of the admissible seats').toBeCloseTo(Math.sqrt(7), 4);
    expect(r.notes, 'no seat notice (operator 2026-09-30: it read as though A were forced)').toEqual([]);
    expect(r.status).toEqual({ key: 'actions.dofConfigs', n: 2 });
    expect(r.statusText).toBe(TWO_HE);
  }, 120_000);

  it('English: the same status; the one interpolated value is a number', async () => {
    const r = await play(REPORTED, 'en');
    expect(r.notes).toEqual([]);
    expect(r.statusText).toBe('Degrees of freedom: 0 · 2 configurations are possible — press «Show another configuration»');
    expect(studentFacingViolations(Object.values(figureStatusParams(r.status!) ?? {}).map(String), { typed: REPORTED.join(' '), names: ['A', 'B', 'C'] })).toEqual([]);
  }, 120_000);

  it('«הציגו תצורה אחרת» reaches the other shape — the 3-4-5 (AC = 5)', () => {
    const found = findValidConfig(factsOf(REPORTED), 0)!;
    const next = searchAnotherView(found.facts, found.seed)!;
    expect(next).not.toBeNull();
    const fig = replay(next.facts, next.seed);
    expect(d(fig.positions.get('A')!, fig.positions.get('C')!)).toBeCloseTo(5, 4);
  }, 120_000);

  it('the seat notice is gone from both locales', () => {
    expect(i18n.exists('figure.seatMoved', { lng: 'he' })).toBe(false);
    expect(i18n.exists('figure.seatMoved', { lng: 'en' })).toBe(false);
  });
});

describe('#1444 — one representative per measured cause (ADR-556 sweep table)', () => {
  it('a circle–circle crossing choice (G on C’s side of AB or the other): «יש 2 תצורות אפשריות»', async () => {
    const r = await play(CIRCLE_CROSSING);
    expect(r.notes).toEqual([]);
    expect(r.status).toEqual({ key: 'actions.dofConfigs', n: 2 });
    expect(r.statusText).toBe(TWO_HE);
  }, 120_000);

  it('a ± root (isosceles legs 5, area 12: base 6 or base 8) — the pool is not provably complete: «יש יותר מתצורה אחת»', async () => {
    const r = await play(AREA_ROOT);
    expect(r.status).toEqual({ key: 'actions.dofConfigsMany' });
    expect(r.statusText).toBe(MANY_HE);
    // both bases are really there — the hedge is not over-cautious
    const bases = new Set(sharedSamples(r.facts).samples.map((p) => d(p.get('B')!, p.get('C')!) / d(p.get('A')!, p.get('B')!)).map((x) => (x * 5).toFixed(3)));
    expect([...bases].sort()).toEqual(['6.000', '8.000']);
  }, 120_000);
});

describe('#1444 — guards: no configuration note where there is one shape, or where DOF > 0', () => {
  it('a plain 3-4-5 right triangle (all three sides, the default seat holds): «✓ הציור נקבע במלואו»', async () => {
    const r = await play(['משולש ישר זווית ABC', 'AB=5, BC=4, AC=3']);
    expect(r.notes).toEqual([]);
    expect(r.statusText).toBe(UNIQUE_HE);
  }, 120_000);

  it('a plain triangle 3-4-5 (SSS — its mirror is the same drawing): «✓ הציור נקבע במלואו»', async () => {
    const r = await play(['משולש ABC', 'AB=3, BC=4, AC=5']);
    expect(r.notes).toEqual([]);
    expect(r.statusText).toBe(UNIQUE_HE);
  }, 120_000);

  it('two circles alone: their two crossings are mirror images — one shape, «✓ הציור נקבע במלואו»', async () => {
    const r = await play(CIRCLE_MIRROR);
    expect(r.statusText).toBe(UNIQUE_HE);
  }, 120_000);

  it('a STATED right angle is never moved: the lengths are refused', async () => {
    const r = await play(['משולש ישר זווית ABC', 'זווית C = 90', 'AB=3, BC=4']);
    expect(r.notes.map(strip)).toEqual(['לא ייתכן: מול הזווית הישרה ב-C נמצא היתר AB, הצלע הארוכה ביותר במשולש — אבל |AB| = 3 בעוד |BC| = 4. בדקו את הנתונים.']);
    expect(r.facts.some((f) => f.cmd.type === 'set-distance'), 'the refused line never became a fact').toBe(false);
  }, 120_000);

  it('a figure with free DOF reads the count alone', async () => {
    const r = await play(['משולש ABC']);
    expect(r.status).toEqual({ key: 'actions.dof', count: 2 });
    expect(r.statusText).toBe('דרגות חופש: 2');
  }, 120_000);
});

describe('#1444 — the pieces', () => {
  it('figureDeterminacy counts DISTINCT shapes (scale and mirror are not a new one) and says whether every seed agrees', () => {
    const found = findValidConfig(factsOf(REPORTED), 0)!;
    expect(figureDeterminacy(sharedSamples(found.facts))).toEqual({ determined: true, configurations: 2, stable: true, complete: true });
    // a square's determined pool varies in SCALE across seeds — still one configuration
    expect(figureDeterminacy(sharedSamples(factsOf(['ריבוע ABCD'])))).toEqual({ determined: true, configurations: 1, stable: true, complete: true });
  }, 120_000);

  it('figureDeterminacy on a hand-built pool (no seed tags): one group; an empty pool claims nothing', () => {
    const tri = (cx: number) => new Map([['A', { x: 0, y: 0 }], ['B', { x: 4, y: 0 }], ['C', { x: cx, y: 3 }]]);
    // untagged (hand-built) samples form one group — stable by construction
    expect(figureDeterminacy({ samples: [tri(1), tri(2)], determined: true })).toEqual({ determined: true, configurations: 2, stable: true, complete: true });
    expect(figureDeterminacy({ samples: [], determined: false })).toEqual({ determined: false, configurations: 0, stable: false, complete: true });
  });

  it('figureStatus: the verdict decides; the note is added to the count; pending says «בודק…» (ADR-558)', () => {
    expect(figureStatus(0, 0, null)).toBeNull();
    expect(figureStatus(2, 3, null)).toEqual({ key: 'actions.dof', count: 3 });
    expect(figureStatus(2, 0, null), 'the sweep has not answered yet — claims nothing, says it is coming (#1599 ruling)').toEqual({ key: 'actions.checking' });
    expect(figureStatus(2, 0, { determined: true, configurations: 1, stable: true })).toEqual({ key: 'actions.determined' });
    expect(figureStatus(2, 0, { determined: true, configurations: 3, stable: true })).toEqual({ key: 'actions.dofConfigs', n: 3 });
    expect(figureStatus(2, 0, { determined: true, configurations: 2, stable: false }), 'no number that could be wrong').toEqual({ key: 'actions.dofConfigsMany' });
    expect(figureStatus(2, 0, { determined: false, configurations: 2, stable: true }), 'an incomplete pool proves "more than one", never N').toEqual({ key: 'actions.dofConfigsMany' });
    expect(figureStatus(2, 0, { determined: false, configurations: 1, stable: true }), 'an incomplete pool is no proof of uniqueness').toEqual({ key: 'actions.dof', count: 0 });
    // #1599/#1601 (ADR-558): a pool cut by the work cap SAYS so; a second shape it did find still counts
    expect(figureStatus(2, 0, { determined: false, configurations: 1, stable: true, complete: false })).toEqual({ key: 'actions.dofTooComplex' });
    expect(figureStatus(2, 0, { determined: false, configurations: 2, stable: true, complete: false })).toEqual({ key: 'actions.dofConfigsMany' });
    expect(figureStatus(2, 4, { determined: false, configurations: 1, stable: true, complete: false }), 'DOF > 0: the count stands').toEqual({ key: 'actions.dof', count: 4 });
    expect(figureStatusParams({ key: 'actions.dofConfigs', n: 2 })).toEqual({ n: 2 });
    expect(figureStatusParams({ key: 'actions.dof', count: 0 })).toEqual({ count: 0 });
    expect(figureStatusParams({ key: 'actions.determined' })).toBeUndefined();
  });

  it('the Hebrew and English texts', () => {
    const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' });
    expect(strip(he('actions.dofConfigs', { n: 3 }))).toBe('דרגות חופש: 0 · יש 3 תצורות אפשריות — לחצו «הציגו תצורה אחרת»');
    expect(strip(he('actions.dofConfigsMany'))).toBe(MANY_HE);
    expect(strip(i18n.t('actions.dofConfigsMany', { lng: 'en' }))).toBe('Degrees of freedom: 0 · more than one configuration is possible — press «Show another configuration»');
    // #1599/#1601 (ADR-558)
    expect(strip(he('actions.checking'))).toBe('בודק…');
    expect(strip(he('actions.dofTooComplex'))).toBe('דרגות חופש: 0 · האיור מורכב מדי כדי לבדוק אם יש לו תצורה נוספת');
    expect(strip(he('values.incomplete'))).toBe('האיור מורכב מדי לבדיקה מלאה — ייתכן שחסרים כאן ערכים');
    expect(strip(i18n.t('actions.dofTooComplex', { lng: 'en' }))).toBe('Degrees of freedom: 0 · the figure is too complex to check whether it has another configuration');
  });
});

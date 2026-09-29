/**
 * #1444 ([ADR-556](../../../docs/06-decisions.md#adr-556)) — A MOVED RIGHT ANGLE IS ANNOUNCED, AND THE STATUS
 * SAYS WHAT THE POOL SAYS.
 *
 * External review relayed 2026-09-27: «משולש ישר זווית ABC» + «AB=3, BC=4» silently moved the right angle
 * to A (AC = √7) and the status read «✓ הציור נקבע במלואו», while the values panel withheld AC because
 * seat B (the textbook 3-4-5, AC = 5) is admissible too. Operator ruling 2026-09-27 ("Announce + honest
 * status"): the move is announced through the note channel naming the vertex, and the determined status
 * reads the shared pool's verdict — «נקבע עד כדי בחירת תצורה» when more than one configuration remains.
 *
 * Driven through the REAL door: `runSubmit` (the gate that admits the seat-curable line) → the commit →
 * `runViewResolve` with the real config search → `applyView` → the notice; the status through the store's
 * always-on detect sweep (`detectCrossings`, inline in tests) and the App's own `figureStatus`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { figureStatus } from '../figureStatus';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { figureDeterminacy, findValidConfig, meetsRequirements, searchAnotherView, seatRelocations, sharedSamples } from '@/replay/core';
import { freeDofCount } from '@/engine';
import { studentFacingViolations } from '../../../shell/studentText';
import { factsOf } from '../../__tests__/scenarios-harness';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

const REPORTED = ['משולש ישר זווית ABC', 'AB=3, BC=4'];
const strip = (s: string) => s.replace(/[⁦-⁩]/g, ''); // bidi isolates around labels
const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);

/** Play `lines` through the submit door with the App's resolve wiring; collect every note the student sees. */
async function play(lines: string[], locale: 'he' | 'en' = 'he') {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: locale }) as string;
  const notes: string[] = [];
  const order: string[] = [];
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
          applyView: (found) => {
            order.push('apply');
            useGeoStore.getState().applyView({ facts: found.facts, seed: found.seed });
          },
          setPending: () => {},
          onExhausted: () => notes.push(t('figure.noValidConfig')),
          // the App's own binding (App.tsx)
          onSeatMoved: (vertices) => {
            order.push('seat');
            notes.push(t('figure.seatMoved', { vertex: vertices.join(', ') }));
          },
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
  await st.detectCrossings();
  const after = useGeoStore.getState();
  const fig = replay(after.facts, after.seed);
  const verdict = after.determinacy?.facts === after.facts ? after.determinacy : null;
  const status = figureStatus(after.facts.length, freeDofCount(fig.construction), verdict);
  return { notes, order, facts: after.facts, seed: after.seed, fig, status, statusText: status ? t(status.key, status.count === undefined ? undefined : { count: status.count }) : null };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#1444 — the reported sequence, through the real door', () => {
  it('announces the right angle moved to A, and the status is NOT «נקבע במלואו»', async () => {
    const r = await play(REPORTED);
    const [A, B, C] = ['A', 'B', 'C'].map((id) => r.fig.positions.get(id)!);
    expect(d(A, B)).toBeCloseTo(3, 4);
    expect(d(B, C)).toBeCloseTo(4, 4);
    expect(d(A, C), 'the seat moved to A: AC = √7').toBeCloseTo(Math.sqrt(7), 4);
    expect(r.notes.map(strip), 'the vertex arrives bidi-isolated (the i18n label pass)').toEqual(['הזווית הישרה הוצבה ב-A כדי שהנתונים יתקיימו. לחצו «הציגו תצורה אחרת» לאפשרות נוספת.']);
    expect(r.order, 'the note is set AFTER the view lands — the fact change clears notes (#1338)').toEqual(['apply', 'seat']);
    expect(r.status).toEqual({ key: 'actions.determinedUpToConfig' });
    expect(r.statusText).toBe('נקבע עד כדי בחירת תצורה');
  }, 120_000);

  it('English: the same notice and status, every value one the student can see', async () => {
    const r = await play(REPORTED, 'en');
    expect(r.notes).toEqual(['The right angle was placed at A so the givens can hold. Press «Show another configuration» for another option.']);
    expect(r.statusText).toBe('Determined up to the choice of configuration');
    // the interpolated VALUE is a vertex the student typed and the figure draws
    expect(studentFacingViolations(['A'], { typed: REPORTED.join(' '), names: ['A', 'B', 'C'] })).toEqual([]);
  }, 120_000);

  it('«הציגו תצורה אחרת» reaches seat B — the 3-4-5 (AC = 5)', () => {
    const found = findValidConfig(factsOf(REPORTED), 0)!;
    const next = searchAnotherView(found.facts, found.seed)!;
    expect(next).not.toBeNull();
    expect(seatRelocations(found.facts, next.facts)).toEqual(['B']);
    const fig = replay(next.facts, next.seed);
    expect(d(fig.positions.get('A')!, fig.positions.get('C')!)).toBeCloseTo(5, 4);
  }, 120_000);
});

describe('#1444 — guards: neither the notice nor the hedge where they do not belong', () => {
  it('a plain 3-4-5 (all three sides, the default seat holds): no notice, «✓ הציור נקבע במלואו»', async () => {
    const r = await play(['משולש ישר זווית ABC', 'AB=5, BC=4, AC=3']);
    expect(r.notes).toEqual([]);
    expect(r.order).toEqual([]);
    expect(r.statusText).toBe('✓ הציור נקבע במלואו על ידי הנתונים');
  }, 120_000);

  it('a plain triangle 3-4-5 (SSS — its mirror is the same drawing): «✓ הציור נקבע במלואו»', async () => {
    const r = await play(['משולש ABC', 'AB=3, BC=4, AC=5']);
    expect(r.notes).toEqual([]);
    expect(r.statusText).toBe('✓ הציור נקבע במלואו על ידי הנתונים');
  }, 120_000);

  it('a STATED right angle is never moved: the lengths are refused, no seat notice', async () => {
    const r = await play(['משולש ישר זווית ABC', 'זווית C = 90', 'AB=3, BC=4']);
    expect(r.order, 'nothing was rewritten').toEqual([]);
    expect(r.notes.map(strip)).toEqual(['לא ייתכן: מול הזווית הישרה ב-C נמצא היתר AB, הצלע הארוכה ביותר במשולש — אבל |AB| = 3 בעוד |BC| = 4. בדקו את הנתונים.']);
    expect(r.facts.some((f) => f.cmd.type === 'set-distance'), 'the refused line never became a fact').toBe(false);
  }, 120_000);

  it('a figure with free DOF still reads the count', async () => {
    const r = await play(['משולש ABC']);
    expect(r.status?.key).toBe('actions.dof');
  }, 120_000);
});

describe('#1444 — the pieces', () => {
  it('seatRelocations: identity moves nothing; a rot rewrite names the vertex the knee is drawn at', () => {
    const facts = factsOf(REPORTED);
    expect(seatRelocations(facts, facts)).toEqual([]);
    const rewrite = (rot: 0 | 1 | 2): Fact[] =>
      facts.map((f) => (f.cmd.type === 'right-triangle' ? ({ ...f, cmd: rot ? { ...f.cmd, rot } : { type: f.cmd.type, ids: f.cmd.ids } } as Fact) : f));
    expect(seatRelocations(facts, rewrite(1))).toEqual(['A']);
    expect(seatRelocations(facts, rewrite(2))).toEqual(['B']);
    expect(seatRelocations(rewrite(1), rewrite(0))).toEqual(['C']);
  });

  it('figureDeterminacy counts DISTINCT shapes in the pool (scale and mirror are not a new configuration)', () => {
    const found = findValidConfig(factsOf(REPORTED), 0)!;
    expect(figureDeterminacy(sharedSamples(found.facts))).toEqual({ determined: true, configurations: 2 });
    // a square's determined pool varies in SCALE across seeds — still one configuration
    expect(figureDeterminacy(sharedSamples(factsOf(['ריבוע ABCD'])))).toEqual({ determined: true, configurations: 1 });
  }, 120_000);

  it('figureStatus: the verdict decides; pending claims nothing', () => {
    expect(figureStatus(0, 0, null)).toBeNull();
    expect(figureStatus(2, 3, null)).toEqual({ key: 'actions.dof', count: 3 });
    expect(figureStatus(2, 0, null), 'the sweep has not answered yet').toBeNull();
    expect(figureStatus(2, 0, { determined: true, configurations: 1 })).toEqual({ key: 'actions.determined' });
    expect(figureStatus(2, 0, { determined: true, configurations: 2 })).toEqual({ key: 'actions.determinedUpToConfig' });
    expect(figureStatus(2, 0, { determined: false, configurations: 1 }), 'an incomplete admissible set is no proof').toEqual({ key: 'actions.determinedUpToConfig' });
  });
});

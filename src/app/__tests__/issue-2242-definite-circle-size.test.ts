/**
 * #2242 ([ADR-690](../../../docs/06-decisions.md#adr-690)) — A SIZE STATED ABOUT «המעגל» / "THE CIRCLE" IS A REFERENCE:
 * it sizes the circle the figure already has, and beside several circles it asks which. It never mints another circle.
 *
 * Measured at 4b0b4592 through `decideDeterministic2D` + the store, model mocked (0 calls):
 *   «מעגל O» · «שטח המעגל הוא 9π» (and «היקף המעגל הוא 10π», «המעגל ששטחו 9π», English, a point on O, the
 *   circumcircle, the unnamed circle)          → a NEW circle P of radius 3 beside O, green; O untouched
 *   «מעגל O» · «מעגל P» · the same lines, «המעגל ברדיוס 3»   → a THIRD circle Q, green
 *   «מעגל O» · «המעגל ברדיוס R»                → a new circle P carrying R (its twin «רדיוס המעגל R» binds R to O)
 *
 * Root cause: the `circle` definition rule asked ADR-548's reference question only for a through clause, and
 * `circleSizeExisting` resolved only a named circle, so a definite «המעגל» with a size fell through to a definition.
 * Fix: the one predicate (`definiteCircleReference`) is asked by both size paths; the ask is the existing
 * `input.ambiguousCircleRef`, the sentence the radius twin «רדיוס המעגל הוא 3» already gave with two circles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { renderNote } from '../renderNote';
import { circleRefs } from '@/engine';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

type Out = { kind: string; commands: readonly unknown[] | null; said: string | null };
async function submit(lines: string[], t: Translate = he): Promise<Out[]> {
  useGeoStore.getState().clear();
  const out: Out[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, t === en ? 'en' : 'he');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const note = v.kind === 'refuse' ? (v.note as { explain?: string; key?: string; params?: Record<string, unknown> } | undefined) : undefined;
    const said = note?.explain
      ? stripFormatControls(humanizeError(note.explain, t, line, otherUtteranceForError(st.facts, note.explain)))
      : note?.key
        ? stripFormatControls(renderNote(note as never, { t: t as never, explain: (raw) => raw, circles: circleRefs(f.construction) })) // #2464: as the app renders it
        : null;
    out.push({ kind: v.kind, commands: v.kind === 'commit' ? v.commands : null, said });
  }
  return out;
}
/** Every circle's radius at seeds 0–3, and every position at seeds 0–3 — what the student sees and re-samples. */
const figureAt = () => {
  const st = useGeoStore.getState();
  return [0, 1, 2, 3].map((seed) => replay(st.facts, seed));
};
const allGreen = () => {
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  expect(fig.lastError).toBeNull();
  for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
};
const ASK_HE = 'יש כמה מעגלים בסרטוט (O, P), ולא ברור לאיזה מהם הכוונה. ציינו את המעגל בשמו — למשל «מעגל O».';

describe('#2242 — one circle drawn: a size about «המעגל» sizes it, exactly as the named line does', () => {
  // [prefix, the definite line, its named twin, the stated radius, locale]
  const ROWS: [string[], string, string, number, Translate][] = [
    [['מעגל O'], 'שטח המעגל הוא 9π', 'שטח המעגל O הוא 9π', 3, he], // the report
    [['מעגל O'], 'היקף המעגל הוא 10π', 'היקף המעגל O הוא 10π', 5, he],
    [['מעגל O'], 'המעגל ששטחו 9π', 'שטח המעגל O הוא 9π', 3, he],
    [['מעגל O'], 'המעגל שהיקפו 10π', 'היקף המעגל O הוא 10π', 5, he],
    [['מעגל O'], 'שטח העיגול הוא 9π', 'שטח המעגל O הוא 9π', 3, he],
    [['מעגל O'], 'שטחו של המעגל הוא 9π', 'שטח המעגל O הוא 9π', 3, he],
    [['מעגל O'], 'המעגל ברדיוס 3', 'המעגל O ברדיוס 3', 3, he],
    [['circle O'], 'the area of the circle is 9π', 'the area of circle O is 9π', 3, en],
    [['circle O'], 'the circumference of the circle is 10π', 'the circumference of circle O is 10π', 5, en],
    // not in the plan's list (it measured this one escalating): its named twin «circle O has area 9π» builds, so it follows
    [['circle O'], 'the circle has area 9π', 'circle O has area 9π', 3, en],
    [['מעגל O', 'A על מעגל O'], 'שטח המעגל הוא 9π', 'שטח המעגל O הוא 9π', 3, he],
    [['מעגל O', 'A על המעגל'], 'המעגל ששטחו 9π', 'שטח המעגל O הוא 9π', 3, he],
    [['מעגל'], 'שטח המעגל הוא 9π', 'שטח המעגל O הוא 9π', 3, he],
  ];
  it.each(ROWS)('%j · «%s» = «%s»', async (prefix, line, twin, r, t) => {
    const out = await submit([...prefix, line], t);
    const last = out[out.length - 1];
    expect(last.kind, line).toBe('commit');
    const figs = figureAt();
    for (const fig of figs) {
      expect(fig.circles.size, 'no second circle').toBe(1);
      expect(fig.circles.get('circle-O')!.r).toBeCloseTo(r, 9);
    }
    allGreen();
    // One definite line = its named line: the same commands, the same figure at every seed.
    const named = await submit([...prefix, twin], t);
    expect(named[named.length - 1].kind).toBe('commit');
    expect(last.commands).toEqual(named[named.length - 1].commands);
    const namedFigs = figureAt();
    for (let k = 0; k < figs.length; k++) {
      for (const [id, p] of namedFigs[k].positions) {
        const q = figs[k].positions.get(id)!;
        expect(Math.abs(q.x - p.x) + Math.abs(q.y - p.y), `${id} @ seed ${k}`).toBeLessThan(1e-9);
      }
    }
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('stability: with A on O, A stays on O and O keeps its centre when only its radius is set', async () => {
    await submit(['מעגל O', 'A על מעגל O']);
    const before = replay(useGeoStore.getState().facts, 0);
    await submit(['מעגל O', 'A על מעגל O', 'שטח המעגל הוא 9π']);
    const after = replay(useGeoStore.getState().facts, 0);
    expect(after.positions.get('O')).toEqual(before.positions.get('O'));
    const O = after.positions.get('O')!;
    const A = after.positions.get('A')!;
    expect(Math.hypot(A.x - O.x, A.y - O.y)).toBeCloseTo(3, 9);
  });

  it('the circumscribed circle of a triangle is the one sized, as its named twin sizes it', async () => {
    const out = await submit(['משולש ABC', 'מעגל O חוסם את המשולש ABC', 'שטח המעגל הוא 9π']);
    const named = await submit(['משולש ABC', 'מעגל O חוסם את המשולש ABC', 'שטח המעגל O הוא 9π']);
    expect(out[2].kind).toBe('commit');
    expect(out[2].commands).toEqual(named[2].commands);
    expect(replay(useGeoStore.getState().facts, 0).circles.size).toBe(1);
  });

  it('a radius LETTER on «המעגל» names the drawn circle\'s radius, as «רדיוס המעגל R» does', async () => {
    const out = await submit(['מעגל O', 'המעגל ברדיוס R']);
    const twin = await submit(['מעגל O', 'רדיוס המעגל R']);
    expect(out[1].commands).toEqual([{ type: 'radius-symbol', circle: 'circle-O', name: 'R' }]);
    expect(out[1].commands).toEqual(twin[1].commands);
  });

  it('a saved list holding the report\'s two lines loads as one circle of radius 3', () => {
    const facts = factsOf(['מעגל O', 'שטח המעגל הוא 9π']);
    const fig = replay(facts, 0);
    expect(fig.circles.size).toBe(1);
    expect(fig.circles.get('circle-O')!.r).toBeCloseTo(3, 9);
    for (const f of facts) expect(fig.status[f.id]).toBe('ok');
  });
});

describe('#2242 — two circles drawn: a size about «המעגל» asks which, and nothing is added', () => {
  it.each([
    [['מעגל O', 'מעגל P'], 'שטח המעגל הוא 9π'],
    [['מעגל O', 'מעגל P'], 'היקף המעגל הוא 10π'],
    [['מעגל O', 'מעגל P'], 'המעגל ברדיוס 3'],
    [['מעגל O', 'מעגל P'], 'המעגל ששטחו 9π'],
    [['מעגל O', 'מעגל P'], 'המעגל ברדיוס R'],
    [['מעגל O', 'מעגל P', 'מעגל P מוכל במעגל O'], 'שטח המעגל הוא 4π'],
  ] as [string[], string][])('%j · «%s» → the circle question', async (prefix, line) => {
    const out = await submit([...prefix, line]);
    expect(out[out.length - 1]).toMatchObject({ kind: 'refuse', said: ASK_HE });
    expect(replay(useGeoStore.getState().facts, 0).circles.size).toBe(2);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('English asks the same question', async () => {
    const out = await submit(['circle O', 'circle P', 'the area of the circle is 9π'], en);
    expect(out[2].kind).toBe('refuse');
    expect(out[2].said).toBe(stripFormatControls(en('input.ambiguousCircleRef', { circles: 'O, P', first: 'circle O' })));
  });

  it('the taught remedy builds: the named «שטח המעגל O הוא 9π» sizes O', async () => {
    const out = await submit(['מעגל O', 'מעגל P', 'שטח המעגל O הוא 9π']);
    expect(out[2].kind).toBe('commit');
    expect(replay(useGeoStore.getState().facts, 0).circles.get('circle-O')!.r).toBeCloseTo(3, 9);
  });
});

describe('#2242 — the controls and the neighbours', () => {
  it('a stated radius then a different area is #2119\'s contradiction, naming the first', async () => {
    const out = await submit(['מעגל O ברדיוס 2', 'שטח המעגל הוא 9π']);
    expect(out[1].said).toBe('לא ניתן: «שטח המעגל הוא 9π» סותר את «מעגל O ברדיוס 2» — אי אפשר לקיים את שניהם יחד.');
    expect(replay(useGeoStore.getState().facts, 0).circles.get('circle-O')!.r).toBeCloseTo(2, 9);
  });

  it('with no circle drawn the line introduces one (FR-IN-12)', async () => {
    const out = await submit(['שטח המעגל הוא 9π']);
    expect(out[0].kind).toBe('commit');
    expect(replay(useGeoStore.getState().facts, 0).circles.get('circle-O')!.r).toBeCloseTo(3, 9);
  });

  it.each(['שטח מעגל הוא 9π', 'מעגל ששטחו 9π'])('the indefinite «%s» still draws a new circle (ADR-654)', async (line) => {
    await submit(['מעגל O', line]);
    expect(replay(useGeoStore.getState().facts, 0).circles.size).toBe(2);
  });

  it('the directional «שטח המעגל הגדול הוא 9π» still sizes the outer circle', async () => {
    const out = await submit(['מעגל O', 'מעגל P', 'מעגל P מוכל במעגל O', 'שטח המעגל הגדול הוא 9π']);
    expect(out[3].commands).toContainEqual({ type: 'set-radius', circle: 'circle-O', value: 3, consumed: { numbers: [9], symbols: ['π'] } });
  });

  it('the radius twins are unchanged', async () => {
    expect((await submit(['מעגל O', 'רדיוס המעגל הוא 3']))[1].commands).toEqual([{ type: 'set-radius', circle: 'circle-O', value: 3 }]);
    expect((await submit(['מעגל O', 'מעגל P', 'רדיוס המעגל הוא 3']))[2]).toMatchObject({ kind: 'refuse', said: ASK_HE });
  });

  it.each(['שטח המעגל הוא S', 'קוטר המעגל הוא 6'])('«%s» on one circle still goes to the AI', async (line) => {
    const out = await submit(['מעגל O', line]);
    expect(out[1].kind).toBe('escalate');
  });

  it('"the circle with radius 3" is still refused as two statements', async () => {
    const out = await submit(['circle O', 'the circle with radius 3'], en);
    expect(out[1].kind).toBe('refuse');
    expect(replay(useGeoStore.getState().facts, 0).circles.size).toBe(1);
  });

  it('the through statement about «המעגל» is unchanged (ADR-548)', async () => {
    const out = await submit(['מעגל O', 'נקודה A', 'המעגל עובר דרך A']);
    expect(out[2].commands).toEqual([{ type: 'point-on-circle', id: 'A', circle: 'circle-O' }]);
  });
});

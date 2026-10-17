/**
 * #2239 ([ADR-692](../../../docs/06-decisions.md#adr-692)) — A STATED RADIUS IS NEVER CHANGED BY THE ENGINE. Two circles
 * of equal stated radius stated internally tangent are refused, in either order, naming the conflicting statement;
 * and every stated radius the figure draws equals its statement.
 *
 * Measured on 4b0b4592 through `decideDeterministic2D` + the store, model mocked (0 calls), seeds 0–3:
 *   «מעגל O ברדיוס 3» · «מעגל P ברדיוס 3» · «המעגלים O ו-P משיקים מבפנים»   → commit GREEN, P drawn 1.50 / 0.95 / 1.50 / 1.70
 *   the English twin                                                       → commit GREEN, O drawn 1.50 / 2.03 / 1.48 / 1.30
 *   «רדיוס מעגל … הוא 3», a radius letter, an area, a third circle         → the same
 *   «מעגל O» · «מעגל P» · «…משיקים מבפנים» · «רדיוס מעגל O הוא 3» · «רדיוס מעגל P הוא 3» → two COINCIDENT circles, green
 *
 * Operator rulings 2026-10-16: #2239 «a stated radius is never changed by a later constraint. Either the figure holds
 * it, or the line is refused, naming the conflicting statement» and «the verifier checks stated radii»; #2206 line 2
 * «Equal radii with internal tangency or concentric: refused». The sentence is #2119's (ADR-682/683), reused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function submit(lines: string[], t: Translate = he) {
  useGeoStore.getState().clear();
  const out: { kind: string; said: string | null }[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
    }
    const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
    out.push({ kind: v.kind, said: raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null });
  }
  return out;
}
const contradicts = (line: string, other: string) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד.`;
/** every committed fact holds its stated radius at seeds 0–3, and the committed figure is green */
const statedRadiiHeld = (radii: Record<string, number>) => {
  const st = useGeoStore.getState();
  for (const seed of [0, 1, 2, 3]) {
    const fig = replay(st.facts, seed);
    expect(fig.lastError, `seed ${seed}`).toBeNull();
    for (const f of st.facts) expect(fig.status[f.id], `${f.utterance} @${seed}`).toBe('ok');
    for (const [id, r] of Object.entries(radii)) expect(fig.circles.get(id)?.r, `${id} @${seed}`).toBeCloseTo(r, 6);
    expect(fig.violations, `seed ${seed}`).toEqual([]);
  }
};
const T = 'המעגלים O ו-P משיקים מבפנים';

describe('#2239 — equal stated radii, internal tangency last: the tangency is refused naming the latest radius line', () => {
  it.each([
    // [lines before, the refused line, the line it names]
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3'], T, 'מעגל P ברדיוס 3'], // the filing, verbatim
    [['מעגל O', 'מעגל P', 'רדיוס מעגל O הוא 3', 'רדיוס מעגל P הוא 3'], T, 'רדיוס מעגל P הוא 3'],
    [['מעגל O ברדיוס r', 'מעגל P ברדיוס r', 'r = 3'], T, 'מעגל P ברדיוס r'], // a valued radius letter
    [['מעגל O ברדיוס 3', 'שטח מעגל P הוא 9π'], T, 'שטח מעגל P הוא 9π'], // the size stated as an area
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'מעגל Q ברדיוס 1'], T, 'מעגל P ברדיוס 3'], // a third circle
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3'], 'מעגל P משיק למעגל O מבפנים', 'מעגל P ברדיוס 3'], // #2208's spelling
  ] as [string[], string, string][])('%j · %s', async (before, line, other) => {
    const out = await submit([...before, line]);
    expect(out.slice(0, -1).map((o) => o.kind)).toEqual(before.map(() => 'commit'));
    expect(out[out.length - 1]).toEqual({ kind: 'refuse', said: contradicts(line, other) });
    statedRadiiHeld({ 'circle-O': 3, 'circle-P': 3 });
  });

  it('the English twin, in English', async () => {
    const lines = ['circle O with radius 3', 'circle P with radius 3', 'circle P is internally tangent to circle O'];
    const out = await submit(lines, en);
    expect(out[2]).toEqual({ kind: 'refuse', said: "Can't do that: «circle P is internally tangent to circle O» contradicts «circle P with radius 3» — they can't both hold." });
    statedRadiiHeld({ 'circle-O': 3, 'circle-P': 3 });
  });
});

describe('#2239 — the other order: a radius line that makes an internally tangent pair equal is refused naming the tangency', () => {
  it.each([
    [['מעגל O', 'מעגל P', T, 'רדיוס מעגל O הוא 3'], 'רדיוס מעגל P הוא 3'],
    [['מעגל O', 'מעגל P', T, 'מעגל O ברדיוס 3'], 'מעגל P ברדיוס 3'],
    [['מעגל O ברדיוס 3', 'מעגל P', T], 'רדיוס מעגל P הוא 3'],
  ] as [string[], string][])('%j · %s', async (before, line) => {
    const out = await submit([...before, line]);
    expect(out.slice(0, -1).map((o) => o.kind)).toEqual(before.map(() => 'commit'));
    expect(out[out.length - 1]).toEqual({ kind: 'refuse', said: contradicts(line, T) });
    statedRadiiHeld({ 'circle-O': 3 });
  });

  it('a later «PA = 3» on the refused pair adds no coincident circles (the filing\'s B2 row)', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', T, 'A על מעגל P', 'PA = 3']);
    expect(out.map((o) => o.kind)).toEqual(['commit', 'commit', 'refuse', 'commit', 'commit']);
    statedRadiiHeld({ 'circle-O': 3, 'circle-P': 3 });
    const fig = replay(useGeoStore.getState().facts, 0);
    const [o, p] = [fig.circles.get('circle-O')!, fig.circles.get('circle-P')!];
    expect(Math.hypot(o.center.x - p.center.x, o.center.y - p.center.y)).toBeGreaterThan(1e-3);
  });
});

describe('#2239 — the radius letter valued AFTER the tangency (ADR-554\'s later-statement verdict)', () => {
  it('«r = 3» commits, the tangency row turns ✗ naming «r = 3», and both radii are 3', async () => {
    const out = await submit(['מעגל O ברדיוס r', 'מעגל P ברדיוס r', T, 'r = 3']);
    expect(out.map((o) => o.kind)).toEqual(['commit', 'commit', 'commit', 'commit']);
    const st = useGeoStore.getState();
    const fig = replay(st.facts, st.seed);
    const row = st.facts.find((f) => f.utterance === T)!;
    const raw = fig.status[row.id] as string;
    expect(stripFormatControls(humanizeError(raw, he, T, otherUtteranceForError(st.facts, raw)))).toBe(contradicts(T, 'r = 3'));
    expect([fig.circles.get('circle-O')!.r, fig.circles.get('circle-P')!.r]).toEqual([3, 3]);
  });
});

describe('#2239 — a saved list holding the filing opens with the tangency row ✗ in the same sentence (one verdict, ADR-661)', () => {
  it('the filing\'s three lines', () => {
    const lines = ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', T];
    const facts: Fact[] = factsOf(lines);
    const fig = replay(facts, 0);
    const last = facts[facts.length - 1];
    const raw = fig.status[last.id] as string;
    expect(stripFormatControls(humanizeError(raw, he, last.utterance, otherUtteranceForError(facts, raw)))).toBe(contradicts(T, 'מעגל P ברדיוס 3'));
    expect([fig.circles.get('circle-O')!.r, fig.circles.get('circle-P')!.r]).toEqual([3, 3]);
  });
});

describe('#2239 — unchanged', () => {
  it('unequal radii internally tangent build, both held, |OP| = 1', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', T]);
    expect(out.map((o) => o.kind)).toEqual(['commit', 'commit', 'commit']);
    statedRadiiHeld({ 'circle-O': 3, 'circle-P': 2 });
    const fig = replay(useGeoStore.getState().facts, 0);
    const [o, p] = [fig.circles.get('circle-O')!, fig.circles.get('circle-P')!];
    expect(Math.hypot(o.center.x - p.center.x, o.center.y - p.center.y)).toBeCloseTo(1, 6);
  });

  it('equal radii EXTERNALLY tangent build, both held', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'המעגלים O ו-P משיקים מבחוץ']);
    expect(out.map((o) => o.kind)).toEqual(['commit', 'commit', 'commit']);
    statedRadiiHeld({ 'circle-O': 3, 'circle-P': 3 });
  });

  it('a stated centre distance against a tangency is still refused naming it', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', 'OP = 5', T]);
    expect(out[3].kind).toBe('refuse');
    expect(out[3].said).toMatch(/^לא ניתן: «המעגלים O ו-P משיקים מבפנים» סותר את «OP = 5»/);
  });

  it('radii stated as distances, then internal tangency: still refused (wording unchanged)', async () => {
    const out = await submit(['מעגל O', 'מעגל P', 'A על מעגל O', 'B על מעגל P', 'OA = 3', 'PB = 3', T]);
    expect(out[6].kind).toBe('refuse');
    expect(out[6].said).toMatch(/^לא ניתן: «המעגלים O ו-P משיקים מבפנים» סותר את «PB = 3»/);
  });

  it('the model is never called', async () => {
    await submit(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', T]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

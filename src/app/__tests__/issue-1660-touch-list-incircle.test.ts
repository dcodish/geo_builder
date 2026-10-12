/**
 * #1660 ([ADR-631](../../../docs/06-decisions.md#adr-631)) — THE TOUCH LIST builds the incircle, through the
 * real submit door.
 *
 * Measured on `main` 403efe66: «הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה» was REFUSED with the
 * multi-instruction note, after «משולש ABC» and typed first: the two-sides rule read only «BC ו-CA». Analytic
 * builds it as the incircle (ADR-AG-198 Am. 1); the #1619 ruling (ported to 2-D by ADR-560): a touch sentence
 * with no circle CREATES the circle, its centre unnamed; one circle binds; several ask.
 *
 * The model is mocked (standing rule 2); every assertion is on what the door commits or refuses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { Vec } from '@/engine';
import i18n from '@/i18n';

async function submit(line: string): Promise<{ accepted: boolean; notes: string[] }> {
  const notes: string[] = [];
  let cleared = 0;
  const deps: SubmitDeps = {
    t: (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string,
    locale: 'he',
    ui: { setInputNote: (m) => { if (m) notes.push(m); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => { cleared++; }, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  await runSubmit(line, deps);
  return { accepted: cleared === 1, notes };
}

async function playAll(lines: string[]) {
  for (const l of lines) {
    const r = await submit(l);
    expect(r.accepted, `«${l}» is accepted (notes: ${r.notes.join(' | ')})`).toBe(true);
  }
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed);
}

type Fig = Awaited<ReturnType<typeof playAll>>;
const at = (d: Fig, id: string): Vec => {
  const p = d.positions.get(id);
  expect(p, `${id} is placed`).toBeDefined();
  return p!;
};
const dist = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const cross = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
const dotAt = (o: Vec, t: Vec, a: Vec) => (t.x - o.x) * (a.x - t.x) + (t.y - o.y) * (a.y - t.y);

/** Every side (a, b) touches the circle centred `centre` at its touch point T: T within the side, CT ⟂ the
 *  side, every CT the same length (one circle). */
function expectTouches(d: Fig, centre: string, touches: Array<[string, string, string]>) {
  const c = at(d, centre);
  const radii: number[] = [];
  for (const [a, b, t] of touches) {
    const A = at(d, a), B = at(d, b), T = at(d, t);
    expect(Math.abs(cross(A, B, T)) / dist(A, B), `${t} on ${a}${b}`).toBeLessThan(1e-6);
    expect(dist(A, T) + dist(T, B), `${t} between ${a} and ${b}`).toBeCloseTo(dist(A, B), 6);
    expect(Math.abs(dotAt(c, T, A)) / (dist(c, T) * dist(T, A)), `${centre}${t} ⟂ ${a}${b}`).toBeLessThan(1e-6);
    radii.push(dist(c, T));
  }
  for (const r of radii) expect(r, 'one circle').toBeCloseTo(radii[0], 6);
}

const TOUCH = 'הצלעות AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה';
const DEF: Array<[string, string, string]> = [['A', 'B', 'D'], ['B', 'C', 'E'], ['C', 'A', 'F']];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe("#1660 — a touch list over every side of a ring is that ring's incircle", () => {
  it('after «משולש ABC» it builds the incircle tangent at D, E, F — the centre hidden, no model call', async () => {
    const d = await playAll(['משולש ABC', TOUCH]);
    expect(d.violations).toEqual([]);
    expectTouches(d, '@ctr-O', DEF);
    expect(d.positions.has('O'), 'no tool-chosen centre letter').toBe(false);
    expect(d.construction.objects.filter((x) => x.kind === 'circle')).toHaveLength(1);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('it is the SAME circle «מעגל חסום במשולש ABC» draws (centre and radius)', async () => {
    const touch = await playAll(['משולש ABC', TOUCH]);
    useGeoStore.getState().clear();
    const inc = await playAll(['משולש ABC', 'מעגל חסום במשולש ABC']);
    const c1 = at(touch, '@ctr-O'), c2 = at(inc, '@ctr-O');
    expect(dist(c1, c2)).toBeLessThan(1e-9);
    expect(dist(c1, at(touch, 'D'))).toBeCloseTo(dist(c2, at(inc, '@f-AB')), 9);
  });

  it('typed FIRST, the sentence mints the triangle and builds the same figure', async () => {
    const d = await playAll([TOUCH]);
    expect(d.violations).toEqual([]);
    expectTouches(d, '@ctr-O', DEF);
  });

  it('«O מרכז המעגל» afterwards names the hidden centre', async () => {
    const d = await playAll(['משולש ABC', TOUCH, 'O מרכז המעגל']);
    expectTouches(d, 'O', DEF);
  });

  it('a centre named in the sentence («למעגל O») is the visible centre', async () => {
    const d = await playAll(['משולש ABC', 'הצלעות AB, BC ו-CA משיקות למעגל O בנקודות D, E ו-F בהתאמה']);
    expectTouches(d, 'O', DEF);
  });

  it.each([
    ['the bare pairs', 'AB, BC ו-CA משיקות למעגל בנקודות D, E ו-F בהתאמה'],
    ['English', 'the sides AB, BC and CA are tangent to the circle at D, E and F respectively'],
    ['another side order', 'הצלעות BC, CA ו-AB משיקות למעגל בנקודות E, F ו-D בהתאמה'],
  ])('%s — the same incircle at the same points', async (_l, line) => {
    const d = await playAll(['משולש ABC', line]);
    expectTouches(d, '@ctr-O', DEF);
  });

  it("with no touch points named, the incircle's touch points are anonymous dots (as «מעגל חסום במשולש» draws them)", async () => {
    const d = await playAll(['משולש ABC', 'הצלעות AB, BC ו-CA משיקות למעגל']);
    expectTouches(d, '@ctr-O', [['A', 'B', '@f-AB'], ['B', 'C', '@f-BC'], ['C', 'A', '@f-CA']]);
  });

  it("a square's four sides → its incircle at P, Q, R, S", async () => {
    const d = await playAll(['ריבוע ABCD', 'הצלעות AB, BC, CD ו-DA משיקות למעגל בנקודות P, Q, R ו-S בהתאמה']);
    expect(d.violations).toEqual([]);
    expectTouches(d, '@ctr-O', [['A', 'B', 'P'], ['B', 'C', 'Q'], ['C', 'D', 'R'], ['D', 'A', 'S']]);
  });

  it("a pentagon's five sides are refused as «מעגל חסום במחומש» is — nothing committed, no model call", async () => {
    await playAll(['מחומש ABCDE']);
    const before = useGeoStore.getState().facts.length;
    const r = await submit('הצלעות AB, BC, CD, DE ו-EA משיקות למעגל');
    expect(r.accepted).toBe(false);
    expect(r.notes.join(' ')).toContain('מעגל חסום במחומש');
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

describe('#1660 — the other cases ask the shared seam (ADR-560)', () => {
  it('three sides of a quadrilateral, no circle → a circle created tangent to them at P, Q, R', async () => {
    const d = await playAll(['מרובע ABCD', 'הצלעות AB, BC ו-CD משיקות למעגל בנקודות P, Q ו-R בהתאמה']);
    expect(d.violations).toEqual([]);
    expectTouches(d, '@ctr-O', [['A', 'B', 'P'], ['B', 'C', 'Q'], ['C', 'D', 'R']]);
    expect(d.construction.objects.filter((x) => x.kind === 'circle')).toHaveLength(1);
  });

  it('beside two circles the sentence asks which — never a third circle', async () => {
    await playAll(['מעגל O', 'מעגל P', 'משולש ABC']);
    const before = useGeoStore.getState().facts.length;
    const r = await submit(TOUCH);
    expect(r.accepted).toBe(false);
    expect(r.notes.join(' ')).toContain('ולא ברור לאיזה מהם הכוונה');
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it("a two-sides corner stays the corner rule's (unchanged)", async () => {
    const d = await playAll(['משולש ABC', 'הצלעות AB ו-BC משיקות למעגל בנקודות D ו-E בהתאמה']);
    expect(d.construction.objects.some((o) => o.id === 'bis-ABC')).toBe(true);
    expect(dist(at(d, 'B'), at(d, 'D'))).toBeCloseTo(dist(at(d, 'B'), at(d, 'E')), 6);
  });
});

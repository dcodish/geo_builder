/**
 * #1650 ([ADR-560](../../../docs/06-decisions.md#adr-560)) — A TANGENCY ABOUT «המעגל» WITH NO CIRCLE CREATES
 * THE CIRCLE, through the real submit door.
 *
 * Operator, 2026-10-02: *"AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה — this works on analytic but not on
 * 2d."* Measured on `main` through `runSubmit`: typed first, the line was REFUSED («הצעד הזה מסתמך על …
 * שעדיין לא הוגדרו» — `unresolved dependencies for: bis-ABC`); with «מעגל O» first it built. The two-sides
 * tangency rule decided bind-or-create on its own, and with no circle it always took the corner
 * construction, which bisects an angle whose points did not exist and defined the touch point A as a foot
 * from itself. The ruling on #1619 (2026-10-01; analytic ADR-AG-196/198): none → create (centre unnamed
 * until a later sentence names it), one → bind, several → ambiguous.
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

const at = (d: { positions: Map<string, Vec> }, id: string): Vec => {
  const p = d.positions.get(id);
  expect(p, `${id} is placed`).toBeDefined();
  return p!;
};
const dot = (o: Vec, p: Vec, q: Vec) => (p.x - o.x) * (q.x - p.x) + (p.y - o.y) * (q.y - p.y);
const cross = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const TANGENCY = 'AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה';

describe('#1650 — a tangency with no circle creates it; one binds; several ask', () => {
  it('corpus 6/4 as printed builds: A and C are the touch points, O names the centre, K meets the diagonals', async () => {
    const d = await playAll([TANGENCY, 'O מרכז המעגל', 'אלכסוני המרובע ABCO נפגשים בנקודה K']);
    expect(d.violations).toEqual([]);
    const o = at(d, 'O'), a = at(d, 'A'), b = at(d, 'B'), c = at(d, 'C'), k = at(d, 'K');
    expect(Math.abs(dot(o, a, b))).toBeLessThan(1e-6); // OA ⟂ AB
    expect(Math.abs(dot(o, c, b))).toBeLessThan(1e-6); // OC ⟂ CB
    expect(Math.hypot(a.x - o.x, a.y - o.y)).toBeCloseTo(Math.hypot(c.x - o.x, c.y - o.y), 6);
    expect(Math.abs(cross(a, c, k))).toBeLessThan(1e-6);
    expect(Math.abs(cross(b, o, k))).toBeLessThan(1e-6);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('before «O מרכז המעגל» the created circle\'s centre is hidden — no tool-chosen letter is offered', async () => {
    const d = await playAll([TANGENCY]);
    expect(d.positions.has('O')).toBe(false);
    expect(d.positions.has('@ctr-O')).toBe(true);
    expect(d.construction.objects.filter((x) => x.kind === 'circle')).toHaveLength(1);
  });

  it('with «מעגל O» first the same sentence binds to it (unchanged)', async () => {
    const d = await playAll(['מעגל O', TANGENCY, 'אלכסוני המרובע ABCO נפגשים בנקודה K']);
    expect(d.construction.objects.filter((x) => x.kind === 'circle')).toHaveLength(1);
    const o = at(d, 'O'), a = at(d, 'A'), b = at(d, 'B'), c = at(d, 'C');
    expect(Math.abs(dot(o, a, b))).toBeLessThan(1e-6);
    expect(Math.abs(dot(o, c, b))).toBeLessThan(1e-6);
  });

  it('beside two circles the sentence is AMBIGUOUS — refused with the which-circle question, never a third circle', async () => {
    await playAll(['מעגל O', 'מעגל P']);
    const before = useGeoStore.getState().facts.length;
    const r = await submit(TANGENCY);
    expect(r.accepted).toBe(false);
    expect(r.notes.join(' ')).toContain('ולא ברור לאיזה מהם הכוונה'); // the ambiguousCircleRef question
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('a fresh corner with fresh touch points mints the corner and builds the circle tangent at them', async () => {
    const d = await playAll(['AB ו-BC משיקים למעגל בנקודות D ו-E בהתאמה']);
    const b = at(d, 'B'), a = at(d, 'A'), c = at(d, 'C'), dd = at(d, 'D'), e = at(d, 'E');
    expect(Math.abs(cross(b, a, dd))).toBeLessThan(1e-6); // D on line BA
    expect(Math.abs(cross(b, c, e))).toBeLessThan(1e-6); // E on line BC
    expect(Math.hypot(b.x - dd.x, b.y - dd.y)).toBeCloseTo(Math.hypot(b.x - e.x, b.y - e.y), 6); // equal tangents from B
    expect(d.positions.has('O')).toBe(false); // the centre stays unnamed
  });
});

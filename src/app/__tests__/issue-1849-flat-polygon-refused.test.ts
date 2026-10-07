/**
 * #1849 ([ADR-602](../../../docs/06-decisions.md#adr-602), [ADR-W-115](../../../docs/06w-decisions-workspace.md#adr-w-115))
 * — A DECLARED POLYGON THE GIVENS FORCE FLAT IS REFUSED, NAMING THE STATEMENTS.
 *
 * Operator ruling, 2026-10-07: *"refuse on all tools with a message since it contradicts ABC is a triangle and a
 * flat line is not a triangle"* — reversing ADR-W-048's "a notice, not a refusal" for declared polygons.
 *
 * Measured on `main` @ 3032fcbb through `decideDeterministic2D` + the real gate (`driveThroughGate`), seed 0:
 *   «משולש ABC» · «AB = 5» · «BC = 3» · «AC = 8»   → commit, flat 1.9e-4, notice «המצולע ABC התמוטט לקו…»
 *   the same in the order AC, AB, BC; 4·4·8; «AB : BC = 5 : 3 · AB : AC = 5 : 8»; «AC = AB + BC»;
 *   «AB = BC · AC = 2AB»; «היקף המשולש ABC = 16 · AC = 8»                          → commit + notice (1.0e-4–2.0e-4)
 *   «מרובע ABCD» · «AB = 1 · BC = 1 · CD = 1 · AD = 3»                          → commit + notice (3.3e-4)
 *   «משולש ABC» · «D אמצע AB» · «D על AC»                                       → refused (ADR-413), «…סותר את «D אמצע AB»»
 *
 * Two mechanisms, at the two seams that already existed — a PROOF ahead of the ladder for the length family
 * (`forcedFlatPolygon`, stage 0h) and the accept gate's floor raised onto the notice band behind it — and one
 * message for every member, naming the polygon's declaring statement as the other side.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { choiceRescue, COLLAPSED_VS } from '@/replay/core';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { DEGENERATE_EXTENT_RATIO, degeneratePolygons } from '@/engine';
import { forcedFlatPolygon } from '@/engine/metricFeasibility';
import type { Constraint, GeoObject } from '@/engine';
import { stripFormatControls } from '../../../shell/bidi';

const t: Translate = (k, o) => i18n.t(k, o) as string;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** The deterministic verdict on `line` after `prefix` has been driven through the real gate, and its Hebrew note. */
async function decide(prefix: string[], line: string) {
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const f = replay(st.facts, st.seed);
  const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, 'he');
  const raw = v.kind === 'refuse' && v.note && 'explain' in v.note ? v.note.explain : null;
  const he = raw ? stripFormatControls(humanizeError(raw, t, line, otherUtteranceForError(st.facts, raw))) : null;
  return { v, raw, he };
}

const poly = (vertices: string[]): GeoObject => ({ kind: 'polygon', id: `poly-${vertices.join('')}`, vertices }) as GeoObject;
const dist = (a: string, b: string, value: number): Constraint => ({ type: 'distance', a, b, value });

describe('#1849 — the length prover (`forcedFlatPolygon`): a theorem, not a measurement', () => {
  it('|AC| = |AB| + |BC| forces the triangle flat, from pins, a ratio, an affine sum, a perimeter', () => {
    const tri = [poly(['A', 'B', 'C'])];
    const proofs: Constraint[][] = [
      [dist('A', 'B', 5), dist('B', 'C', 3), dist('A', 'C', 8)],
      [dist('A', 'C', 8), dist('A', 'B', 5), dist('C', 'B', 3)], // reversed operands
      [{ type: 'ratio', a: 'A', b: 'B', c: 'B', d: 'C', k: 5 / 3 }, { type: 'ratio', a: 'A', b: 'B', c: 'A', d: 'C', k: 5 / 8 }],
      [{ type: 'measure-sum', unit: 'length', coefs: [1, -1, -1], points: ['A', 'C', 'A', 'B', 'B', 'C'], target: 0 }],
      [{ type: 'perimeter', ids: ['A', 'B', 'C'], value: 16 }, dist('A', 'C', 8)],
      [{ type: 'equal', a: 'A', b: 'B', c: 'B', d: 'C' }, { type: 'ratio', a: 'A', b: 'C', c: 'A', d: 'B', k: 2 }],
    ];
    for (const cons of proofs) expect(forcedFlatPolygon(tri, cons)?.polygon, JSON.stringify(cons)).toEqual(['A', 'B', 'C']);
  });

  it('a quadrilateral is flat only when EVERY vertex is proven on one line — an arc of three, or two straight angles that share a side', () => {
    const quad = [poly(['A', 'B', 'C', 'D'])];
    expect(forcedFlatPolygon(quad, [dist('A', 'B', 1), dist('B', 'C', 1), dist('C', 'D', 1), dist('A', 'D', 3)])?.polygon).toEqual(['A', 'B', 'C', 'D']);
    // A, B, C on one line and A, C, D on one line share A and C ⇒ all four on line AC
    expect(forcedFlatPolygon(quad, [dist('A', 'B', 2), dist('B', 'C', 3), dist('A', 'C', 5), dist('C', 'D', 4), dist('D', 'A', 1)])?.polygon).toEqual(['A', 'B', 'C', 'D']);
    // three collinear vertices with the fourth free is NOT a flat quadrilateral
    expect(forcedFlatPolygon(quad, [dist('A', 'B', 2), dist('B', 'C', 3), dist('A', 'C', 5)])).toBeNull();
  });

  it('proves nothing it cannot prove: a real triangle, a strict excess (the metric prover’s), an inconsistent system, no polygon', () => {
    const tri = [poly(['A', 'B', 'C'])];
    expect(forcedFlatPolygon(tri, [dist('A', 'B', 5), dist('B', 'C', 3), dist('A', 'C', 7.99)])).toBeNull();
    expect(forcedFlatPolygon(tri, [dist('A', 'B', 5), dist('B', 'C', 3), dist('A', 'C', 9)])).toBeNull();
    expect(forcedFlatPolygon(tri, [dist('A', 'B', 5), dist('A', 'B', 6), dist('B', 'C', 3), dist('A', 'C', 8)])).toBeNull();
    expect(forcedFlatPolygon([], [dist('A', 'B', 5), dist('B', 'C', 3), dist('A', 'C', 8)])).toBeNull();
    expect(forcedFlatPolygon(tri, [dist('A', 'B', 5), dist('B', 'C', 3)])).toBeNull();
  });
});

describe('#1849 — the forced family is REFUSED at the door, naming the line and the declaration', () => {
  it.each([
    [['משולש ABC', 'AB = 5', 'BC = 3'], 'AC = 8'],
    [['משולש ABC', 'AC = 8', 'AB = 5'], 'BC = 3'],
    [['משולש ABC', 'AB = 4', 'BC = 4'], 'AC = 8'],
    [['משולש ABC', 'AB : BC = 5 : 3'], 'AB : AC = 5 : 8'],
    [['משולש ABC'], 'AC = AB + BC'],
    [['משולש ABC', 'AB = BC'], 'AC = 2AB'],
    [['משולש ABC', 'היקף המשולש ABC = 16'], 'AC = 8'],
    [['triangle ABC', 'AB = 5', 'BC = 3'], 'AC = 8'],
  ])('%j then «%s» → refused: «…» סותר את «משולש ABC», a line is not a triangle', async (prefix, line) => {
    const { v, raw, he } = await decide(prefix, line);
    expect(v.kind, 'refused before it becomes a fact').toBe('refuse');
    expect(raw).toMatch(COLLAPSED_VS);
    expect(llmParseMock, 'never escalated').not.toHaveBeenCalled();
    expect(he).toContain(`«${line}» סותר את «${prefix[0]}»`);
    expect(he).toContain('וקו ישר אינו משולש');
  });

  it('a quadrilateral the lengths force flat: «וקו ישר אינו מרובע»', async () => {
    const { v, he } = await decide(['מרובע ABCD', 'AB = 1', 'BC = 1', 'CD = 1'], 'AD = 3');
    expect(v.kind).toBe('refuse');
    expect(he).toContain('«AD = 3» סותר את «מרובע ABCD»');
    expect(he).toContain('וקו ישר אינו מרובע');
  });

  it('a stated incidence that flattens a declared polygon (ADR-413’s family) takes the same message', async () => {
    for (const [prefix, line, noun] of [
      [['משולש ABC', 'D אמצע AB'], 'D על AC', 'משולש'],
      [['משולש ABC'], 'הנקודות A, B, C על ישר אחד', 'משולש'],
      [['מרובע ABCD', 'C על הישר AB'], 'D על הישר AB', 'מרובע'],
      [['מרובע ABCD'], 'ישר ABCD', 'מרובע'],
    ] as [string[], string, string][]) {
      const { v, raw, he } = await decide(prefix, line);
      expect(v.kind, line).toBe('refuse');
      expect(raw, line).toMatch(COLLAPSED_VS);
      expect(he, line).toContain(`«${line}» סותר את «${prefix[0]}»`);
      expect(he, line).toContain(`וקו ישר אינו ${noun}`);
    }
  });

  it('the polygon declared LAST over lengths that already put its vertices on a line is the refused line itself', async () => {
    const { v, he } = await decide(['AB = 5', 'BC = 3', 'AC = 8'], 'משולש ABC');
    expect(v.kind).toBe('refuse');
    expect(he).toContain('עם «משולש ABC» המשולש ABC היה נעשה קו ישר');
  });

  it('the submit path renders the other side too (the note the student reads)', async () => {
    const notes: string[] = [];
    const deps: SubmitDeps = {
      t: (k, o) => i18n.t(k, o) as string,
      locale: 'he',
      ui: { setInputNote: (m) => notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
      view: () => {
        const st = useGeoStore.getState();
        const d = replay(st.facts, st.seed);
        return { construction: d.construction, positions: d.positions };
      },
      isBusy: () => false,
      nextPaint: async () => {},
      resolveAfterCommit: () => {},
      llmAbortRef: { current: null },
      explainError: (raw, said, other) => humanizeError(raw, t, said, other),
    };
    for (const line of ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']) await runSubmit(line, deps);
    expect(useGeoStore.getState().facts.map((f) => f.utterance)).not.toContain('AC = 8');
    expect(stripFormatControls(notes.filter(Boolean).at(-1) ?? '')).toContain('«AC = 8» סותר את «משולש ABC»');
  });
});

describe('#1849 — the false-refusal net: what is not forced flat still builds', () => {
  it.each([
    [['משולש ABC', 'זווית BAC = 3']], // ADR-413's thin-but-legit control
    [['משולש ABC', 'זווית BAC = 1']],
    [['משולש ABC', 'זווית BAC = 0.1']], // a real triangle below the screen's resolution — drawn above the floor
    [['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.9']],
    [['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 7.99']],
    [['משולש ABC', 'זווית ABC = 89', 'זווית ACB = 90']],
    [['AB = 5', 'BC = 3', 'AC = 8']], // no declared polygon: three collinear points are a figure
    [['מרובע ABCD', 'AB = 2', 'BC = 3', 'AC = 5']], // three collinear vertices: not a flat quadrilateral
  ])('%j builds, every row ok, every declared polygon above the floor', (seq) => {
    const { facts, refused } = driveThroughGate(seq);
    expect(refused).toEqual([]);
    const fig = replay(facts, 0);
    expect(fig.lastError).toBeNull();
    for (const d of degeneratePolygons(fig.construction, fig.positions, 1)) expect(d.ratio, d.id).toBeGreaterThan(DEGENERATE_EXTENT_RATIO);
  });

  it('«משולש שווה שוקיים ABC · AB = 4 · BC = 8» is NOT forced flat: only the DEFAULT apex flattens it, and another apex is a real 4·8·8 triangle (M4)', () => {
    // The step refuses the default seat (apex A: 4·4·8 is a line) exactly as it refuses 4·4·9 there (the metric
    // prover); the unstated apex is the variant rescue's to flip (ADR-573). Asserted on the rescue itself with an
    // unhurried deadline — the gate's 1.5 s wall-clock budget is the rescue's, measured at 1.6 s for this figure
    // on the dev machine (reported with #1849; the 4·4·9 twin pays the same).
    const facts = factsOf(['משולש שווה שוקיים ABC', 'AB = 4', 'BC = 8']);
    expect(replay(facts, 0).lastError, 'the default apex is refused, as a collapse').toMatch(COLLAPSED_VS);
    const cured = choiceRescue(facts, Date.now() + 60_000);
    expect(cured, 'another apex admits the figure').not.toBeNull();
    const fig = replay(cured!.facts, cured!.seed);
    expect(fig.lastError).toBeNull();
    expect(degeneratePolygons(fig.construction, fig.positions, 1)[0]!.ratio).toBeGreaterThan(0.1);
  });
});

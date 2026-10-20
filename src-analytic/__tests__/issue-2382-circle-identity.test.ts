/**
 * #2382 ([ADR-AG-305](../../docs/06c-decisions-analytic.md#adr-ag-305)) — A SENTENCE ABOUT A CIRCLE NEVER MINTS ITS RADIUS
 * AGAIN.
 *
 * Class: a sentence that refers to an existing circle by its centre letter re-ran the circle's creation lowering
 * (`circleAtFacts`), so it re-declared `param r_<centre>` beside a circle whose radius was already given. Three symptoms:
 * a phantom free DOF blanked a fully stated figure (the reported one); an axis or line tangency was judged against the
 * phantom radius, so a circle of radius 3 was drawn "tangent" to an axis at distance 4 (F1–F3, P1); and a centre named
 * after an equation circle («M מרכז מעגל I») got a SECOND, invented circle on M (C5).
 *
 * The rule: the circle is created once, at M1 (`circle-at` with no radius is a reference; `stateCircleOn` mints the
 * radius only for a centre with no circle), and every relation reads that circle's own centre and radius. Every
 * assertion CALLS the decision: `decideSubmit` (the student's Enter), `derive`, `panelKnowledge`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { panelKnowledge } from '../app/panelRows';
import { paramRegister, radiusSymbolsRead } from '../engine/carriers';
import { dispatchRename, type RenameState } from '../app/rename';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { analyticCorpus } from './analyticCorpus';
import stated from './fixtures/issue-2382-stated-radius-tangent.analytic.json';
import q2 from './fixtures/issue-2382-q2-centre-radius.analytic.json';
import q3 from './fixtures/issue-2382-q3-tangent-circles.analytic.json';
import { parseLine } from '../parser/parseAnalytic';
import { fold } from '../engine/apply';
import type { Fact } from '../engine/types';

type Verdict = { kind: string; line?: string; error?: { key?: string } };

/** Every line through the real submit door; a line that adds nothing («זה כבר נובע», «כבר ידוע») is consumed, as the Enter consumes it. */
function submitAll(lines: readonly string[]): { recorded: string[]; verdicts: Verdict[] } {
  const recorded: string[] = [];
  const verdicts: Verdict[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, recorded, 0) as Verdict;
    verdicts.push(v);
    if (v.kind === 'record') recorded.push(v.line ?? line);
    else if (v.kind !== 'already-follows' && v.kind !== 'already-known') throw new Error(`«${line}» → ${v.kind} ${v.error?.key ?? ''}`);
  }
  return { recorded, verdicts };
}

/** The verdict of the LAST line after the earlier ones record. */
function lastVerdict(lines: readonly string[]): Verdict {
  const { recorded } = submitAll(lines.slice(0, -1));
  return decideSubmit(lines[lines.length - 1], recorded, 0) as Verdict;
}

/** The panel over ALL the lines folded (the sentence under test included, whatever its submit verdict). */
function panel(lines: readonly string[]) {
  const d = derive(lines, 0);
  expect(d.faults).toEqual([]);
  const pk = panelKnowledge(d);
  return { d, pk, register: paramRegister(d.construction).map((p) => p.sym) };
}

/**
 * A value the panel PRINTS: known, or (a pinned parameter with several roots, #2380) its options listed. Either way no «?».
 */
const settled = (k: { known: boolean; options?: readonly number[] }) => k.known || (k.options?.length ?? 0) > 0;

/** Every stated value visible: no phantom radius in the register, no unused row, every point and equation printed. */
function expectAllKnown(lines: readonly string[], radiiStated = true) {
  const { d, pk, register } = panel(lines);
  // Every radius was given, so none is a free parameter (a radius a tangency PINS is `radiiStated = false`).
  if (radiiStated) expect(register.filter((s) => s.startsWith('r_'))).toEqual([]);
  expect(pk.params.filter((p) => !p.used)).toEqual([]);
  for (const p of pk.points) expect(settled(p.x) && settled(p.y), `${p.id} unknown in ${lines.join(' · ')}`).toBe(true);
  for (const c of pk.curves) expect(c.known !== null || (c.options?.length ?? 0) > 0, `${c.id} unknown`).toBe(true);
  for (const p of pk.params) expect(settled(p.k), `${p.sym} unknown`).toBe(true);
  expect(radiusSymbolsRead(d.construction)).toBe(true);
  return d;
}

const TWO_STATED = ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו N(15,0) ורדיוסו 10'];
const TWO_POSTHOC = ['נתון מעגל שמרכזו M(0,0)', 'רדיוס המעגל M הוא 5', 'נתון מעגל שמרכזו N(15,0)', 'רדיוס המעגל N הוא 10'];

describe('#2382 (1) — the subject spellings about two circles with given radii', () => {
  const SENTENCES = ['מעגל N משיק למעגל M', 'מעגל N משיק למעגל M מבחוץ', 'המעגלים M ו-N משיקים', 'המעגלים M ו-N משיקים מבחוץ', 'מעגל M ומעגל N משיקים', 'מעגל M ומעגל N משיקים מבחוץ', 'נתון מעגל M'];
  for (const [ctxName, ctx] of [['radius in the creation sentence', TWO_STATED], ['radius stated afterwards', TWO_POSTHOC]] as const) {
    it.each(SENTENCES)(`${ctxName}: «%s» keeps both radii, M, N and both equations known`, (s) => {
      const lines = [...ctx, s];
      // The touch already holds (|MN| = 5 + 10), so the line adds nothing: consumed, never a phantom freedom.
      expect(['already-follows', 'already-known', 'record']).toContain(lastVerdict(lines).kind);
      const d = expectAllKnown(lines);
      expect(d.construction.objects.filter((o) => o.kind === 'circle-at').map((o) => o.id).sort()).toEqual(['circle-at-M', 'circle-at-N']);
    });
  }

  it('«…משיקים מבפנים» about the same two circles is refused as contradictory, never drawn', () => {
    expect(lastVerdict([...TWO_STATED, 'מעגל N משיק למעגל M מבפנים']).error?.key).toBe('unsatisfiable');
  });
});

describe('#2382 (1) — the axis and line targets about a circle with a given radius', () => {
  const CASES: Array<[string, string[]]> = [
    ['x-axis, radius in the sentence', ['נתון מעגל שמרכזו M(3,5) ורדיוסו 5', 'מעגל M משיק לציר ה-x']],
    ['x-axis, radius afterwards', ['נתון מעגל שמרכזו M(3,5)', 'רדיוס המעגל הוא 5', 'מעגל M משיק לציר ה-x']],
    ['x-axis at A', ['נתון מעגל שמרכזו M(3,5) ורדיוסו 5', 'מעגל M משיק לציר ה-x בנקודה A']],
    ['x-axis at A, radius afterwards', ['נתון מעגל שמרכזו M(3,5)', 'רדיוס המעגל הוא 5', 'מעגל M משיק לציר ה-x בנקודה A']],
    ['a line', ['נתון מעגל שמרכזו M(8,-3) ורדיוסו 5', 'מעגל M משיק לישר 4x+3y+2=0']],
    ['a line at A', ['נתון מעגל שמרכזו M(8,-3) ורדיוסו 5', 'מעגל M משיק לישר 4x+3y+2=0 בנקודה A']],
    ['a line at A, radius afterwards', ['נתון מעגל שמרכזו M(8,-3)', 'רדיוס המעגל הוא 5', 'מעגל M משיק לישר 4x+3y+2=0 בנקודה A']],
  ];
  it.each(CASES)('%s: no phantom radius, everything known', (_n, lines) => {
    submitAll(lines);
    expectAllKnown(lines);
  });
});

describe('#2382 (2) — a false tangency is refused, the same verdict as its contextual twin (the P1 rows)', () => {
  const ROWS: Array<[string, string[], string]> = [
    ['F1: r = 3 against the x-axis at distance 4', ['נתון מעגל שמרכזו M(3,4) ורדיוסו 3', 'מעגל M משיק לציר ה-x'], 'המעגל משיק לציר ה-x'],
    ['F2: r = 3 against a line at distance 5', ['נתון מעגל שמרכזו M(8,-3) ורדיוסו 3', 'מעגל M משיק לישר 4x+3y+2=0'], 'המעגל משיק לישר 4x+3y+2=0'],
    ['F3: the radius stated in a later sentence', ['נתון מעגל שמרכזו M(3,4)', 'רדיוס המעגל הוא 3', 'מעגל M משיק לציר ה-x'], 'המעגל משיק לציר ה-x'],
  ];
  it.each(ROWS)('%s', (_n, lines, twin) => {
    const v = lastVerdict(lines);
    expect(v.kind).toBe('refused');
    expect(v.error?.key).toBe('unsatisfiable');
    const t = lastVerdict([...lines.slice(0, -1), twin]);
    expect(t.error?.key).toBe(v.error?.key);
    // …and the fold itself refuses the line: the figure is never drawn with a circle that does not touch.
    expect(derive(lines, 0).faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });
});

describe('#2382 (2) — C5: a centre named after an equation circle names THAT circle', () => {
  const CIRCLE_I = ['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=16', 'M מרכז מעגל I'];
  it('«מעגל M משיק לציר ה-x» gets the contextual sentence’s refusal, and no second circle', () => {
    const v = lastVerdict([...CIRCLE_I, 'מעגל M משיק לציר ה-x']);
    expect(v.error?.key).toBe('out-of-scope');
    expect(lastVerdict([...CIRCLE_I, 'המעגל משיק לציר ה-x']).error?.key).toBe('out-of-scope');
  });
  it('«מעגל M משיק לישר y=k» pins k on circle I; no circle is invented on M', () => {
    const lines = [...CIRCLE_I, 'מעגל M משיק לישר y=k'];
    submitAll(lines);
    const { d, register, pk } = panel(lines);
    expect(d.construction.objects.some((o) => o.kind === 'circle-at')).toBe(false);
    expect(register).toEqual(['k']);
    // #2380 (ADR-AG-303, same batch): the line y = k touches circle I at k = 0 and at k = 8; both are reached, so k is two
    // options, not one known value (the old "known" was the pin losing its distant root).
    expect(pk.params.find((p) => p.sym === 'k')!.k.known).toBe(false);
  });
  it('«נתון מעגל M שרדיוסו 4» is a statement about circle I (already known), 5 a contradiction', () => {
    expect(lastVerdict([...CIRCLE_I, 'נתון מעגל M שרדיוסו 4']).kind).toBe('already-known');
    expect(lastVerdict([...CIRCLE_I, 'נתון מעגל M שרדיוסו 5']).kind).toBe('refused');
  });
});

describe('#2382 (3) — controls: a FREE radius is still pinned by the tangency', () => {
  const pinned = (lines: string[], sym: string, value: number) => {
    submitAll(lines);
    const { d, pk } = panel(lines);
    expect(pk.params.find((p) => p.sym === sym)!.k.known).toBe(true);
    const circle = d.figure.curves.map((c) => c.curve).find((c) => c.kind === 'circle' && Math.abs(c.r - value) < 1e-6);
    expect(circle, `${sym} = ${value}`).toBeDefined();
  };
  it('S6: «מעגל N משיק למעגל M מבחוץ» on a circle with no radius pins r_N = 10', () =>
    pinned(['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'נתון מעגל שמרכזו N(15,0)', 'מעגל N משיק למעגל M מבחוץ'], 'r_N', 10));
  it('the axis: «מעגל O משיק לציר ה-x» · «O(2,3)» pins r_O = 3', () => pinned(['מעגל O משיק לציר ה-x', 'O(2,3)'], 'r_O', 3));
  it('a line: «מעגל M משיק לישר 4x+3y+2=0» · «M(8,-3)» pins r_M = 5', () => pinned(['מעגל M משיק לישר 4x+3y+2=0', 'M(8,-3)'], 'r_M', 5));

  it('«שני מעגלים בעלי מרכז משותף O» keeps TWO circles (a creation with its own radius is never an identity lookup)', () => {
    const d = derive(['שני מעגלים בעלי מרכז משותף O'], 0);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.filter((o) => o.kind === 'circle-at').map((o) => o.id)).toEqual(['circle-at-O', 'circle-at-O-2']);
  });

  it('a letter change relabels the minted radius (#1667): O → K keeps r = 3 as r_K', () => {
    const store = useAnalyticStore.getState();
    store.clearAll();
    for (const l of ['מעגל O משיק לציר ה-x', 'O(2,3)']) store.recordLine(l);
    const s = useAnalyticStore.getState();
    const state: RenameState = { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames };
    const v = dispatchRename('O', 'K', state, { applyRename: s.applyRename, setError: s.setError }, derive(s.lines, s.seed, s.seedNames));
    expect(v.kind).toBe('apply');
    const after = useAnalyticStore.getState();
    const d = derive(after.lines, after.seed, after.seedNames);
    expect(paramRegister(d.construction).map((p) => p.sym)).toEqual(['r_K']);
    expect(panelKnowledge(d).params[0].k.known).toBe(true);
  });
});

describe('#2382 — the saved questions build green with every stated value visible', () => {
  it('the operator’s exact sequence (S1): M, N and both equations known, no r_N row', () => {
    const { verdicts } = submitAll(stated.lines);
    expect(verdicts.slice(0, 2).map((v) => v.kind)).toEqual(['record', 'record']);
    expectAllKnown(stated.lines);
  });
  it('Q2 (centre + radius, «מעגל M ומעגל N משיקים מבחוץ»): r and a known, no r_M / r_N rows', () => {
    const { recorded } = submitAll(q2.lines);
    expect(recorded).toEqual(q2.lines);
    const { register } = panel(q2.lines);
    expect(register.filter((s) => s.startsWith('r_'))).toEqual([]);
    expectAllKnown(q2.lines);
  });
  it('Q3 ב (a radius-10 circle tangent to M at A, left of the y-axis): M, A, N1 and every equation known', () => {
    const { recorded } = submitAll(q3.lines);
    expect(recorded).toEqual(q3.lines);
    // M's radius is never stated: the tangency pins r_M = 5, and it is READ (no phantom r_N1).
    const d = expectAllKnown(q3.lines, false);
    expect(paramRegister(d.construction).map((p) => p.sym)).toEqual(['r_M']);
    const n1 = d.figure.points.find((p) => p.id === 'N1')!;
    expect(n1.x).toBeCloseTo(-4, 6);
    expect(n1.y).toBeCloseTo(-12, 6);
  });
});

/**
 * THE CORPUS INVARIANT (A3): over every figure the analytic suite builds and every catalog entry, no lowering mints a
 * radius its circle does not read. Folded only (no evaluation): the invariant is about the construction.
 */
describe('#2382 (4) — corpus invariant: every minted radius is read', () => {
  it('radiusSymbolsRead holds over analyticCorpus()', () => {
    const offenders: string[] = [];
    let folded = 0;
    for (const lines of analyticCorpus()) {
      const facts: Fact[] = [];
      const owner: number[] = [];
      lines.forEach((l, i) => {
        const r = parseLine(l);
        if (r.ok) for (const f of r.facts) (facts.push(f), owner.push(i));
      });
      if (facts.length === 0) continue;
      const { construction } = fold(facts, owner);
      folded++;
      if (!radiusSymbolsRead(construction)) offenders.push(lines.join(' · '));
    }
    expect(folded).toBeGreaterThan(500);
    expect(offenders).toEqual([]);
  });
});

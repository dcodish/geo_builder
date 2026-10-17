/**
 * #2228 ([ADR-695](../../../docs/06-decisions.md#adr-695)) — THE INVENTED-LABEL GATE COVERS POINTS ALREADY IN THE FIGURE.
 *
 * Operator ruling, 2026-10-16 (from #2225): «should 2-D's guard also catch an existing letter pulled into an invented
 * relation?» — "yes". `introducedNewLabels` (#255) exempted every label the figure already held, so an AI reading that
 * tied the sentence to an existing point it never mentions committed green: measured at `4b0b4592`, «משולש ABC» ·
 * «נקודה P» · «חבר את A לנקודה כלשהי שם» with the model answering «קטע PA» recorded the segment PA — P was the model's
 * choice, not the student's.
 *
 * Root cause: the figure exemption was unconditional. An existing label is now the student's only when the sentence
 * refers to it — by name, or by a noun that reaches a figure object holding it (`nounReferencedLabels`): the
 * decompositions the 2-D log holds («גובה ל BC» → «גובה מ-A ל-BC», «מעגל חוסם את המשולש» → «…ABC») keep passing.
 *
 * Path: `runSubmit` with the model mocked (the no-live-calls rule), and the gate itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { introducedNewLabels } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const notes: string[] = [];
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
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
    explainError: (raw) => raw ?? '',
  };
  return { deps, notes: () => notes.filter(Boolean) };
}

async function build(lines: string[]) {
  useGeoStore.getState().clear();
  for (const l of lines) await runSubmit(l, makeDeps().deps);
}

const TRI = { polygons: [['A', 'B', 'C']] };

beforeEach(() => llmParseMock.mockReset());

describe('#2228 — the seam: an AI reading through an existing point the sentence never names is refused', () => {
  it('«חבר את A לנקודה כלשהי שם» answered «קטע PA» records nothing and names P', async () => {
    await build(['משולש ABC', 'נקודה P']);
    const before = useGeoStore.getState().facts.length;
    llmParseMock.mockResolvedValue({ built: [{ step: 'קטע PA', commands: [{ type: 'segment', a: 'P', b: 'A' }] }], dropped: [] });
    const d = makeDeps();
    await runSubmit('חבר את A לנקודה כלשהי שם', d.deps);
    expect(llmParseMock).toHaveBeenCalledTimes(1);
    expect(useGeoStore.getState().facts.length).toBe(before);
    expect(d.notes()).toEqual(['input.labelsInvented:{"labels":"P"}']);
  });

  it('the same answer, when the sentence names P, records', async () => {
    await build(['משולש ABC', 'נקודה P']);
    const before = useGeoStore.getState().facts.length;
    llmParseMock.mockResolvedValue({ built: [{ step: 'קטע PA', commands: [{ type: 'segment', a: 'P', b: 'A' }] }], dropped: [] });
    const d = makeDeps();
    await runSubmit('חבר את A ל-P איכשהו שם', d.deps);
    expect(d.notes()).toEqual([]);
    expect(useGeoStore.getState().facts.length).toBeGreaterThan(before);
  });
});

describe('#2228 — the gate: an existing label is the student\'s only through a reference', () => {
  it('#2225\'s shape in 2-D: «ישר l» answered «ישר l דרך P» invents P, though P exists', () => {
    expect(introducedNewLabels('ישר l', ['ישר l דרך P'], ['A', 'B', 'C', 'P'], TRI)).toEqual(['P']);
  });

  it('a relation the sentence never stated, on an existing vertex, is an invention: «AB = 5» answered with ∠C', () => {
    expect(introducedNewLabels('AB = 5', ['AB = 5', '∠ACB = 90'], ['A', 'B', 'C'], {})).toEqual(['C']);
  });

  it('a NEW label is still an invention (#255 unchanged)', () => {
    expect(introducedNewLabels('AB חותך את CD', ['M חיתוך AB ו-CD'], ['A', 'B', 'C', 'D'])).toEqual(['M']);
  });

  it('the student\'s own label passes, case-blind in Hebrew text (#779; a Latin lowercase line meets the fold nudge first)', () => {
    expect(introducedNewLabels('קטע ab', ['קטע AB'], ['A', 'B'])).toEqual([]);
  });
});

describe('#2228 — what must keep passing: a noun reaches its object\'s points (the 2-D log\'s decompositions)', () => {
  it('«גובה ל BC» → «גובה מ-A ל-BC»: the role noun reaches the triangle holding B and C', () => {
    expect(introducedNewLabels('גובה ל BC', ['גובה מ-A ל-BC'], ['A', 'B', 'C'], TRI)).toEqual([]);
  });

  it('«מעגל חוסם את המשולש» → «מעגל חוסם את ABC»: the shape noun reaches the triangle', () => {
    expect(introducedNewLabels('מעגל חוסם את המשולש', ['מעגל חוסם את ABC'], ['A', 'B', 'C'], TRI)).toEqual([]);
  });

  it('«P מחוץ למעגל» → «P מחוץ למעגל O»: the circle noun reaches its centre', () => {
    const circles = [{ id: 'circle-O', center: 'O', points: ['A'] }];
    expect(introducedNewLabels('נקודה P מחוץ למעגל', ['P מחוץ למעגל O'], ['O', 'A'], { circleMembers: circles })).toEqual([]);
  });

  it('«E אמצע הצלע» → «E אמצע AB»: the side noun reaches the polygon', () => {
    expect(introducedNewLabels('E אמצע הצלע', ['E אמצע AB'], ['A', 'B', 'C'], TRI)).toEqual([]);
  });

  it('«E על הקטע» → «E על AB»: the segment noun reaches a drawn segment\'s endpoints', () => {
    expect(introducedNewLabels('E על הקטע', ['E על AB'], ['A', 'B'], { segments: [['A', 'B']] })).toEqual([]);
  });

  it('the English nouns too: "the circumcircle of the triangle" → «מעגל חוסם את ABC»', () => {
    expect(introducedNewLabels('the circle around the triangle', ['מעגל חוסם את ABC'], ['A', 'B', 'C'], TRI)).toEqual([]);
  });

  it('a noun reaches only the object holding a named point: «גובה ל BC» beside a square DEFG, answered from D, invents D', () => {
    const refs = { polygons: [['A', 'B', 'C'], ['D', 'E', 'F', 'G']] };
    expect(introducedNewLabels('גובה ל BC', ['גובה מ-D ל-BC'], ['A', 'B', 'C', 'D', 'E', 'F', 'G'], refs)).toEqual(['D']);
  });

  it('a noun reaches nothing the figure does not hold as that object: a free point is never reached by «המשולש»', () => {
    expect(introducedNewLabels('מעגל חוסם את המשולש', ['מעגל חוסם את ABP'], ['A', 'B', 'C', 'P'], TRI)).toEqual(['P']);
  });
});

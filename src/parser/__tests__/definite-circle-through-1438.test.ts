/**
 * #1438 ([ADR-548](../../../docs/06-decisions.md#adr-548)) — A THROUGH-STATEMENT ABOUT A DRAWN CIRCLE IS A
 * REFERENCE TO IT.
 *
 * «מעגל O · נקודה A · המעגל עובר דרך A» committed `circle-through circle-P` — a second circle, circle O
 * untouched, every row green. The definite «המעגל» is an ADR-029 reference, but the circle DEFINITION rule
 * never asked the introduce-vs-resolve question: it stripped the noun, minted a fresh centre (P, Q…), and let
 * the rest of the through list ride as "residue for the membership post-passes", which never claimed it —
 * so «… עובר דרך A ו-B» dropped B. The named twin («מעגל O עובר דרך A» over a drawn O) re-DEFINED O in
 * place and broke the figure whenever A was typed after O.
 *
 * The class, and what these rows lock: a statement about an EXISTING circle lowers to membership on it
 * (M1), the same `point-on-circle` per label «X [ו-Y] על המעגל» emits; beside several circles it asks; a
 * DEFINITION lowers exactly one through point and fails closed on anything it cannot read.
 *
 * Runs the real parser, replay and submit pipeline — only the LLM call is mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';
import { ctxOf, factsOf } from '@/__tests__/scenario-pipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { runSubmit } from '@/app/submitPipeline';
import type { SubmitDeps } from '@/app/submitPipeline';

const on = (setup: string[], line: string) => parse(line, ctxOf(factsOf(setup as never)));
const cmds = (setup: string[], line: string): AnyCommand[] => {
  const r = on(setup, line);
  expect(r.ok, `«${line}» after ${setup.join(' · ')} should parse (${!r.ok ? r.reason : ''})`).toBe(true);
  return r.ok ? r.commands : [];
};
const onCircle = (ids: string[], circle = 'circle-O') => ids.map((id) => ({ type: 'point-on-circle', id, circle }));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('#1438 — the issue table: a definite «המעגל» over a drawn circle binds THAT circle', () => {
  it.each([
    [['מעגל O', 'נקודה A']],
    [['מעגל O ברדיוס 3', 'נקודה A']],
    [['משולש ABC', 'מעגל O']],
    [['מעגל ברדיוס 3', 'נקודה A']],
    [['מלבן ABCD', 'מעגל O']],
  ])('after %j → A on circle O, no new circle', (setup) => {
    expect(cmds(setup, 'המעגל עובר דרך A')).toEqual(onCircle(['A']));
  });

  it('«ו-B» — every label of the through list lands on the circle (B was silently dropped)', () => {
    expect(cmds(['משולש ABC', 'מעגל O'], 'המעגל עובר דרך A ו-B')).toEqual(onCircle(['A', 'B']));
    expect(cmds(['משולש ABC', 'מעגל O'], 'המעגל עובר דרך A, B ו-C')).toEqual(onCircle(['A', 'B', 'C']));
  });

  it('beside two circles it ASKS which — never a third circle', () => {
    expect(on(['מעגל O', 'מעגל P', 'נקודה A'], 'המעגל עובר דרך A')).toMatchObject({ ok: false, reason: 'ambiguous-circle-ref', centers: ['O', 'P'] });
    expect(on(['משולש ABC', 'מעגל O', 'מעגל P'], 'המעגל עובר דרך A ו-B')).toMatchObject({ ok: false, reason: 'ambiguous-circle-ref' });
  });

  it('beside two circles, the statement\'s own points pick the circle when they can (the ADR-443 tie-break)', () => {
    expect(cmds(['מעגל O', 'מעגל P', 'A על מעגל P'], 'המעגל עובר דרך A')).toEqual(onCircle(['A'], 'circle-P'));
  });

  it('A never introduced → created ON circle O; nothing named «P»', () => {
    expect(cmds(['מעגל O'], 'המעגל עובר דרך A')).toEqual(onCircle(['A']));
    const fig = replay(factsOf(['מעגל O', 'המעגל עובר דרך A'] as never));
    expect(fig.lastError).toBeNull();
    expect([...fig.circles.keys()]).toEqual(['circle-O']);
  });

  it('E stated outside, then «המעגל עובר דרך E» → the same named contradiction as «E על המעגל»', () => {
    // #1470 (ADR-549) overrules the amber this lock used to assert: the two statements cannot both hold,
    // so the incidence is REFUSED at stage 0g′ naming both — for both spellings alike, which is what this
    // lock is for (the spelling binds circle O exactly as «E על המעגל» does).
    const errors = ['המעגל עובר דרך E', 'E על המעגל'].map((line) => {
      const facts = factsOf(['מעגל O', 'E נקודה מחוץ למעגל', line] as never);
      const fig = replay(facts);
      expect([...fig.circles.keys()], line).toEqual(['circle-O']);
      return fig.status[facts[facts.length - 1].id];
    });
    expect(errors[0]).toBe('impossible: «E on circle O» contradicts «E outside circle O»');
    expect(errors[1]).toBe(errors[0]);
  });
});

describe('#1438 — the spellings (both locales)', () => {
  it.each([
    'המעגל עובר דרך A',
    'המעגל עובר דרך הנקודה A',
    'המעגל עובר בנקודה A',
    'המעגל העובר דרך A',
    'the circle passes through A',
    'the circle passes through point A',
  ])('«%s» after «מעגל O · נקודה A» → A on circle O', (line) => {
    expect(cmds(['מעגל O', 'נקודה A'], line)).toEqual(onCircle(['A']));
  });

  it('with no circle drawn the new spellings DEFINE one (the definition path keeps them)', () => {
    for (const line of ['המעגל עובר דרך A', 'מעגל העובר דרך הנקודה A', 'מעגל העובר בנקודה A']) {
      const c = cmds(['נקודה A'], line);
      expect(c, line).toHaveLength(1);
      expect(c[0], line).toMatchObject({ type: 'circle-through', through: 'A', autoCenter: true });
    }
  });

  it('an INDEFINITE «מעגל העובר דרך A» beside circle O still introduces a new circle (unchanged)', () => {
    expect(cmds(['מעגל O', 'נקודה A'], 'מעגל העובר דרך A')).toEqual([{ type: 'circle-through', id: 'circle-P', center: '@ctr-P', through: 'A', autoCenter: true }]);
  });
});

describe('#1438 — the named twin: «מעגל O עובר דרך A» over a drawn O is a statement ABOUT O', () => {
  it.each([
    [['מעגל O', 'נקודה A']],
    [['נקודה A', 'מעגל O']],
    [['מעגל O ברדיוס 3', 'נקודה A']],
  ])('after %j → A on circle O; the figure builds, the stated radius is kept', (setup) => {
    expect(cmds(setup, 'מעגל O עובר דרך A')).toEqual(onCircle(['A']));
    const fig = replay(factsOf([...setup, 'מעגל O עובר דרך A'] as never));
    expect(fig.lastError).toBeNull();
    const c = fig.circles.get('circle-O')!;
    expect(dist(fig.positions.get('A')!, c.center)).toBeCloseTo(c.r, 6);
    if (setup[0].includes('3')) expect(c.r).toBeCloseTo(3, 6);
  });

  it('a stated SIZE rides along instead of replacing the through point', () => {
    expect(cmds(['משולש ABC', 'מעגל O'], 'המעגל עובר דרך A ברדיוס 3')).toEqual([{ type: 'set-radius', circle: 'circle-O', value: 3 }, ...onCircle(['A'])]);
  });
});

describe('#1438 — the residue hole is closed: a definition never drops a through label', () => {
  it('a 3-point list is the circumcircle (read whole)', () => {
    for (const line of ['circle through A, B, C', 'מעגל העובר דרך A, B ו-C', 'circle through A, B and C']) {
      expect(cmds(['משולש ABC'], line).map((c) => c.type), line).toEqual(['circumcircle']);
    }
  });

  it('a 2-point definition fails closed (escalates) instead of committing a circle through A alone', () => {
    for (const setup of [[], ['משולש ABC']]) {
      const r = on(setup, 'מעגל העובר דרך A ו-B');
      if (r.ok) expect(r.commands.some((c) => c.type === 'circle-through' && !r.commands.some((d) => d.type === 'point-on-circle' && d.id === 'B'))).toBe(false);
      else expect(r.reason).toBe('not-handled');
    }
  });

  it('a through label that IS the centre is not a point on its circle — defer', () => {
    expect(on(['מעגל O'], 'המעגל עובר דרך O').ok).toBe(false);
  });

  it('a second clause is not swallowed by the reference path', () => {
    const r = on(['מעגל O', 'נקודה A'], 'המעגל עובר דרך A וחותך את BC בנקודה D');
    if (r.ok) expect(r.commands.every((c) => c.type === 'point-on-circle')).toBe(false);
  });
});

function makeDeps(notes: string[]) {
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: { setInputNote: (m) => { if (m) notes.push(m); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
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
  return deps;
}

describe('#1438 — through the real submit gate', () => {
  beforeEach(() => {
    useGeoStore.getState().clear();
    llmParseMock.mockReset();
    llmParseMock.mockResolvedValue({ built: [], dropped: [] });
  });
  const submit = async (lines: string[]) => {
    const notes: string[] = [];
    for (const l of lines) await runSubmit(l, makeDeps(notes));
    const st = useGeoStore.getState();
    return { notes, fig: replay(st.facts, st.seed), facts: st.facts };
  };

  it('the reviewer\'s sequence commits deterministically: one circle, A on it, no paid call', async () => {
    const { fig, notes } = await submit(['מעגל O', 'נקודה A', 'המעגל עובר דרך A']);
    expect(llmParseMock).not.toHaveBeenCalled();
    expect(fig.lastError).toBeNull();
    expect([...fig.circles.keys()]).toEqual(['circle-O']);
    const c = fig.circles.get('circle-O')!;
    expect(dist(fig.positions.get('A')!, c.center)).toBeCloseTo(c.r, 6);
    expect(notes.join(' ')).not.toMatch(/P/);
  });

  it('two circles: the student is asked which, nothing is committed, no paid call', async () => {
    const before = (await submit(['מעגל O', 'מעגל P', 'נקודה A'])).facts.length;
    const { notes, facts } = await submit(['המעגל עובר דרך A']);
    expect(facts.length).toBe(before);
    expect(notes.some((n) => n.startsWith('input.ambiguousCircleRef'))).toBe(true);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('A undefined: the refusal naming «P» is gone — A is created on circle O', async () => {
    const { notes, fig } = await submit(['מעגל O', 'המעגל עובר דרך A']);
    expect(notes.join(' ')).not.toMatch(/circle-P|\bP\b/);
    expect(fig.lastError).toBeNull();
    expect(fig.positions.has('A')).toBe(true);
  });
});

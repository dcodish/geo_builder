/**
 * #1654–#1658 ([ADR-562](../../../docs/06-decisions.md#adr-562)) — A GIVEN 2-D CANNOT MODEL IS NEVER
 * COMMITTED AS A DIFFERENT GIVEN, AND NEVER VANISHES.
 *
 * Found by the #1649 parity audit; re-measured through this very door before the change:
 *
 *   «משולש ABC» · «נתון: שיפוע הצלע AB הוא 3/4»        → commit  measure-length |AB| = 0.75   (#1654)
 *   «במשולש AOB חסום מעגל שמרכזו C (… ברביע השני)»      → commit  the incircle, quadrant gone  (#1655)
 *   «משולש ABC» · «דרך AC העבירו מישור המקביל ל-SD»     → commit  AC ∥ SD                      (#1656)
 *   «כדור שמרכזו O ורדיוסו 3»                          → commit  a circle of radius 3          (#1657)
 *   «0 < k < 6»                                        → noop «כבר קיים», the bound gone      (#1658)
 *
 * The first four share ONE cause: the out-of-scope register (`classifyOutOfScope`) was consulted only on
 * a FAILED parse, so any plane rule that read the rest of the sentence committed it with the foreign
 * operand absorbed. They are now refused by `parse` itself, before every rule (`foreignGiven`).
 *
 * #1658 is a different class: a variable bound is a SUPPORTED 2-D statement (ADR-390) — the defect was
 * that on a letter nothing binds it lowered to nothing with no mark (#926 had asked "is the letter bound?"
 * of `set-var` only). It now waits, marked, exactly as «α = 70» does, and takes effect when a statement
 * binds the letter — and a positive coefficient («AB = 2k») now carries the window instead of dropping it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { replay, useGeoStore, groupKey } from '@/store/geoStore';
import { COMMAND_CATALOG, buildParseCtx, foreignGiven, parse } from '@/parser';
import i18n from '@/i18n';
import { SCENARIOS_1 } from '@/__tests__/scenarios-corpus-1';
import { SCENARIOS_2 } from '@/__tests__/scenarios-corpus-2';
import { SCENARIOS_3 } from '@/__tests__/scenarios-corpus-3';
import { SCENARIOS_4 } from '@/__tests__/scenarios-corpus-4';

function makeDeps(locale: 'he' | 'en') {
  const calls = { notes: [] as string[], cleared: 0 };
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: locale }) as string;
  const deps: SubmitDeps = {
    t,
    locale,
    ui: { setInputNote: (m) => calls.notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => calls.cleared++, setBusy: () => {} },
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
  return { deps, calls, notes: () => calls.notes.filter(Boolean) };
}

/** Submit every line but the last (each must be accepted); then the last, reporting what the door did. */
async function play(lines: string[], locale: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  for (const l of lines.slice(0, -1)) {
    const d = makeDeps(locale);
    await runSubmit(l, d.deps);
    expect(d.calls.cleared, `«${l}» is accepted`).toBe(1);
  }
  const factsBefore = useGeoStore.getState().facts.length;
  const d = makeDeps(locale);
  await runSubmit(lines[lines.length - 1], d.deps);
  const st = useGeoStore.getState();
  return { refused: d.calls.cleared === 0, notes: d.notes(), added: st.facts.length - factsBefore, fig: replay(st.facts, st.seed) };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const POINTER = {
  analytic: { he: i18n.t('input.scope.analytic', { lng: 'he' }) as string, en: i18n.t('input.scope.analytic', { lng: 'en' }) as string },
  'cross-app': { he: i18n.t('input.scope.cross-app', { lng: 'he' }) as string, en: i18n.t('input.scope.cross-app', { lng: 'en' }) as string },
};

describe('#1654–#1657 — the operator-audit sentences are refused, naming the clause, with nothing committed', () => {
  it.each([
    ['#1654', ['משולש ABC', 'נתון: שיפוע הצלע AB הוא 3/4'], 'analytic', 'שיפוע'],
    ['#1655', ['במשולש AOB חסום מעגל שמרכזו C (הנקודה C נמצאת ברביע השני)'], 'analytic', 'ברביע'],
    ['#1656', ['משולש ABC', 'דרך AC העבירו מישור המקביל ל-SD'], 'cross-app', 'מישור'],
    ['#1657', ['כדור שמרכזו O ורדיוסו 3'], 'cross-app', 'כדור'],
  ] as const)('%s', async (_id, lines, family, word) => {
    const r = await play([...lines]);
    expect(r.refused, 'the text stays in the box').toBe(true);
    expect(r.added, 'nothing of the sentence was committed').toBe(0);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0], 'names the student’s own word').toContain(`"${word}"`);
    expect(r.notes[0].endsWith(POINTER[family].he), 'then the family’s pointer, unchanged').toBe(true);
    expect(llmParseMock, 'never escalated — the model could only re-absorb the operand').not.toHaveBeenCalled();
  });

  it('the English note names the word too', async () => {
    const r = await play(['triangle ABC', 'the slope of AB is 3/4'], 'en');
    expect(r.refused).toBe(true);
    expect(r.notes[0]).toContain('"slope"');
    expect(r.notes[0].endsWith(POINTER.analytic.en)).toBe(true);
  });

  it('the plane rule that absorbed «מישור» still builds the plane sentence it owns (no collateral)', async () => {
    const r = await play(['משולש ABC', 'דרך A העבירו ישר המקביל ל-BC']);
    expect(r.refused, r.notes.join(' | ')).toBe(false);
  });
});

describe('#1654–#1657 — every spelling of the families is refused by the grammar, before any rule', () => {
  const tri = () => {
    useGeoStore.getState().clear();
    useGeoStore.getState().executeMany([{ type: 'triangle', ids: ['A', 'B', 'C'] }], 'משולש ABC');
    const d = replay(useGeoStore.getState().facts, 0);
    return buildParseCtx(d.construction, d.positions);
  };
  it.each([
    // slope (#1654) — prefixed, «הצלע», possessive, mid-sentence, English
    ['analytic', 'נתון: שיפוע הצלע AB הוא 3/4'],
    ['analytic', 'שיפוע הצלע AB הוא 3/4'],
    ['analytic', 'שיפוע AB הוא 2'],
    ['analytic', 'השיפוע של AB הוא 3/4'],
    ['analytic', 'משולש ABC ושיפוע AB הוא 2'],
    ['analytic', 'the slope of AB is 3/4'],
    // quadrant (#1655) — the parenthetical, a bare clause, «רבע» + ordinal, English
    ['analytic', 'במשולש AOB חסום מעגל שמרכזו C (הנקודה C נמצאת ברביע השני)'],
    ['analytic', 'הנקודה C נמצאת ברביע השני'],
    ['analytic', 'C ברבע הראשון'],
    ['analytic', 'משולש ABC, הנקודה A ברביע הרביעי'],
    ['analytic', 'point C is in the second quadrant'],
    // plane (#1656)
    ['cross-app', 'דרך AC העבירו מישור המקביל ל-SD'],
    ['cross-app', 'מישור ABC'],
    ['cross-app', 'המישור P מקביל ל-AB'],
    ['cross-app', 'AB ניצב למישור BCD'],
    ['cross-app', 'הנקודה E במישור ABC'],
    ['cross-app', 'הזווית בין SA למישור הבסיס'],
    ['cross-app', 'שני מישורים נחתכים'],
    ['cross-app', 'a plane through AC parallel to SD'],
    ['cross-app', 'plane ABC'],
    // sphere (#1657)
    ['cross-app', 'כדור שמרכזו O ורדיוסו 3'],
    ['cross-app', 'הכדור שמרכזו O'],
    ['cross-app', 'a sphere with centre O and radius 3'],
  ] as const)('%s ← %s', (family, u) => {
    for (const r of [parse(u), parse(u, tri())]) {
      expect(r.ok, `«${u}» must not parse`).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('foreign-given');
        if (r.reason === 'foreign-given') expect(r.category).toBe(family);
      }
    }
  });

  it('the coordinate plane is the ANALYTIC frame, not a 3-D plane', () => {
    for (const u of ['מישור הקואורדינטות', 'מישור קרטזי', 'the cartesian plane', 'the coordinate plane']) {
      expect(foreignGiven(u)?.category, u).toBe('analytic');
    }
  });
});

describe('#1654–#1657 — the trigger words swallow no plane construction (the false-positive side)', () => {
  it.each([
    // the SETTING phrase is this tool's own world
    'במישור נתון משולש ABC',
    'במישור, משולש ABC',
    'in the plane, triangle ABC',
    'on a plane draw triangle ABC',
    // «רבע» (quarter) and «רביעי» (fourth) are not a quadrant
    'רבע מעגל OAB',
    'המעגל הרביעי',
    'הנקודה הרביעית D',
    // ordinary constructs
    'מעגל O',
    'מקבילית ABCD',
    'דרך A העבירו ישר המקביל ל-BC',
    'זווית ABC = 40',
    'AB = 3/4',
  ])('%s', (u) => {
    expect(foreignGiven(u)).toBeNull();
  });

  it('no catalog example is swallowed, in either language', () => {
    const swallowed: string[] = [];
    for (const e of COMMAND_CATALOG) for (const ex of [e.he, e.en]) if (ex && foreignGiven(ex)) swallowed.push(ex);
    expect(swallowed).toEqual([]);
  });

  it('no typed step of the scenario corpus is swallowed (non-vacuous)', () => {
    const swallowed: string[] = [];
    let seen = 0;
    for (const sc of [...SCENARIOS_1, ...SCENARIOS_2, ...SCENARIOS_3, ...SCENARIOS_4]) {
      const refused = new Set((sc.refusedSteps ?? []).map((r) => r.step));
      for (const [i, st] of sc.steps.entries()) {
        if (refused.has(i + 1)) continue; // a step DECLARED refused (e.g. this fix's own scenarios) is no construction
        const u = typeof st === 'string' ? st : 'edit' in st ? st.edit.to : null;
        if (!u) continue;
        seen++;
        if (foreignGiven(u)) swallowed.push(`${sc.id}: ${u}`);
      }
    }
    expect(seen).toBeGreaterThan(1000);
    expect(swallowed).toEqual([]);
  });
});

describe('#1654–#1657 — the ✎ edit seam refuses the same sentences', () => {
  it('editing a step into a sphere is refused and the step is untouched', async () => {
    await play(['מעגל O', 'משולש ABC']);
    const facts = useGeoStore.getState().facts;
    const key = groupKey(facts[facts.length - 1]);
    const notes: string[] = [];
    const ok = runEditCommit(key, 'כדור שמרכזו O ורדיוסו 3', { t: (k) => k, setInputNote: (m) => notes.push(m), resolveAfterCommit: () => {} });
    expect(ok).toBe(false);
    expect(useGeoStore.getState().facts).toEqual(facts);
  });
});

describe('#1658 — a bound on a letter is kept, marked while nothing binds it, and enforced once something does', () => {
  const lastStatus = (fig: ReturnType<typeof replay>) => {
    const st = useGeoStore.getState();
    return fig.status[st.facts[st.facts.length - 1].id];
  };

  it('«0 < k < 6» on a figure with no k — committed and marked waiting, never «already drawn»', async () => {
    const r = await play(['משולש ABC', '0 < k < 6']);
    expect(r.refused).toBe(false);
    expect(r.added, 'the bound is a row in the list').toBe(1);
    expect(r.notes.join(' '), 'never told it is already drawn').not.toContain(i18n.t('input.alreadyDrawn', { lng: 'he' }) as string);
    expect(lastStatus(r.fig)).toMatch(/^variable k is not defined by any statement/);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('the same for an order «α < β» between two letters nothing binds', async () => {
    const r = await play(['משולש ABC', 'α < β']);
    expect(r.added).toBe(1);
    expect(lastStatus(r.fig)).toMatch(/^variable α is not defined/);
  });

  const len = (fig: ReturnType<typeof replay>) => {
    const a = fig.positions.get('A')!, b = fig.positions.get('B')!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  it('stated FIRST, the bound takes effect when «AB = k» binds the letter', async () => {
    const r = await play(['משולש ABC', 'k > 40', 'AB = k']);
    expect(r.refused).toBe(false);
    for (const s of Object.values(r.fig.status)) expect(s).toBe('ok');
    expect(len(r.fig), '|AB| = k > 40').toBeGreaterThan(40);
  });

  it('a positive coefficient carries the window: «AB = 2k» · «k > 40» ⇒ |AB| > 80 (it used to vanish)', async () => {
    const r = await play(['משולש ABC', 'AB = 2k', 'k > 40']);
    expect(r.refused).toBe(false);
    expect(r.added).toBe(1);
    expect(lastStatus(r.fig)).toBe('ok');
    expect(len(r.fig)).toBeGreaterThan(80);
  });

  it('a form the bound cannot follow («AB = k²») is refused by name, not committed green', async () => {
    const r = await play(['משולש ABC', 'AB = k²', '0 < k < 6']);
    expect(r.refused).toBe(true);
    expect(r.added).toBe(0);
    expect(r.notes[0]).toMatch(/^relation on k cannot be enforced/);
  });

  it('control — a bare binding still bounds exactly as before', async () => {
    const r = await play(['משולש ABC', 'AB = k', 'k > 40']);
    expect(lastStatus(r.fig)).toBe('ok');
    expect(len(r.fig)).toBeGreaterThan(40);
  });
});

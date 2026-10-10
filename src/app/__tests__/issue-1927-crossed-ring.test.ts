/**
 * #1927 ([ADR-608](../../../docs/06-decisions.md#adr-608), [ADR-W-121](../../../docs/06w-decisions-workspace.md#adr-w-121))
 * — A RING DECLARED OVER POINTS THE FIGURE HAS ALREADY PLACED, IN AN ORDER THAT CROSSES IN EVERY CONFIGURATION,
 * IS REFUSED NAMING THE LINE.
 *
 * Operator ruling (#1927): *"refused naming the declaration, in every builder, with analytic's
 * `errRingContradictsNoun` … Never green, never a raw error"*. The text ships verbatim (lock note on #1927).
 *
 * Measured on `main` @ 5edeeca1 through `decideDeterministic2D` → `commitVerdict` → the App's `runViewResolve`:
 *   «ריבוע ABCD · מרובע ACBD», «מלבן ABCD · מרובע ABDC» → committed, crossed ring drawn, «לא נמצאה תצורה…»
 *   «מלבן ABCD · טרפז ABDC», «ריבוע ABCD · טרפז ACBD» → refused raw «D/B כבר מוגדרת…» (ADR-157)
 *   «מרובע ACBD · ריבוע ABCD» (ring first) → refused raw «C כבר מוגדרת…»
 *   «מחומש משוכלל ABCDE · מחומש ACEBD» (a pentagram) → committed GREEN, no note at all
 *
 * Driven through the REAL door (`runSubmit` with the App's post-commit view search) and the real ✎ seam
 * (`runEditCommit`); the model is mocked and must never be called.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runViewResolve } from '../resolveView';
import { runEditCommit, type EditDeps } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { findValidConfig, forcedCrossedRing, meetsRequirements } from '@/replay/core';
import { factsOf } from '../../__tests__/scenarios-harness';
import { ctxOf } from '../../__tests__/scenario-pipeline';
import { parse } from '@/parser';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

const strip = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');
const HE = (line: string) =>
  `הנקודות שציינת לא יוצרות את הצורה הזאת בסדר הזה: "${line}". אפשר לשנות את סדר האותיות כך שהצלעות לא ייחתכו, או לשנות את מקומות הנקודות — בסדר הנוכחי הקודקודים נופלים על ישר אחד או שהצורה מתקפלת על עצמה.`;
const EN = (line: string) =>
  `The points you gave do not form that shape in this order: "${line}". Reorder the letters so the sides do not cross, or move the points — as written the vertices fall on one line or the shape folds over itself.`;
const NO_CONFIG_HE = () => strip(i18n.t('figure.noValidConfig', { lng: 'he' }) as string);

/** Play `lines` through the submit door with the App's resolve wiring; the notes the student saw on the LAST line. */
async function play(lines: string[], locale: 'he' | 'en' = 'he') {
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: locale }) as string;
  useGeoStore.getState().clear();
  let notes: string[] = [];
  let before = { facts: useGeoStore.getState().facts, positions: new Map<string, { x: number; y: number }>() };
  for (const [i, line] of lines.entries()) {
    if (i === lines.length - 1) {
      const st = useGeoStore.getState();
      before = { facts: st.facts, positions: replay(st.facts, st.seed).positions as Map<string, { x: number; y: number }> };
    }
    notes = [];
    let resolving: Promise<void> = Promise.resolve();
    const deps: SubmitDeps = {
      t: (key, opts) => t(key, opts),
      locale,
      ui: { setInputNote: (m) => m && notes.push(strip(m)), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
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
          applyView: (found) => useGeoStore.getState().applyView({ facts: found.facts, seed: found.seed }),
          setPending: () => {},
          onExhausted: () => notes.push(strip(t('figure.noValidConfig'))),
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
  return { notes, facts: st.facts, seed: st.seed, positions: replay(st.facts, st.seed).positions, before };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** Every row of the class: [prefix lines…, the refused line]. Measured crossed at every prior sample. */
const MEMBERS: string[][] = [
  // the operator's rows
  ['ריבוע ABCD', 'מרובע ACBD'],
  ['מלבן ABCD', 'מרובע ABDC'],
  ['מלבן ABCD', 'טרפז ABDC'],
  // the class
  ['ריבוע ABCD', 'AB = 4', 'מרובע ACBD'],
  ['מקבילית ABCD', 'מרובע ACBD'],
  ['מעוין ABCD', 'מרובע ABDC'],
  ['טרפז ABCD', 'מרובע ACBD'],
  ['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABED'],
  ['משושה משוכלל ABCDEF', 'מרובע ACFD'],
  ['מחומש משוכלל ABCDE', 'מחומש ACEBD'],
  // a specific noun over the placed points (2-D used to answer ADR-157's raw redefinition)
  ['ריבוע ABCD', 'טרפז ACBD'],
  ['ריבוע ABCD', 'מקבילית ACBD'],
  // the ring first, then the shape that places its points: the shape line completes the crossing
  ['מרובע ACBD', 'ריבוע ABCD'],
  ['מרובע ABDC', 'מלבן ABCD'],
  ['טרפז ABDC', 'מלבן ABCD'],
];

describe('#1927 — the operator’s rows are refused at the submit door with analytic’s text, verbatim', () => {
  for (const [lines, he, en] of [
    [['ריבוע ABCD', 'מרובע ACBD'], HE('מרובע ACBD'), EN('מרובע ACBD')],
    [['מלבן ABCD', 'מרובע ABDC'], HE('מרובע ABDC'), EN('מרובע ABDC')],
    [['מלבן ABCD', 'טרפז ABDC'], HE('טרפז ABDC'), EN('טרפז ABDC')],
  ] as const) {
    it(`«${lines.join(' · ')}»`, async () => {
      const r = await play([...lines]);
      expect(r.notes, 'the exact Hebrew text, and nothing else (no «לא נמצאה תצורה…»)').toEqual([he]);
      expect(r.facts, 'the line is not added').toBe(r.before.facts);
      for (const [id, p] of r.before.positions) expect(r.positions.get(id), `the prior figure does not move (${id})`).toEqual(p);
      const e = await play([...lines], 'en');
      expect(e.notes).toEqual([en]);
      expect(llmParseMock, 'never escalated to the model').not.toHaveBeenCalled();
    });
  }
});

describe('#1927 — every member of the class, both orders, is refused naming its own line', () => {
  for (const lines of MEMBERS) {
    it(`«${lines.join(' · ')}»`, async () => {
      const r = await play(lines);
      const last = lines[lines.length - 1];
      expect(r.notes).toEqual([HE(last)]);
      expect(r.facts.length, 'nothing committed').toBe(r.before.facts.length);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }
});

/** Do two non-adjacent sides of the ring properly cross at these positions? */
function crossed(ids: string[], at: Map<string, { x: number; y: number }>): boolean {
  const p = ids.map((id) => at.get(id)!);
  const side = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.sign((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x));
  const n = p.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [p[i], p[(i + 1) % n], p[j], p[(j + 1) % n]];
      if (side(c, d, a) * side(c, d, b) < 0 && side(a, b, c) * side(a, b, d) < 0) return true;
    }
  return false;
}

/**
 * SEARCH FIRST, REFUSE LAST (the operator's ruling of 2026-10-09 on #1927, [ADR-613](../../../docs/06-decisions.md#adr-613)).
 * *"Refuse only when nothing the student wrote can save it."* A kite may be a DART, and on a dart ABDC is a simple ring:
 * the ruling names this row — 2-D must not refuse it, and draws the dart (as analytic does). The prior pool held only
 * convex kites because FR-EN-16's convexity is a DEFAULT, and the second ring is the statement it yields to.
 */
describe('#1927 — search first: a ring a configuration branch can save is drawn, never refused', () => {
  for (const lines of [['דלתון ABCD', 'מרובע ABDC'], ['מרובע ABDC', 'דלתון ABCD']]) {
    it(`«${lines.join(' · ')}» commits, and both rings are drawn simple (the kite as a dart)`, async () => {
      const r = await play(lines);
      expect(r.notes, 'no refusal, no exhausted search').toEqual([]);
      expect(r.facts.length).toBeGreaterThan(r.before.facts.length);
      const at = r.positions as Map<string, { x: number; y: number }>;
      expect(crossed(['A', 'B', 'C', 'D'], at), 'the kite ring').toBe(false);
      expect(crossed(['A', 'B', 'D', 'C'], at), 'the declared ring ABDC').toBe(false);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the convexity default yields only to a ring that orders the same points differently — the shapes that are convex whenever simple stay refused', async () => {
    for (const lines of [['ריבוע ABCD', 'מרובע ACBD'], ['טרפז ABCD', 'מרובע ACBD'], ['מעוין ABCD', 'מרובע ABDC']]) {
      const r = await play(lines);
      expect(r.notes, lines.join(' · ')).toEqual([HE(lines[lines.length - 1])]);
    }
  });
});

describe('#1927 — controls commit exactly as before', () => {
  it('the midpoint ring ABDE builds with no note', async () => {
    const lines = ['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABDE'];
    const r = await play(lines);
    expect(r.notes, lines.join(' · ')).toEqual([]);
    expect(r.facts.length).toBeGreaterThan(r.before.facts.length);
  });

  // #1953 (ADR-618) re-based this control: the square's own ring in a simple order is a RESTATEMENT, so it is
  // never refused here and adds no row — it answers «כבר קיים» (was: committed as a second row).
  it('the square read in a simple order is never refused — it is a restatement (#1953)', async () => {
    const r = await play(['ריבוע ABCD', 'מרובע ADCB']);
    expect(r.notes).toEqual([strip(i18n.t('input.alreadyDrawn', { lng: 'he' }) as string)]);
    expect(r.facts.length, 'no new row').toBe(r.before.facts.length);
  });

  it('a ring with a free vertex is a configuration choice, never this refusal — it commits', async () => {
    for (const lines of [
      ['משולש ABC', 'נקודה D', 'מרובע ABCD'],
      ['קטע AC', 'קטע BD', 'מרובע ABCD'],
      ['מעגל O', 'A, B, C ו-D על המעגל', 'מרובע ABCD'],
    ]) {
      const r = await play(lines);
      expect(r.notes, lines.join(' · ')).not.toContain(HE(lines[lines.length - 1]));
      expect(r.notes, `${lines.join(' · ')}: drawn simple, no exhausted search`).not.toContain(NO_CONFIG_HE());
      expect(r.facts.length).toBeGreaterThan(r.before.facts.length);
    }
  });

  it('the predicate fails open on a ring with a vertex the line itself creates', () => {
    const facts = factsOf(['משולש ABC']);
    const r = parse('מרובע ABDC', ctxOf(facts));
    expect(r.ok).toBe(true);
    if (r.ok) expect(forcedCrossedRing(facts, r.commands)).toBeNull();
  });
});

describe('#1927 — the ✎ edit seam refuses the same rows inline, with the same text', () => {
  function editDeps() {
    const notes: string[] = [];
    const resolves = { n: 0 };
    const deps: EditDeps = {
      t: (key, opts) => strip(i18n.t(key, { ...opts, lng: 'he' }) as string),
      setInputNote: (m) => notes.push(m),
      resolveAfterCommit: () => { resolves.n += 1; },
    };
    return { deps, notes, resolves };
  }

  // #1953 (ADR-618): on a square, «מרובע ADCB» is now a restatement and never becomes a row, so the row edited
  // here is the midpoint ring's (crossed-ring-1927-05's ring, in its simple order).
  it('editing «מרובע ABDE» into «מרובע ABED» on the midpoint ring is refused, and nothing changes', async () => {
    await play(['משולש ABC', 'D אמצע BC', 'E אמצע AC', 'מרובע ABDE']);
    const st = useGeoStore.getState();
    const key = groupKey(st.facts[st.facts.length - 1]);
    const before = st.facts;
    const { deps, notes, resolves } = editDeps();
    expect(runEditCommit(key, 'מרובע ABED', deps)).toBe(false);
    expect(notes.at(-1)).toBe(HE('מרובע ABED'));
    expect(useGeoStore.getState().facts, 'the step list is untouched').toBe(before);
    expect(resolves.n, 'no search is launched for a refused edit').toBe(0);
    // the control: editing it into another simple order commits
    const ok = editDeps();
    expect(runEditCommit(key, 'מרובע BDEA', ok.deps)).toBe(true);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
});

/**
 * #2177 ([ADR-733](../../../docs/06-decisions.md#adr-733), ADR-034 Am. 3) — THE RESERVED R/r NAMES ONE CIRCLE OR NONE.
 *
 * Reported: «מעגל O ברדיוס 3» · «מעגל P ברדיוס 5» · «r = 4» committed green and the 4 constrained nothing. Operator
 * ruling 2026-10-16 (ballot card 3): ask which circle; the ask cannot bind a letter (measured: `input.ambiguousCircleRef`
 * is a refusal with no answer channel), so fallback B — *"Refuse, naming both circles, and show one next step"*. Second
 * pass the same day: one sized circle beside an unsized one gets the same refusal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { reservedAmbiguity } from '@/engine/lower';
import { explainError } from '@/i18n/humanizeError';
import i18n from '@/i18n';
import { stripFormatControls } from '../../../shell/bidi';

type Lng = 'he' | 'en';
const tOf = (lng: Lng) => (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng }) as string;

function makeDeps(locale: Lng) {
  const calls = { notes: [] as string[], cleared: 0 };
  const t = tOf(locale);
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
    explainError: (raw, said, other) => explainError(raw, t, said, other),
  };
  return { deps, calls };
}

/** Type every line but the last (each must be accepted), then the last; report what the door did. */
async function play(lines: string[], locale: Lng = 'he') {
  useGeoStore.getState().clear();
  for (const l of lines.slice(0, -1)) {
    const d = makeDeps(locale);
    await runSubmit(l, d.deps);
    expect(d.calls.cleared, `«${l}» is accepted`).toBe(1);
  }
  const before = useGeoStore.getState().facts.length;
  const d = makeDeps(locale);
  await runSubmit(lines[lines.length - 1], d.deps);
  const st = useGeoStore.getState();
  const fig = replay(st.facts, st.seed);
  return { refused: d.calls.cleared === 0, added: st.facts.length - before, note: stripFormatControls(d.calls.notes.filter(Boolean).join(' / ')), fig };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const sized = (said: string, circles: string, letter: string, next: string) =>
  `«${said}»: בסרטוט יש כמה מעגלים שרדיוסם נתון (${circles}), ולכן לא ברור של איזה מהם ${letter} הוא הרדיוס. כתבו קודם את המעגל, למשל: «רדיוס מעגל ${next} הוא ${letter}».`;
const mixed = (said: string, circles: string, letter: string, next: string) =>
  `«${said}»: בסרטוט יש כמה מעגלים (${circles}), ולכן לא ברור של איזה מהם ${letter} הוא הרדיוס. כתבו קודם את המעגל, למשל: «רדיוס מעגל ${next} הוא ${letter}».`;
const radii = (fig: ReturnType<typeof replay>) => Object.fromEntries([...fig.circles.entries()].map(([id, c]) => [id, +c.r.toFixed(6)]));

describe('#2177 — the reserved r on a figure with several circles is refused, naming them, with one next step', () => {
  const TWO = ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5'];
  for (const [name, lines, want] of [
    ['the report', [...TWO, 'r = 4'], sized('r = 4', 'O, P', 'r', 'P')],
    ['the value one circle already has', [...TWO, 'r = 3'], sized('r = 3', 'O, P', 'r', 'P')],
    ['a third, unsized circle beside them (the sized ones are named)', [...TWO, 'מעגל Q', 'r = 4'], sized('r = 4', 'O, P', 'r', 'P')],
    ['used in a measure, not valued', [...TWO, 'A על המעגל O', 'B על המעגל P', 'AB = r'], sized('AB = r', 'O, P', 'r', 'P')],
    ['one sized circle beside an unsized one (second-pass ruling)', ['מעגל O ברדיוס 3', 'מעגל P', 'r = 4'], mixed('r = 4', 'O, P', 'r', 'P')],
  ] as [string, string[], string][]) {
    it(`${name}: refused word for word, nothing added, the AI never asked`, async () => {
      const r = await play(lines);
      expect(r.refused).toBe(true);
      expect(r.added).toBe(0);
      expect(r.note).toBe(want); // the sentence ends with its one next step — no generic retry hint after it
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the radii are untouched by the refused line (before: committed green, the 4 ignored)', async () => {
    const r = await play([...TWO, 'r = 4']);
    expect(radii(r.fig)).toEqual({ 'circle-O': 3, 'circle-P': 5 });
  });

  it('English: the same refusal in the English sentence', () => {
    const facts = factsOf([...TWO, 'r = 4']);
    const raw = replay(facts, 0).status[facts[facts.length - 1].id] as string;
    expect(stripFormatControls(explainError(raw, tOf('en'), 'r = 4'))).toBe(
      "«r = 4»: the figure has several circles with a given radius (O, P), so it isn't clear which one's radius r is. Name the circle first, e.g. «the radius of circle P is r».",
    );
  });

  it('a loaded list holding the three lines opens with the third row refused, the first two green', () => {
    const facts = factsOf([...TWO, 'r = 4']);
    const fig = replay(facts, 0);
    expect(fig.status[facts[0].id]).toBe('ok');
    expect(fig.status[facts[1].id]).toBe('ok');
    expect(String(fig.status[facts[2].id])).toBe('reserved radius ambiguous: r names no one circle of O, P (stated sizes)');
    expect(radii(fig)).toEqual({ 'circle-O': 3, 'circle-P': 5 });
  });
});

describe('#2177 — the taught next step builds', () => {
  it('two sized circles: «רדיוס מעגל P הוא r» commits; «r = 4» after it contradicts P’s 5 (honest)', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5', 'רדיוס מעגל P הוא r']);
    expect(r.refused).toBe(false);
    const r2 = await play(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5', 'רדיוס מעגל P הוא r', 'r = 4']);
    expect(r2.refused).toBe(true);
    expect(r2.note).toContain('סותר את «מעגל P ברדיוס 5»');
  });

  it('one sized circle beside an unsized one: after «רדיוס מעגל P הוא r», «r = 4» sizes P', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'מעגל P', 'רדיוס מעגל P הוא r', 'r = 4']);
    expect(r.refused).toBe(false);
    expect(radii(r.fig)).toEqual({ 'circle-O': 3, 'circle-P': 4 });
  });
});

describe('#2177 — unchanged', () => {
  it('a letter bound explicitly: «מעגל O ברדיוס r» · «מעגל P ברדיוס 5» · «r = 4» sizes O to 4', async () => {
    const r = await play(['מעגל O ברדיוס r', 'מעגל P ברדיוס 5', 'r = 4']);
    expect(r.refused).toBe(false);
    expect(radii(r.fig)).toEqual({ 'circle-O': 4, 'circle-P': 5 });
  });

  it('one circle: r is its radius (ADR-034 Am. 1) — «r = 3» on a radius-3 circle commits', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'r = 3']);
    expect(r.refused).toBe(false);
  });

  it('a letter used while only one circle existed keeps that meaning: «AB = r» then a second circle', async () => {
    const r = await play(['מעגל O ברדיוס 3', 'A על המעגל O', 'B על המעגל O', 'AB = r', 'מעגל P ברדיוס 5']);
    expect(r.refused).toBe(false);
    const A = r.fig.positions.get('A')!;
    const B = r.fig.positions.get('B')!;
    expect(Math.hypot(A.x - B.x, A.y - B.y)).toBeCloseTo(3, 6);
  });

  it('two circles, NEITHER sized: not in the ruling — «מעגל O» · «מעגל P» · «r = 4» commits as before', async () => {
    const r = await play(['מעגל O', 'מעגל P', 'r = 4']);
    expect(r.refused).toBe(false);
  });
});

describe('#2177 — reservedAmbiguity (the predicate)', () => {
  const cmds = (lines: string[]) => factsOf(lines).map((f) => f.cmd);
  const none = new Map();
  it('two sized circles: the valued letter, either spelling', () => {
    const c = cmds(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5', 'r = 4']);
    expect(reservedAmbiguity(c, 2, none)).toBe('reserved radius ambiguous: r names no one circle of O, P (stated sizes)');
    const C = [...c.slice(0, 2), { type: 'set-var', name: 'R', value: 4 } as never];
    expect(reservedAmbiguity(C, 2, none)).toBe('reserved radius ambiguous: R names no one circle of O, P (stated sizes)');
  });
  it('one circle, no letter, or an explicit binding of the spelling: null', () => {
    expect(reservedAmbiguity(cmds(['מעגל O ברדיוס 3', 'r = 4']), 1, none)).toBeNull();
    expect(reservedAmbiguity(cmds(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5', 'x = 4']), 2, none)).toBeNull();
    expect(reservedAmbiguity(cmds(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 5', 'r = 4']), 2, new Map([['r', { id: 'circle-P', center: 'P' }]]))).toBeNull();
  });
  it('the circles counted are the ones stated BEFORE the row', () => {
    expect(reservedAmbiguity(cmds(['מעגל O ברדיוס 3', 'r = 3', 'מעגל P ברדיוס 5']), 1, none)).toBeNull();
  });
});

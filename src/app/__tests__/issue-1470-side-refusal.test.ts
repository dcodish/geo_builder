/**
 * #1470 + #1487 ([ADR-549](../../../docs/06-decisions.md#adr-549)) — A STATED SIDE IS A CHECKED GIVEN AT
 * THE SUBMIT DOOR.
 *
 * Operator ruling, 2026-09-27: *"we should always reject conflicting inputs that cannot exist so we
 * should reject all cases"*. Measured before the fix through this very path: «מעגל O · E נקודה מחוץ למעגל
 * · המעגל עובר דרך E» committed every line with an amber warning, and «משולש ABC · E על AB · E מחוץ
 * למשולש ABC» committed SILENT GREEN (#1487). Now the contradicting line is refused up front — never
 * becomes a fact, the prior figure does not move — and the note names BOTH statements, in the
 * student's language, with no English word surviving.
 *
 * Model: `issue-1265-bound-boundary.test.ts` (the ADR-540 bound twin at the same door).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';

function makeDeps(locale: 'he' | 'en') {
  const calls = { notes: [] as string[], cleared: 0 };
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: locale }) as string;
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
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
    // the App's own composition (App.tsx `explainError`), minus the retry hint
    explainError: (raw, said) => humanizeError(raw, t, said),
  };
  return { deps, calls, notes: () => calls.notes.filter(Boolean) };
}

const snapshot = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return { facts: st.facts.length, positions: new Map(d.positions), clean: Object.values(d.status).every((v) => v === 'ok'), violations: d.violations };
};

/** Submit every line but the last; then the last, reporting whether the door refused it and what it said. */
async function play(lines: string[], locale: 'he' | 'en' = 'he') {
  useGeoStore.getState().clear();
  for (const l of lines.slice(0, -1)) {
    const d = makeDeps(locale);
    await runSubmit(l, d.deps);
    expect(d.calls.cleared, `«${l}» is accepted`).toBe(1);
  }
  const before = snapshot();
  const d = makeDeps(locale);
  await runSubmit(lines[lines.length - 1], d.deps);
  return { before, after: snapshot(), refused: d.calls.cleared === 0, notes: d.notes() };
}

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const HE_TAIL = '— שני הנתונים אינם יכולים להתקיים יחד באף שרטוט. בדקו את הנתונים.';
const strip = (s: string) => s.replace(/[⁦-⁩]/g, ''); // bidi isolates around labels

describe('#1470 — the operator’s sequence and its class, refused at the door with both statements named', () => {
  const CASES: [string[], string][] = [
    [['מעגל O', 'E נקודה מחוץ למעגל', 'המעגל עובר דרך E'], 'לא ייתכן: «E על המעגל O» סותר את «E מחוץ למעגל O»'],
    [['מעגל O', 'E נקודה מחוץ למעגל', 'E על המעגל'], 'לא ייתכן: «E על המעגל O» סותר את «E מחוץ למעגל O»'],
    [['מעגל O', 'E בתוך המעגל', 'E על המעגל'], 'לא ייתכן: «E על המעגל O» סותר את «E בתוך המעגל O»'],
    [['מעגל O', 'E על המעגל', 'E נקודה מחוץ למעגל'], 'לא ייתכן: «E מחוץ למעגל O» סותר את «E על המעגל O»'],
    [['מעגל O', 'E על המעגל', 'E בתוך המעגל'], 'לא ייתכן: «E בתוך המעגל O» סותר את «E על המעגל O»'],
    [['מעגל O', 'E מחוץ למעגל', 'E בתוך המעגל'], 'לא ייתכן: «E בתוך המעגל O» סותר את «E מחוץ למעגל O»'],
    [['מעגל O', 'O מחוץ למעגל'], 'לא ייתכן: «O מחוץ למעגל O» סותר את «O הוא מרכז המעגל O»'],
    [['משולש ABC', 'E על AB', 'E מחוץ למשולש ABC'], 'לא ייתכן: «E מחוץ למשולש ABC» סותר את «E על הקטע AB»'], // #1487
    [['משולש ABC', 'E מחוץ למשולש ABC', 'E על AB'], 'לא ייתכן: «E על הקטע AB» סותר את «E מחוץ למשולש ABC»'],
    [['משולש ABC', 'A בתוך המשולש ABC'], 'לא ייתכן: «A בתוך המשולש ABC» סותר את «A היא קדקוד של ABC»'],
    [['משולש ABC', 'A מחוץ למשולש ABC'], 'לא ייתכן: «A מחוץ למשולש ABC» סותר את «A היא קדקוד של ABC»'],
    [['משולש ABC', 'M אמצע AB', 'M מחוץ למשולש ABC'], 'לא ייתכן: «M מחוץ למשולש ABC» סותר את «M היא אמצע AB»'],
    [['קטע AB', 'C ו-D בצדדים שונים של AB', 'C על AB'], 'לא ייתכן: «C על הקטע AB» סותר את «C, D בצדדים שונים של AB»'],
  ];
  it.each(CASES)('%j', async (lines, message) => {
    const r = await play(lines);
    expect(r.refused, `refused up front: ${r.notes.join(' | ')}`).toBe(true);
    expect(r.notes.map(strip)).toEqual([`${message} ${HE_TAIL}`]);
    // keep-prior: no fact added, nothing moved, the figure still clean
    expect(r.after.facts).toBe(r.before.facts);
    expect(r.after.positions).toEqual(r.before.positions);
    expect(r.after.clean).toBe(true);
    expect(r.after.violations).toEqual([]);
  });

  it('English: «circle O · E outside the circle · E on the circle» is refused in English', async () => {
    const r = await play(['circle O', 'E outside the circle', 'E on the circle'], 'en');
    expect(r.refused).toBe(true);
    expect(r.notes.map(strip)).toEqual(['Impossible: «E on circle O» contradicts «E outside circle O» — no figure can satisfy both givens. Check the givens.']);
  });
});

describe('#1470 — satisfiable controls still build at the door', () => {
  it.each([
    [['מעגל O', 'E מחוץ למעגל', 'EO = 10']],
    [['מעגל O', 'E על המעגל', 'F מחוץ למעגל']],
    [['משולש ABC', 'E מחוץ למשולש ABC', 'E על המשך AB']],
    [['קטע AB', 'מעגל O', 'C ו-D בצדדים שונים של AB', 'C על מעגל O']],
    [['מעגל O', 'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B']], // the macros' external apex
    [['מעגל O', 'מנקודה A יוצאים שני משיקים למעגל O']],
  ])('%j', async (lines) => {
    const r = await play(lines);
    expect(r.refused, r.notes.join(' | ')).toBe(false);
    expect(r.after.facts).toBeGreaterThan(r.before.facts);
    expect(r.after.clean).toBe(true);
    expect(r.after.violations).toEqual([]);
  });
});

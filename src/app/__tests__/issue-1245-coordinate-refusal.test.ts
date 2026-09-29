/**
 * #1245 + #1162 ([ADR-553](../../../docs/06-decisions.md#adr-553)) — PLACING A POINT AT COORDINATES IS
 * THE ANALYTIC BUILDER'S JOB, AND 2-D SAYS SO.
 *
 * Operator, 2026-09-19: *"i tried this on the 2d tool and it drew a point. I dont want this to work in
 * 2d - it should reject and refer user to the analytics tool. the sytanx E=(-1,7) is not supported in
 * analytics - it should be E(-1,7)"*; 2026-09-21: *"Withdraw all of it."*
 *
 * Measured before the change through this very door: «E=(-1,7)», «A = (3, 4)», «הנקודה E=(-1,7)»,
 * «נקודה A ב-(0,0)», "point A at (0,0)", "A at 0,0" and «A=3,4» all COMMITTED a pinned `free-point`;
 * «E(-1,7)», «A(0,0)», «E = (−1, 7)» (Unicode minus) and «נקודה A בנקודה (0,0)» escalated to the paid
 * model. Now every spelling is refused BEFORE the model with ONE message that names the live analytic
 * Builder and teaches its spelling `E(-1,7)` — never the `=` form.
 *
 * #1162: the `analytic` register message said a coordinate tool was «מתוכנן לעתיד» — false in prod since
 * `prod/2026-09-16`. It now names the live tool too, and «כתוב שיעורי נקודות» (a prod row that escalated)
 * reaches it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { PRE_LLM, decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { classifyOutOfScope } from '@/parser';
import i18n from '@/i18n';

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

const snapshot = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return { facts: st.facts, positions: new Map(d.positions) };
};

/** Submit every line but the last (each must be accepted); then the last, reporting what the door did. */
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

const COORD_HE = i18n.t('input.scope.coordinate-point', { lng: 'he' }) as string;
const COORD_EN = i18n.t('input.scope.coordinate-point', { lng: 'en' }) as string;
const ANALYTIC_HE = i18n.t('input.scope.analytic', { lng: 'he' }) as string;

/** Every spelling of the withdrawn construct — the four the ruling names, then the class around them. */
const SPELLINGS = [
  // the ruling's table, row by row
  'E=(-1,7)',
  'הנקודה E=(-1,7)',
  'נקודה A ב-(0,0)',
  'point A at (0,0)',
  'E(-1,7)',
  // the rest of what the withdrawn rule built, and the neighbours that escalated
  'E = (-1,7)',
  'A=(3,5)',
  'A = (3, 4)',
  'A = (3.5, -2)',
  'נקודה A ב (0,0)',
  'נקודה A ב(0,0)',
  'נקודה A בנקודה (0,0)',
  'place A at (1,2)',
  'A at 0,0',
  'A = 3,4',
  'A(0,0)',
  'נקודה E(-1,7)',
  'Point A (0,0)',
  'E = (−1, 7)', // Unicode minus
  'הנקודה E נמצאת ב-(-1,7)',
  'point E is at (-1,7)',
  'A(1,4) B(1,1) C(5,1)', // a coordinate LIST — was `analytic`, now the same answer as one point
];

describe('#1245 — every coordinate spelling is refused at the door and pointed at the analytic Builder', () => {
  it.each(SPELLINGS)('%s', async (u) => {
    const r = await play([u]);
    expect(r.refused, `«${u}» must not build: ${r.notes.join(' | ')}`).toBe(true);
    expect(r.notes).toEqual([COORD_HE]);
    expect(r.after.facts).toBe(r.before.facts); // nothing committed
    expect(llmParseMock, 'answered BEFORE the model — no paid call').not.toHaveBeenCalled();
  });

  it('on an existing figure the line is refused and nothing moves (keep-prior)', async () => {
    for (const u of ['D=(1,2)', 'נקודה D ב-(1,2)', 'A=(0,0)', 'D(1,2)']) {
      const r = await play(['משולש ABC', u]);
      expect(r.refused, u).toBe(true);
      expect(r.notes, u).toEqual([COORD_HE]);
      expect(r.after.facts, u).toBe(r.before.facts);
      expect(r.after.positions, u).toEqual(r.before.positions);
    }
  });

  it('English: the refusal is in English and names the same tool', async () => {
    const r = await play(['point A at (0,0)'], 'en');
    expect(r.refused).toBe(true);
    expect(r.notes).toEqual([COORD_EN]);
  });

  it('the decision is the scope register, and the category is answered before the model', async () => {
    for (const u of SPELLINGS) expect(classifyOutOfScope(u)?.category, u).toBe('coordinate-point');
    expect(PRE_LLM.has('coordinate-point')).toBe(true);
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, 'E=(-1,7)', 'he');
    expect(v).toMatchObject({ kind: 'refuse', category: 'guided', note: { key: 'input.scope.coordinate-point' } });
  });
});

describe('#1245 — the message the operator approved', () => {
  it('is his text, verbatim', () => {
    // i18n wraps each Latin run in bidi isolates (the URL and E(-1,7) stay left-to-right inside Hebrew)
    expect(COORD_HE.replace(/[\u2066-\u2069]/g, '')).toBe('מיקום נקודה לפי שיעורים נעשה בכלי הגאומטריה האנליטית: themathbible.com/analytic-builder — שם כותבים E(-1,7). כאן תארו את הצורה עצמה — למשל «משולש ABC» או «נקודה D על AB».');
  });
  it.each([['he', COORD_HE], ['en', COORD_EN]])('%s: shows E(-1,7) literally and never the `=` spelling', (_l, msg) => {
    expect(msg).toContain('E(-1,7)');
    expect(msg).not.toMatch(/[A-Z]\s*=\s*\(/); // «E=(-1,7)» beside «E(-1,7)» differs by one character
    expect(msg).toContain('themathbible.com/analytic-builder');
  });
});

describe('controls — the neighbouring constructs still build', () => {
  it.each([['נקודה A'], ['point A'], ['AB = 4'], ['x = -4'], ['משולש ABC']])('%s', async (u) => {
    const r = await play([u]);
    expect(r.refused, `${u}: ${r.notes.join(' | ')}`).toBe(false);
  });
});

describe('#1162 — the analytic register points at the LIVE tool', () => {
  it.each(['שיעורי הנקודה E הם x=-1 y=7', 'כתוב שיעורי נקודות', 'שיפוע AB', 'y = 2x + 3'])('%s', async (u) => {
    const r = await play([u]);
    expect(r.refused).toBe(true);
    expect(r.notes).toEqual([ANALYTIC_HE]);
    expect(llmParseMock).not.toHaveBeenCalled();
  });
  it('the message names the analytic Builder and no longer calls it planned', () => {
    expect(ANALYTIC_HE).toContain('themathbible.com/analytic-builder');
    expect(ANALYTIC_HE).not.toMatch(/מתוכנן|לעתיד|בינתיים/);
  });
});

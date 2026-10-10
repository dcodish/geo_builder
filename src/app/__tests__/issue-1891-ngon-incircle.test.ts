/**
 * #1891 ([ADR-606](../../../docs/06-decisions.md#adr-606)) — A CIRCLE INSCRIBED IN A POLYGON OF FIVE OR MORE
 * SIDES IS REFUSED BEFORE THE MODEL, AND A MODEL ANSWER THAT DROPS A STATED CONSTRUCT IS NEVER COMMITTED.
 *
 * Operator, 2026-10-08: *"the issue with מעגל חסום במחומש ABCDE is also on the 2d tool. so we need to fix
 * both"*. His prod run (session yln1uwxa): the grammar did not read the line (the inscription direction test
 * knew only the 3- and 4-gon nouns), the model answered «מחומש ABCDE», and the object gate read #835's
 * `place` flag as payload, so a bare pentagon committed green with the stated circle gone. Other answers,
 * measured with a stubbed model, drew the circle through all five vertices.
 *
 * W19 ruling: until pentagon and hexagon incircles are built (#1908), the refusal is the known-limit
 * sentence with the polygon's noun filled in. The real `runSubmit`, `fetch` stubbed (rule 2: no model call).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { droppedConstructNoun, parse } from '@/parser/parse';
import i18n from '@/i18n';

let modelCalls = 0;
let canned: string[] = [];
beforeEach(() => {
  useGeoStore.getState().clear();
  modelCalls = 0;
  canned = [];
  vi.stubGlobal('fetch', async (url: string) => {
    if (String(url).endsWith('api/parse')) {
      modelCalls++;
      return new Response(JSON.stringify({ steps: canned }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('', { status: 204 });
  });
});
afterEach(() => vi.unstubAllGlobals());

function makeDeps() {
  const notes: string[] = [];
  let cleared = 0;
  const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string;
  const deps: SubmitDeps = {
    t,
    locale: 'he',
    ui: { setInputNote: (m) => { if (m) notes.push(m); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => cleared++, setBusy: () => {} },
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
  return { deps, notes, cleared: () => cleared };
}

/** Submit the setup lines (each accepted, the model never asked), then the last with `answer` canned. */
async function play(lines: string[], answer: string[] = []) {
  for (const l of lines.slice(0, -1)) {
    const d = makeDeps();
    await runSubmit(l, d.deps);
    expect(d.cleared(), `«${l}» is accepted`).toBe(1);
  }
  const before = useGeoStore.getState().facts.length;
  modelCalls = 0;
  canned = answer;
  const d = makeDeps();
  await runSubmit(lines[lines.length - 1], d.deps);
  return { added: useGeoStore.getState().facts.length - before, notes: d.notes, modelCalls };
}

const LIMIT = (noun: string) => `הכלי עדיין לא יודע לשרטט מעגל חסום ב${noun} — זו מגבלה של הכלי.`;

describe('#1891 — the n-gon incircle is refused before the model', () => {
  const CASES: [string[], string][] = [
    [['מעגל חסום במחומש ABCDE'], 'מחומש'],
    [['מעגל חסום במחומש משוכלל ABCDE'], 'מחומש'],
    [['מעגל חסום במשושה ABCDEF'], 'משושה'],
    [['circle inscribed in pentagon ABCDE'], 'מחומש'],
    [['במחומש ABCDE חסום מעגל'], 'מחומש'],
    [['מחומש ABCDE חוסם מעגל'], 'מחומש'],
    [['מעגל חסום במצולע ABCDE'], 'מחומש'],
    [['מעגל חסום ב-ABCDE'], 'מחומש'],
    [['מחומש ABCDE', 'מעגל חסום במחומש ABCDE'], 'מחומש'],
    [['מחומש ABCDE', 'מעגל חסום במחומש'], 'מחומש'],
    [['מעגל חסום במתומן ABCDEFGH'], 'מצולע עם יותר משש צלעות'],
  ];
  it.each(CASES.map(([seq, noun]) => [seq.join(' → '), seq, noun] as const))('%s', async (_, seq, noun) => {
    const r = await play([...seq], ['מחומש ABCDE']);
    expect(r.modelCalls).toBe(0);
    expect(r.added).toBe(0);
    expect(r.notes).toEqual([LIMIT(noun)]);
  });
});

/**
 * #1891, SECOND PASS ([ADR-610](../../../docs/06-decisions.md#adr-610)) — two rows below were re-based, not relaxed.
 * «מחומש ABCDE חסום במעגל» (the pentagon in a circle, the CIRCUM direction) escalated to the model when ADR-606
 * shipped, so it was locked here as "still goes to the model" and as a dropped-noun gate row. The operator then
 * ruled it BUILDS (2026-10-09, Q2: *"Build it too."*), so the line is deterministic now and the model — and with it
 * that gate — never sees it. The rows for the lines that DO still escalate («מעגל חוסם את…», the English
 * circumscribed form, the polygon-in-polygon) are untouched, and ADR-610's own locks assert what it now builds.
 * The opposite direction «מעגל חסום במחומש ABCDE» keeps every refusal below.
 */
describe('#1891 — a model answer that keeps only a bare n-gon is refused naming what it dropped', () => {
  it('the object gate reads `place` as the n-gon\'s identity, not payload', () => {
    const bare = parse('מחומש ABCDE', {});
    expect(bare.ok && bare.commands).toEqual([{ type: 'polygon', ids: ['A', 'B', 'C', 'D', 'E'], place: true }]);
    expect(droppedConstructNoun('מעגל חסום במחומש ABCDE', bare.ok ? bare.commands : [])).toEqual(['מעגל']);
  });
  it.each([
    ['מחומש ABCDE עם אלכסונים', ['מחומש ABCDE'], 'אלכסונים'],
    ['משושה ABCDEF עם אלכסונים', ['משושה ABCDEF'], 'אלכסונים'],
  ])('«%s» answered %j', async (line, answer, word) => {
    const r = await play([line], answer);
    expect(r.modelCalls).toBe(1);
    expect(r.added).toBe(0);
    expect(r.notes.join(' ')).toContain(word);
  });
});

describe('#1891 — what still works', () => {
  it.each(['מעגל חסום במשולש ABC', 'מעגל חסום בריבוע ABCD', 'מעגל חסום בטרפז ABCD', 'מעגל חסום בדלתון ABCD', 'circle inscribed in the given triangle ABC', 'מחומש ABCDE', 'מחומש משוכלל ABCDE', 'משושה ABCDEF'])(
    '«%s» builds without the model',
    async (line) => {
      const r = await play([line]);
      expect(r.modelCalls).toBe(0);
      expect(r.added).toBeGreaterThan(0);
    },
  );
  it.each(['מעגל חוסם את מחומש ABCDE', 'circle circumscribed about pentagon ABCDE', 'ריבוע DEFG חסום במחומש ABCDE'])(
    '«%s» (no circle inside a pentagon) still goes to the model',
    async (line) => {
      const r = await play([line], []);
      expect(r.modelCalls).toBe(1);
      expect(r.notes.join(' ')).not.toContain('מגבלה של הכלי');
    },
  );
});

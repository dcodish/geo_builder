/**
 * #1906 ([ADR-722](../../../docs/06-decisions.md#adr-722), [ADR-W-144](../../../docs/06w-decisions-workspace.md#adr-w-144))
 * — AN AI ANSWER THAT DROPS A SHAPE OR ROLE WORD THE STUDENT TYPED IS REFUSED, NEVER COMMITTED.
 *
 * Measured at pickup (main @ de7c221f), the model stubbed: «משולש שווה צלעת ABC» (a typo for «צלעות») went to the
 * model, the canned answer «משולש ABC» committed a scalene triangle green — and so did every row below. Operator
 * ruling 2026-10-08: *"must survive into the AI answer's lowering, or the answer is refused … The refusal reuses
 * 2-D's existing dropped-given message"*; *"The AI can still fix typos"*.
 *
 * The real `runSubmit`, `fetch` stubbed (rule 2: the model is never called — every answer below is canned).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import { CEVIAN_NOUNS_EN, CEVIAN_NOUNS_HE } from '@/parser/lexicon';
import { SHAPE_ADJ_WORDS, SHAPE_NOUN_WORDS } from '@/parser/shapePhrase';
import { KEYWORD_STEMS } from '@/parser/spanAccounting';
import { droppedPropertyWords, propertyOccurrences2, PROPERTY_VOCABULARY2 } from '@/parser/propertyWords';
import { POLYGON_NAME_ARITY } from '@/parser/parse';
import { isGeoPoint } from '@/engine';
import i18n from '@/i18n';
import { NEAR_MISS_ROWS } from '../../../shell/__tests__/fixtures/honesty-rows';

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

/** Submit the setup lines (each accepted without the model), then the last line with `answer` canned. */
async function play(lines: string[], answer: string[]) {
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

const DROPPED = (w: string) => `הבנתי רק חלקית — לא הצלחתי למקם את ${w}. נסחו את הצעד מחדש (למשל פרקו אותו לשני צעדים).`;
const isolate = (s: string) => s.replace(/[⁦-⁩]/g, '');

describe('#1906 — the reported sequence', () => {
  it('«משולש שווה צלעת ABC» answered «משולש ABC» is refused naming «שווה צלעת»; nothing is committed', async () => {
    const r = await play(['משולש שווה צלעת ABC'], ['משולש ABC']);
    expect(r.modelCalls).toBe(1);
    expect(r.added).toBe(0);
    expect(r.notes).toEqual([DROPPED('שווה צלעת')]);
  });
  it('answered with the word kept («משולש שווה צלעות ABC»), the typo is fixed and an equilateral triangle commits', async () => {
    const r = await play(['משולש שווה צלעת ABC'], ['משולש שווה צלעות ABC']);
    expect(r.added).toBeGreaterThan(0);
    expect(r.notes).toEqual([]);
    const st = useGeoStore.getState();
    const { positions, construction } = replay(st.facts, st.seed);
    const ids = construction.objects.filter(isGeoPoint).map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    const d = (p: string, q: string) => Math.hypot(positions.get(p)!.x - positions.get(q)!.x, positions.get(p)!.y - positions.get(q)!.y);
    expect(d('A', 'B')).toBeCloseTo(d('B', 'C'), 6);
    expect(d('B', 'C')).toBeCloseTo(d('C', 'A'), 6);
  });
});

/** Every 2-D row of the plan's table: the canned answer drops the word, the refusal names it as typed. */
const DROPS: [string[], string[], string][] = [
  [['מעגל חסום במשולש שווה צלעת ABC'], ['מעגל חסום במשולש ABC'], 'שווה צלעת'],
  [['משולש שווה שוקיימ ABC'], ['משולש ABC'], 'שווה שוקיימ'],
  [['משולש ישר-זויתי ABC'], ['משולש ABC'], 'ישר-זויתי'],
  [['נתון משולש שווה צלעות ABC כלשהו'], ['משולש ABC'], 'שווה צלעות'], // spelt right: ADR-595 now holds on this seam
  [['מלבנ ABCD'], ['מרובע ABCD'], 'מלבנ'],
  [['מעוינ ABCD'], ['מרובע ABCD'], 'מעוינ'],
  [['טרפז שווה שוקים ABCD'], ['טרפז ABCD'], 'שווה שוקים'],
  [['משולש ABC', 'AD גובה לצלע BC שהוא גם חוצה זווית'], ['AD חוצה זווית A'], 'גובה'],
  [['משולש ABC', 'AD גובה לצלע BC שהוא גם חוצה זווית BAC'], ['AD חוצה זווית BAC'], 'גובה'],
  [['משולש ABC', 'AD גובה וחוצה זווית'], ['AD חוצה זווית A'], 'גובה'],
  [['משולש ABC', 'AD גובה לצלע BC וחוצה את זווית A'], ['AD חוצה זווית A'], 'גובה'],
  [['משולש ABC', 'AD גובח לצלע BC'], ['AD תיכון לצלע BC'], 'גובח'],
  [['משולש ABC', 'AD תיכנ לצלע BC'], ['AD גובה לצלע BC'], 'תיכנ'],
  [['משולש ABC', 'AD חוצה זוויות A'], ['AD תיכון לצלע BC'], 'חוצה זוויות'],
  [['משולש ABC', 'מעגל חסומ במשולש ABC'], ['משולש ABC חסום במעגל'], 'חסומ'], // the circle through the vertices
  [['משולש ABC', 'משולש ABC חסומ במעגל'], ['מעגל חסום במשולש ABC'], 'חסומ'], // the circle inside
  [['equilaterl triangle ABC'], ['triangle ABC'], 'equilaterl'],
  [['isoceles triangle ABC'], ['triangle ABC'], 'isoceles'],
];

describe('#1906 — an answer that drops a word the student typed is refused, naming it', () => {
  it.each(DROPS.map(([seq, ans, w]) => [`${seq.join(' → ')} ⇐ ${ans.join(' | ')}`, seq, ans, w] as const))('%s', async (_, seq, ans, w) => {
    const r = await play([...seq], [...ans]);
    expect(r.modelCalls).toBe(1);
    expect(r.added).toBe(0);
    expect(r.notes.map(isolate)).toEqual([DROPPED(w)]);
  });
});

/** The faithful twins: the same lines, answered with the word kept (typo fixed), commit as before. */
const KEEPS: [string[], string[]][] = [
  [['מעגל חסום במשולש שווה צלעת ABC'], ['מעגל חסום במשולש שווה צלעות ABC']],
  [['משולש שווה שוקיימ ABC'], ['משולש שווה שוקיים ABC']],
  [['משולש ישר-זויתי ABC'], ['משולש ישר זווית ABC']],
  [['מלבנ ABCD'], ['מלבן ABCD']],
  [['מעוינ ABCD'], ['מעוין ABCD']],
  [['טרפז שווה שוקים ABCD'], ['טרפז שווה שוקיים ABCD']],
  [['משולש ABC', 'AD גובח לצלע BC'], ['AD גובה לצלע BC']],
  [['משולש ABC', 'AD תיכנ לצלע BC'], ['AD תיכון לצלע BC']],
  [['משולש ABC', 'מעגל חסומ במשולש ABC'], ['מעגל חסום במשולש ABC']],
  [['equilaterl triangle ABC'], ['equilateral triangle ABC']],
  [['isoceles triangle ABC'], ['isosceles triangle ABC']],
];

describe('#1906 — an answer that keeps the word commits, typo fixed', () => {
  it.each(KEEPS.map(([seq, ans]) => [`${seq.join(' → ')} ⇐ ${ans.join(' | ')}`, seq, ans] as const))('%s', async (_, seq, ans) => {
    const r = await play([...seq], [...ans]);
    expect(r.modelCalls).toBe(1);
    expect(r.notes).toEqual([]);
    expect(r.added).toBeGreaterThan(0);
  });
});

describe('#1906 — the bisect verb gate keeps its own naming', () => {
  it('W21: «AD גובה לצלע BC שהוא גם חוצה זווית» answered with the altitude alone names the bisector once, as today', async () => {
    const r = await play(['משולש ABC', 'AD גובה לצלע BC שהוא גם חוצה זווית'], ['AD גובה לצלע BC']);
    expect(r.added).toBe(0);
    expect(r.notes.map(isolate)).toEqual([DROPPED('חוצה/bisect')]);
  });
});

describe('#1906 — the member, directly', () => {
  it('"perpendicular bisector" is not an angle bisector', () => {
    expect(droppedPropertyWords('the perpendicular bisector of AB', [{ type: 'midpoint', id: 'M', a: 'A', b: 'B' }], {})).toEqual([]);
  });
  it('a shape word whose polygon is already drawn restates it (ADR-595\'s reference exemption)', () => {
    expect(droppedPropertyWords('במשולש שווה צלעות ABC', [], { points: ['A', 'B', 'C'], polygons: [['A', 'B', 'C']] })).toEqual([]);
  });
  it('a role word is never exempt: each occurrence needs its own evidence', () => {
    expect(droppedPropertyWords('AD גובה וגם תיכון', [{ type: 'midpoint', id: 'D', a: 'B', b: 'C' }], { points: ['A', 'B', 'C'] })).toEqual(['גובה']);
  });
});

describe('#1906 — the shared rows, through 2-D\'s vocabulary and lexicon', () => {
  it.each(NEAR_MISS_ROWS.map((r) => [r.line, r.near] as const))('«%s» → near misses %j', (line, near) => {
    expect(propertyOccurrences2(line).filter((o) => !o.exact).map((o) => o.text)).toEqual(near);
  });
});

describe('#1906 — the vocabulary is the grammar\'s own', () => {
  const ATOM: Record<string, RegExp> = {
    right: new RegExp(SHAPE_ADJ_WORDS.right, 'i'),
    isosceles: new RegExp(SHAPE_ADJ_WORDS.isosceles, 'i'),
    equilateral: new RegExp(SHAPE_ADJ_WORDS.equilateral, 'i'),
    cevian: new RegExp(`${CEVIAN_NOUNS_HE}|${CEVIAN_NOUNS_EN}`, 'i'),
  };
  const stem = (w: string) => KEYWORD_STEMS.some((s) => w.toLowerCase().startsWith(s) || w.startsWith(s.replace(/[ךםןףץ]$/, (c) => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' })[c]!)));
  it.each(PROPERTY_VOCABULARY2.flatMap((ph) => {
    const combos = ph.slots.reduce<string[]>((acc, slot) => acc.flatMap((a) => slot.map((w) => (a ? `${a} ${w}` : w))), ['']);
    return combos.map((c) => [c, ph.props[0]] as const);
  }))('«%s» is read by its atom', (phrase, p) => {
    if (p.kind === 'adj') expect(phrase).toMatch(ATOM[p.adj]);
    else if (p.kind === 'noun') expect(phrase).toMatch(new RegExp(`^(?:${SHAPE_NOUN_WORDS[p.noun]})$`, 'i'));
    else if (p.kind === 'ring') expect(phrase === 'משולש' || phrase === 'triangle' || phrase === 'מרובע' || POLYGON_NAME_ARITY[phrase] === p.n).toBe(true);
    else if (p.kind === 'altitude' || p.kind === 'median' || p.kind === 'angle-bisector' || p.kind === 'bisect') {
      // the cevian atom, or (a plural the atom does not read: «חוצי זוויות») words the span accountant knows
      expect(ATOM.cevian.test(phrase) || phrase.split(' ').every((w) => stem(w) || ATOM.cevian.test(`${w} זווית`))).toBe(true);
    } else expect(phrase.split(' ').every(stem), 'the span accountant knows the word').toBe(true); // regular, direction
  });
});

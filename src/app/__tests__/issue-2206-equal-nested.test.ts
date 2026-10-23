/**
 * #2206 ([ADR-713](../../../docs/06-decisions.md#adr-713)) — two circles of equal radius stated as NESTED (contained,
 * internally tangent, concentric) are refused with #2200's sentence, whether the equality is in the words or in the
 * stated values, in whichever order the lines come.
 *
 * Measured at c43e9fbc (#2200's tip) through `decideDeterministic2D` → the store → `replay`, model mocked:
 *   W  «שני מעגלים משיקים מבפנים ברדיוסים שווים», its English twin, «המעגלים O ו-P משיקים מבפנים ברדיוסים שווים»,
 *      «מעגל P משיק למעגל O מבפנים ברדיוסים שווים», «שני מעגלים בעלי מרכז משותף O ברדיוסים שווים», "two concentric
 *      circles with equal radii" → escalate (ADR-455 D2's `'stop'`; ADR-679's word gate for the concentric pair);
 *   V  «מעגל O ברדיוס 3» · «מעגל P ברדיוס 3» · «מעגל P מוכל בתוך מעגל O» → commit RED (`figure.v.circleContained`);
 *      the concentric pair with both radii 3 → commit RED (radius order); a ratio k = 1 on another line → RED;
 *      the internal tangency over equal stated radii → refused (ADR-692) in the generic restated-size sentence.
 * Operator ruling 2026-10-16 on #2206 (`d2206-accept`, A): «מעגל O ברדיוס 3 / מעגל P ברדיוס 3 / מעגל P מוכל בתוך מעגל
 * O is refused with #2200's sentence» and «Equal radii with internal tangency or concentric: refused with #2200's
 * sentence».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import i18n from '@/i18n';
import { humanizeError, type Translate } from '@/i18n/humanizeError';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { otherUtteranceForError } from '@/app/errorSubject';
import { replay, useGeoStore } from '@/store/geoStore';
import { factsOf } from '@/__tests__/scenario-pipeline';
import { driveThroughGate } from '@/__tests__/submit-gate';
import { stripFormatControls } from '../../../shell/bidi';

const he: Translate = (k, o) => i18n.t(k, { ...o, lng: 'he' }) as string;
const en: Translate = (k, o) => i18n.t(k, { ...o, lng: 'en' }) as string;
const lang = (line: string): 'he' | 'en' => (/[א-ת]/.test(line) ? 'he' : 'en');

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** Submit each line through the real decision; a commit is executed into the store. Returns each verdict's text. */
async function submit(lines: string[]) {
  useGeoStore.getState().clear();
  const out: { kind: string; text: string | null; key?: string }[] = [];
  for (const line of lines) {
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    const v = await decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: f.construction, positions: f.positions } }, line, lang(line));
    if (v.kind === 'commit') {
      const group = `g${st.facts.length}`;
      for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
      out.push({ kind: 'commit', text: null });
      continue;
    }
    const t = lang(line) === 'he' ? he : en;
    if (v.kind === 'refuse' && v.note && 'key' in v.note) out.push({ kind: 'refuse', key: v.note.key, text: stripFormatControls(t(v.note.key, v.note.params)) });
    else if (v.kind === 'refuse' && v.note && 'explain' in v.note)
      out.push({ kind: 'refuse', text: stripFormatControls(humanizeError(v.note.explain, t, line, otherUtteranceForError(st.facts, v.note.explain))) });
    else out.push({ kind: v.kind, text: null });
  }
  return out;
}

const REASON = {
  contained: 'שני מעגלים שרדיוסיהם שווים אינם יכולים להיות מוכלים זה בזה, כי מעגל שמוכל במעגל אחר קטן ממנו',
  'int-tangent': 'שני מעגלים שרדיוסיהם שווים אינם יכולים להיות משיקים מבפנים, כי שני מעגלים כאלה הם אותו מעגל',
  concentric: 'שני מעגלים שרדיוסיהם שווים ומרכזם משותף הם אותו מעגל',
} as const;
type Rel = keyof typeof REASON;
const contradicts = (line: string, other: string, rel: Rel) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד. הסיבה: ${REASON[rel]}.`;

describe('#2206 words — an equal pair stated internally tangent or concentric is refused from the words', () => {
  const ROWS: [string[], string, Rel][] = [
    [[], 'שני מעגלים משיקים מבפנים ברדיוסים שווים', 'int-tangent'], // W1
    [[], 'two internally tangent circles with equal radii', 'int-tangent'], // W2
    [['מעגל O', 'מעגל P'], 'המעגלים O ו-P משיקים מבפנים ברדיוסים שווים', 'int-tangent'], // W3
    [['מעגל O', 'מעגל P'], 'מעגל P משיק למעגל O מבפנים ברדיוסים שווים', 'int-tangent'], // W6 (#2208's spelling)
    [[], 'שני מעגלים משיקים מבפנים ששטחם שווה', 'int-tangent'],
    [[], 'שני מעגלים בעלי מרכז משותף O ברדיוסים שווים', 'concentric'], // W4
    [[], 'שני מעגלים קונצנטריים ברדיוסים שווים', 'concentric'],
    [[], 'two concentric circles with equal radii', 'concentric'],
    [[], 'שני מעגלים מוכלים ברדיוסים שווים', 'contained'], // W5 (#2200)
  ];
  for (const [prefix, line, rel] of ROWS) {
    it(`${prefix.length ? `[${prefix.join(' · ')}] ` : ''}«${line}» → refused (${rel}), nothing added, the model never asked`, async () => {
      const out = await submit([...prefix, line]);
      expect(out.slice(0, -1).map((o) => o.kind)).toEqual(prefix.map(() => 'commit'));
      const last = out[out.length - 1];
      expect(last.kind).toBe('refuse');
      expect(last.key).toBe(`input.equalCirclesNested.${rel}`);
      // #2202 (ruling d1): a Hebrew message quotes the line in «…»; an English line gets the English message, whose
      // quotes are not ruled and stay "…"
      const quoted = /[א-ת]/.test(line) ? `«${line}»: ` : `"${line}": `;
      expect(last.text!.startsWith(quoted), 'the message quotes the line').toBe(true);
      expect(useGeoStore.getState().facts.filter((f) => f.utterance === line)).toEqual([]);
      expect(llmParseMock).not.toHaveBeenCalled();
    });
  }

  it('the two new sentences, word for word, in Hebrew and English', () => {
    expect(stripFormatControls(he('input.equalCirclesNested.int-tangent', { detail: 'X' }))).toBe(
      '«X»: שני מעגלים שרדיוסיהם שווים אינם יכולים להיות משיקים מבפנים, כי שני מעגלים כאלה הם אותו מעגל. כתבו רק אחד מהשניים: «משיקים מבפנים» או «ברדיוסים שווים».',
    );
    expect(stripFormatControls(he('input.equalCirclesNested.concentric', { detail: 'X' }))).toBe(
      '«X»: שני מעגלים שרדיוסיהם שווים ומרכזם משותף הם אותו מעגל. כתבו רק אחד מהשניים: «בעלי מרכז משותף» או «ברדיוסים שווים».',
    );
    expect(en('input.equalCirclesNested.int-tangent', { detail: 'X' })).toContain('cannot be internally tangent');
    expect(en('input.equalCirclesNested.concentric', { detail: 'X' })).toContain('a common centre are the same circle');
  });

  it('each taught next step builds', () => {
    for (const line of ['שני מעגלים משיקים מבפנים', 'שני מעגלים בעלי מרכז משותף O', 'שני מעגלים ברדיוסים שווים', 'two internally tangent circles', 'two concentric circles']) {
      useGeoStore.getState().clear();
      const { facts, refused } = driveThroughGate([line]);
      expect(refused, line).toEqual([]);
      const fig = replay(facts, 0);
      expect(fig.lastError, line).toBeNull();
      expect(fig.violations, line).toEqual([]);
    }
  });
});

describe('#2206 values — equal stated radii nested are refused naming both statements, in either order', () => {
  const C = 'מעגל P מוכל בתוך מעגל O';
  const T = 'המעגלים O ו-P משיקים מבפנים';
  const ROWS: [string[], string, string, Rel][] = [
    // [lines before (all commit), the refused line, the line it names, relation]
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3'], C, 'מעגל P ברדיוס 3', 'contained'], // V1, the report
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3'], 'מעגל P מוכל במעגל O', 'מעגל P ברדיוס 3', 'contained'], // V2
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3'], 'שני המעגלים מוכלים', 'מעגל P ברדיוס 3', 'contained'],
    [['מעגל O', 'מעגל P', 'מעגל P מוכל במעגל O', 'רדיוס מעגל O הוא 3'], 'רדיוס מעגל P הוא 3', 'מעגל P מוכל במעגל O', 'contained'], // nesting first
    [['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3'], T, 'מעגל P ברדיוס 3', 'int-tangent'], // V3
    [['מעגל O', 'מעגל P', 'רדיוס מעגל O הוא 3', 'רדיוס מעגל P הוא 3'], T, 'רדיוס מעגל P הוא 3', 'int-tangent'], // V5
    [['מעגל O', 'מעגל P', T, 'רדיוס מעגל O הוא 3'], 'רדיוס מעגל P הוא 3', T, 'int-tangent'], // V6, the other order
    [['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 3'], 'רדיוס מעגל פנימי הוא 3', 'שני מעגלים בעלי מרכז משותף O', 'concentric'],
    // the equality stated as its own line (#2149's «רדיוסי המעגלים O ו-P שווים»), before or after the nesting
    [['מעגל O', 'מעגל P', 'מעגל P מוכל במעגל O'], 'רדיוסי המעגלים O ו-P שווים', 'מעגל P מוכל במעגל O', 'contained'],
    [['מעגל O', 'מעגל P', 'רדיוסי המעגלים O ו-P שווים'], 'מעגל P מוכל במעגל O', 'רדיוסי המעגלים O ו-P שווים', 'contained'],
    [['מעגל O', 'מעגל P', T], 'רדיוסי המעגלים O ו-P שווים', T, 'int-tangent'],
    [['מעגל O', 'מעגל P', 'רדיוסי המעגלים O ו-P שווים'], T, 'רדיוסי המעגלים O ו-P שווים', 'int-tangent'],
  ];
  it.each(ROWS)('%j · «%s» → refused naming «%s» (%s)', async (before, line, other, rel) => {
    const out = await submit([...before, line]);
    expect(out.slice(0, -1).map((o) => o.kind), 'the earlier lines build').toEqual(before.map(() => 'commit'));
    expect(out[out.length - 1]).toEqual({ kind: 'refuse', text: contradicts(line, other, rel) });
    // nothing added; the earlier lines stay green
    const st = useGeoStore.getState();
    expect(st.facts.filter((f) => f.utterance === line)).toEqual([]);
    const fig = replay(st.facts, st.seed);
    expect(fig.lastError).toBeNull();
    for (const f of st.facts) expect(fig.status[f.id], f.utterance).toBe('ok');
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('English: the reason in English, the earlier line quoted as typed', async () => {
    const out = await submit(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'circle P is contained in circle O']);
    expect(out[2].kind).toBe('refuse');
    expect(out[2].text).toBe(
      "Can't do that: «circle P is contained in circle O» contradicts «מעגל P ברדיוס 3» — they can't both hold. The reason: two circles with equal radii cannot be contained one in the other, because a circle inside another circle is smaller than it.",
    );
  });

  it('a loaded list holding the report opens with the third row ✗ and the same sentence', () => {
    const lines = ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', C];
    const facts = factsOf(lines);
    const fig = replay(facts, 0);
    expect(fig.status[facts[0].id]).toBe('ok');
    expect(fig.status[facts[1].id]).toBe('ok');
    const third = facts.filter((f) => f.utterance === C);
    expect(third.length).toBeGreaterThan(0);
    const raw = fig.status[third[0].id] as string;
    expect(typeof raw).toBe('string');
    expect(stripFormatControls(humanizeError(raw, he, C, otherUtteranceForError(facts, raw)))).toBe(contradicts(C, 'מעגל P ברדיוס 3', 'contained'));
  });

  it('controls: unequal radii nested, and equal radii apart, still build', async () => {
    for (const lines of [
      ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2', T],
      ['מעגל O ברדיוס 5', 'מעגל P ברדיוס 3', 'מעגל P מוכל במעגל O'],
      ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'המעגלים O ו-P משיקים'],
      ['מעגל O ברדיוס 3', 'מעגל P ברדיוס 3', 'שני המעגלים זרים'],
      ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 3', 'רדיוס מעגל פנימי הוא 2'],
    ]) {
      const out = await submit(lines);
      expect(out.map((o) => o.kind), lines.join(' · ')).toEqual(lines.map(() => 'commit'));
    }
    for (const line of ['שני מעגלים משיקים ברדיוסים שווים', 'שני מעגלים זרים ברדיוסים שווים']) {
      const out = await submit([line]);
      expect(out[0].kind, line).toBe('commit');
    }
  });
});

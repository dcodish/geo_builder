/**
 * #1906 ([ADR-3D-364](../../docs/06b-decisions-3d.md#adr-3d-364), [ADR-W-144](../../docs/06w-decisions-workspace.md#adr-w-144))
 * — a model answer that drops a shape or role word the student typed is refused (`dropped-given`), 3-D edition.
 *
 * Measured at pickup (main @ de7c221f), every student line below unread by the grammar (`not-understood`, so it
 * goes to the model) and every canned answer RECORDED through `decideSteps3`: «משולש שווה צלעת ABC» answered
 * «משולש ABC» drew a scalene triangle; «AD גובה לצלע BC שהוא גם חוצה זווית» answered «AD גובה לצלע BC» drew the
 * altitude alone. Operator ruling 2026-10-08: *"must survive into the AI answer's lowering, or the answer is
 * refused"*, in 2-D and 3-D, reusing the dropped-given message 3-D already shows on this lane.
 *
 * No model is called (rule 2): the answers are canned and go through the real model-lane decision.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { decideSteps3, type Fact3 } from '../store/store3';
import { errorText3 } from '../i18n/errorText3';
import he from '../i18n/locales/he.json';
import { parse3, CEVIAN_NOUNS3_EN, CEVIAN_NOUNS3_HE } from '../parser/parse3';
import { SHAPE_ADJ_WORDS3 } from '../lexicon/shapePhrase3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { droppedPropertyWords3, propertyOccurrences3, PROPERTY_VOCABULARY3 } from '../parser/propertyWords3';
import type { Command3 } from '../engine/types';
import { NEAR_MISS_ROWS } from '../../shell/__tests__/fixtures/honesty-rows';

type St = { facts: Fact3[]; seed: number };
const EMPTY: St = { facts: [], seed: 0 };

/** The setup lines record deterministically; the last is unread by the grammar and answered with `answer`. */
function play(lines: string[], answer: string[]) {
  let st: St = EMPTY;
  for (const l of lines.slice(0, -1)) {
    const v = decideDeterministic3(st, l);
    expect(v.kind, `«${l}» records`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  const last = lines[lines.length - 1];
  expect(decideDeterministic3(st, last).kind, `«${last}» goes to the model`).toBe('not-understood');
  return decideSteps3(st, last, answer);
}

const tHe = (k: string, o?: Record<string, unknown>): string => {
  const raw = k.split('.').reduce((acc: unknown, p) => (acc as Record<string, unknown> | undefined)?.[p], he) as string;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, n) => String(o?.[n] ?? ''));
};

describe('#1906 — the reported sequence, 3-D', () => {
  it('«משולש שווה צלעת ABC» answered «משולש ABC» is refused naming «שווה צלעת»', () => {
    const v = play(['משולש שווה צלעת ABC'], ['משולש ABC']);
    expect(v).toEqual({ kind: 'refused', error: { code: 'dropped-given', items: 'שווה צלעת' } });
    if (v.kind === 'refused') {
      expect(errorText3(tHe, v.error)).toBe('המשפט לא נוסף לציור, כי לא הצלחנו לצייר: שווה צלעת. נסו לפצל את המשפט לנתונים קצרים יותר או לנסח מחדש');
    }
  });
});

describe('#1906 — an answer that drops a word the student typed is refused, naming it as typed', () => {
  it.each([
    [['משולש שווה שוקיימ ABC'], ['משולש ABC'], 'שווה שוקיימ'],
    [['מלבנ ABCD'], ['מרובע ABCD'], 'מלבנ'],
    [['מעוינ ABCD'], ['מרובע ABCD'], 'מעוינ'],
    [['טרפז שווה שוקים ABCD'], ['טרפז ABCD'], 'שווה שוקים'],
    [['משולש ABC', 'AD גובה לצלע BC שהוא גם חוצה זווית'], ['AD גובה לצלע BC'], 'חוצה זווית'],
    [['משולש ABC', 'AD גובה לצלע BC שהוא גם חוצה זווית'], ['AD חוצה זווית BAC'], 'גובה'],
    [['משולש ABC', 'AD גובח לצלע BC'], ['AD תיכון לצלע BC'], 'גובח'],
    [['משולש ABC', 'AD תיכנ לצלע BC'], ['AD גובה לצלע BC'], 'תיכנ'],
    [['equilaterl triangle ABC'], ['triangle ABC'], 'equilaterl'],
    [['isoceles triangle ABC'], ['triangle ABC'], 'isoceles'],
  ] as const)('%j ⇐ %j → «%s»', (seq, ans, items) => {
    expect(play([...seq], [...ans])).toEqual({ kind: 'refused', error: { code: 'dropped-given', items } });
  });

  it('the older gates keep their own naming: «משולש ישר-זויתי ABC» answered «משולש ABC» names «ישר-זוית», as today', () => {
    expect(play(['משולש ישר-זויתי ABC'], ['משולש ABC'])).toEqual({ kind: 'refused', error: { code: 'dropped-given', items: 'ישר-זוית' } });
  });
  it('a flipped circle: «משולש ABC חסום במעגל» for an inscribed circle names the direction word', () => {
    expect(droppedPropertyWords3('מעגל חסומ במשולש ABC', parse3('משולש ABC חסום במעגל').ok ? (parse3('משולש ABC חסום במעגל') as { commands: Command3[] }).commands : [])).toEqual(['חסומ']);
    expect(droppedPropertyWords3('משולש ABC חסומ במעגל', (parse3('מעגל חסום במשולש ABC') as { commands: Command3[] }).commands)).toEqual(['חסומ']);
  });
});

describe('#1906 — an answer that keeps the word records, typo fixed', () => {
  it.each([
    [['משולש שווה צלעת ABC'], ['משולש שווה צלעות ABC']],
    [['משולש שווה שוקיימ ABC'], ['משולש שווה שוקיים ABC']],
    [['מלבנ ABCD'], ['מלבן ABCD']],
    [['מעוינ ABCD'], ['מעוין ABCD']],
    [['טרפז שווה שוקים ABCD'], ['טרפז שווה שוקיים ABCD']],
    [['משולש ABC', 'AD גובח לצלע BC'], ['AD גובה לצלע BC']],
    [['משולש ABC', 'AD תיכנ לצלע BC'], ['AD תיכון לצלע BC']],
    [['equilaterl triangle ABC'], ['equilateral triangle ABC']],
    [['isoceles triangle ABC'], ['isosceles triangle ABC']],
  ] as const)('%j ⇐ %j', (seq, ans) => {
    expect(play([...seq], [...ans]).kind).toBe('record');
  });
  it('the faithful circles record: the incircle for «מעגל חסומ», the circumcircle for «… חסומ במעגל»', () => {
    expect(droppedPropertyWords3('מעגל חסומ במשולש ABC', (parse3('מעגל חסום במשולש ABC') as { commands: Command3[] }).commands)).toEqual([]);
    expect(droppedPropertyWords3('משולש ABC חסומ במעגל', (parse3('משולש ABC חסום במעגל') as { commands: Command3[] }).commands)).toEqual([]);
  });
});

describe('#1906 — the shared rows, through 3-D\'s vocabulary and lexicon', () => {
  it.each(NEAR_MISS_ROWS.map((r) => [r.line, r.near] as const))('«%s» → near misses %j', (line, near) => {
    expect(propertyOccurrences3(line).filter((o) => !o.exact).map((o) => o.text)).toEqual(near);
  });
});

describe('#1906 — the vocabulary is the grammar\'s own', () => {
  const adj = new RegExp(Object.values(SHAPE_ADJ_WORDS3).join('|') + '|משוכלל|regular', 'i');
  const cevian = new RegExp(`${CEVIAN_NOUNS3_HE}|${CEVIAN_NOUNS3_EN}`, 'i');
  it.each(PROPERTY_VOCABULARY3.flatMap((ph) => {
    const combos = ph.slots.reduce<string[]>((acc, slot) => acc.flatMap((a) => slot.map((w) => (a ? `${a} ${w}` : w))), ['']);
    return combos.map((c) => [c, ph.props[0]] as const);
  }))('«%s» (%s) is read by its atom', (phrase, p) => {
    if (p === 'shape') {
      // an adjective by `SHAPE_ADJ_WORDS3`, a noun by the shape-phrase reader the gates use
      const asNoun = parse3(`${phrase} ABCD`);
      expect(adj.test(phrase) || adj.test(phrase + ' triangle') || (asNoun.ok && asNoun.commands.some((c) => c.type === 'quad-shape'))).toBe(true);
    } else if (p === 'direction') expect(phrase).toMatch(/חסום|חוסם|חוסמת|inscrib|circumscrib/);
    else expect(cevian.test(phrase) || /חוצי|זוויות|angle bisector/.test(phrase)).toBe(true);
  });
});

/**
 * The FALSE-REFUSAL NET: every faithful lowering we have, standing in for the answer, must keep every word.
 * Each fixture fact against its prior facts, each catalog example (both locales) on an empty figure, and the
 * recorded model answers. A flag here is a working answer the member would refuse.
 */
describe('#1906 — the 3-D member refuses no faithful lowering', () => {
  it('every fact of every fixture, as an answer to its own line', () => {
    const DIR = join(__dirname, '..', '..', 'fixtures3');
    let checked = 0;
    let withWord = 0;
    const flagged: string[] = [];
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.geo3.json'))) {
      const saved = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as { facts: { utterance: string; cmds: Command3[] }[] };
      let circle = false;
      for (const f of saved.facts) {
        // a shape REFERENCE («המשולש ישר זווית», #2235) is judged on the ring it resolves to, which the lane expands first
        if (f.cmds.some((c) => c.type === 'shape-ref3')) continue;
        checked++;
        if (propertyOccurrences3(f.utterance).length) withWord++;
        const lost = droppedPropertyWords3(f.utterance, f.cmds, circle);
        if (lost.length) flagged.push(`[${file}] «${f.utterance}» → ${lost.join(', ')}`);
        if (f.cmds.some((c) => c.type === 'circle3')) circle = true;
      }
    }
    console.info(`#1906 3-D fixture net: ${checked} facts (${withWord} with a property word), ${flagged.length} flagged`);
    expect(flagged).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(190);
    expect(withWord).toBeGreaterThanOrEqual(20);
  });

  it('every catalog example, both locales', () => {
    let checked = 0;
    const flagged: string[] = [];
    for (const e of COMMAND_CATALOG_3D.filter((x) => x.lane !== 'rewrite')) {
      for (const line of [e.he, e.en]) {
        const r = parse3(line);
        if (!r.ok) continue;
        checked++;
        const lost = droppedPropertyWords3(line, r.commands);
        if (lost.length) flagged.push(`«${line}» → ${lost.join(', ')}`);
      }
    }
    console.info(`#1906 3-D catalog net: ${checked} examples, ${flagged.length} flagged`);
    expect(flagged).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(400);
  });

  it('the recorded model answers record as they did', () => {
    const { answers } = JSON.parse(readFileSync(join(__dirname, 'recorded-ai-answers-1906.json'), 'utf8')) as { answers: { utterance: string; steps: string[] }[] };
    let checked = 0;
    const flagged: string[] = [];
    for (const a of answers) {
      const cmds: Command3[] = [];
      let ok = true;
      for (const s of a.steps) {
        const r = parse3(s);
        if (!r.ok) { ok = false; break; }
        cmds.push(...r.commands);
      }
      if (!ok) continue;
      checked++;
      const lost = droppedPropertyWords3(a.utterance, cmds);
      if (lost.length) flagged.push(`«${a.utterance}» → ${lost.join(', ')}`);
    }
    console.info(`#1906 3-D recorded answers: ${checked} checked, ${flagged.length} flagged`);
    // the one true catch: a rectangle base answered as a parallelogram (the older base-noun gate refuses it too)
    expect(flagged).toEqual(['«מנסרה שבסיסה מלבן» → מלבן']);
    expect(checked).toBeGreaterThanOrEqual(15);
  });
});

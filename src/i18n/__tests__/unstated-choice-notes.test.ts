/**
 * #973 ([ADR-502](../../../docs/06-decisions.md#adr-502)) — every unstated-choice note has a message in
 * both locales, and the sentence it builds is the one a student can act on.
 *
 * The same discipline as `values-panel-notes.test.ts` (#882): the KIND list is a runtime export the text
 * builder switches over, so a new row of the table cannot ship without its Hebrew and English. The second
 * half asserts the built sentences carry the drawn pair, a canonical pinning sentence that PARSES (measured
 * through the real parser, not assumed), and the cycle button's own label.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNSTATED_CHOICE_KINDS, unstatedChoices } from '@/engine/shapeVariants';
import { unstatedChoiceText } from '@/ui/unstatedChoice';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import { replay } from '@/replay/core';
import type { Fact } from '@/replay/core';

const LOCALES = join(__dirname, '..', 'locales');
const load = (lang: string): Record<string, Record<string, string>> =>
  JSON.parse(readFileSync(join(LOCALES, `${lang}.json`), 'utf8').replace(/^﻿/, ''));
const he = load('he');
const en = load('en');
const KEY_OF: Record<string, string> = { 'equal-pair': 'unstatedEqualPair', 'parallel-pair': 'unstatedParallelPair', 'free-endpoint': 'unstatedFreeEndpoint' };
const TEMPLATES = ['unstatedTitle', 'stateIsosceles', 'stateKite', 'stateOnSide', 'stateParallel', 'drawnParallel'];

/** A minimal `t` over one bundle: `steps.x` / `actions.x`, with {{param}} interpolation. */
const tOf = (bundle: Record<string, Record<string, string>>) => (key: string, opts: Record<string, string> = {}): string => {
  const [ns, k] = key.split('.');
  const tpl = bundle[ns]?.[k];
  if (!tpl) throw new Error(`missing ${key}`);
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, name) => opts[name] ?? `{{${name}}}`);
};

function factsFrom(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${gi}.${facts.length}`, utterance: u, group: `g${gi}`, cmd, enabled: true });
  }
  return facts;
}
/** The sentence quoted between « » after «למשל» / «e.g.» — the pinning form the note tells the student to type. */
const quoted = (text: string): string => /«([^»]+)»/.exec(text)![1];

describe('#973 — every unstated-choice kind has a message in both locales', () => {
  it('the kind list is not empty', () => {
    expect(UNSTATED_CHOICE_KINDS.length).toBeGreaterThanOrEqual(3);
  });
  it.each([...UNSTATED_CHOICE_KINDS])('«%s» — Hebrew and English', (kind) => {
    const key = KEY_OF[kind];
    expect(key, `no locale key mapped for ${kind}`).toBeTruthy();
    expect(he.steps?.[key], `steps.${key} missing from he.json`).toMatch(/[֐-׿]/);
    expect(en.steps?.[key], `steps.${key} missing from en.json`).toBeTruthy();
    expect(en.steps?.[key]).not.toMatch(/^steps\./);
  });
  it.each(TEMPLATES)('template «%s» in both locales', (key) => {
    expect(he.steps?.[key], `he steps.${key}`).toBeTruthy();
    expect(en.steps?.[key], `en steps.${key}`).toBeTruthy();
  });
});

describe('#973 — the built sentence names the drawn choice and a pinning sentence that PARSES', () => {
  const rows: [string, string[], string, string][] = [
    ['isosceles', ['משולש שווה שוקיים ABC'], 'AB = AC', 'AB = AC'],
    ['kite', ['דלתון ABCD'], 'AB = AD', 'AB = AD'],
    ['midsegment', ['משולש ABC', 'קטע אמצעים DE במשולש ABC'], 'E על AC', 'E on AC'],
    ['isosceles trapezoid', ['טרפז שווה שוקיים ABCD'], 'AB ∥ DC', 'AB ∥ DC'],
  ];
  for (const [name, steps, drawn, drawnEn] of rows) {
    it(`${name}: Hebrew note carries «${drawn}», the button label, and a sentence that pins the choice`, () => {
      const facts = factsFrom(steps);
      const [choice] = unstatedChoices(facts);
      const text = unstatedChoiceText(choice, tOf(he));
      expect(text).toContain(drawn);
      if (choice.kind !== 'parallel-pair') expect(text).toContain(he.actions.another);
      // the quoted sentence, typed as the next line, removes the note (the promise the note makes)
      const pin = quoted(text);
      const after = factsFrom([...steps, pin]);
      expect(unstatedChoices(after), `«${pin}» should pin the choice`).toEqual([]);
    });
    it(`${name}: the English note builds too`, () => {
      const [choice] = unstatedChoices(factsFrom(steps));
      const text = unstatedChoiceText(choice, tOf(en));
      expect(text).toContain(drawnEn);
      expect(text).not.toMatch(/\{\{/); // every placeholder filled
    });
  }
});

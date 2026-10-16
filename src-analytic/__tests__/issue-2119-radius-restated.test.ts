/**
 * #2119 (analytic arm, [ADR-684](../../docs/06-decisions.md#adr-684)) — a second, different radius for a circle whose
 * radius a line already stated is refused in 2-D's ruled sentence, naming that line (operator ruling 2026-10-15: "in
 * 2-D's wording, in every builder").
 *
 * Measured on b0ef3240 (the plan) and again on the item-1 tip through `decideSubmit` + `errorText`: both spellings were
 * refused `conflicting-restatement` «המשפט לא נוסף — הוא סותר את מה שכבר נקבע: "מעגל O ברדיוס 4"» — not 2-D's frame.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';

const he = analyticI18n.getFixedT('he') as unknown as Parameters<typeof errorText>[1];
const en = analyticI18n.getFixedT('en') as unknown as Parameters<typeof errorText>[1];
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

function last(lines: string[]) {
  const recorded: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, recorded, 0);
    expect(v.kind, `${line} is recorded`).toBe('record');
    recorded.push(line);
  }
  return decideSubmit(lines[lines.length - 1], recorded, 0);
}
const said = (lines: string[], t = he) => {
  const v = last(lines);
  expect(v.kind, lines.join(' · ')).toBe('refused');
  return plain(errorText((v as { error: InputError }).error, t));
};
const contradicts = (line: string, other: string) => `לא ניתן: «${line}» סותר את «${other}» — אי אפשר לקיים את שניהם יחד.`;

describe('#2119 — analytic refuses a second radius in 2-D\'s sentence', () => {
  it.each([
    [['מעגל O ברדיוס 3', 'מעגל O ברדיוס 4'], contradicts('מעגל O ברדיוס 4', 'מעגל O ברדיוס 3')], // the operator's card
    [['מעגל O ברדיוס 5', 'רדיוס המעגל O הוא 3'], contradicts('רדיוס המעגל O הוא 3', 'מעגל O ברדיוס 5')],
  ])('%j', (lines, sentence) => {
    expect(said(lines as string[])).toBe(sentence);
  });

  it('English', () => {
    expect(said(['מעגל O ברדיוס 3', 'מעגל O ברדיוס 4'], en)).toBe("Can't do that: «מעגל O ברדיוס 4» contradicts «מעגל O ברדיוס 3» — they can't both hold.");
  });

  it('the same radius again is still accepted as known', () => {
    expect(last(['מעגל O ברדיוס 3', 'מעגל O ברדיוס 3']).kind).not.toBe('refused');
  });
});

/**
 * #2028 ([ADR-W-130](../../../docs/06w-decisions-workspace.md#adr-w-130)) — THE MESSAGE FLOOR, the shared half of the
 * four-builder render lock.
 *
 * The operator's ruling of 2026-10-13: engine text never reaches the student raw in English, and is never spliced
 * into a mixed-language line. 2-D's errors cross the engine → UI boundary as English strings, so it gained a floor
 * sentence (`src/i18n/__tests__/humanize-floor.test.ts`). The other three carry TYPED codes rendered by exhaustive
 * tables — measured on b0ef3240, none has a path by which engine text reaches the student — and a per-tree lock
 * keeps it that way: each drives its render function over EVERY member of its typed error union (a compile-time total
 * `Record`) with a synthetic payload of a student's own text, and `lockMessageFloor` asserts three things:
 *   1. no locale lookup comes back as its bare key (a missing entry would print `err.foo` at the student);
 *   2. `studentFacingViolations` is empty for the values the Hebrew sentence interpolates — no id-shaped token, no
 *      untyped English word (an engine noun translated nowhere);
 *   3. the English render's values carry no engine token either.
 *
 * The ASSERTIONS live here and the ROWS in each tree (`src3d`, `src-analytic`, `src-complex` `__tests__/message-floor-2028`),
 * because `shell/` may never import a product tree (ADR-W-016 rule 2; the #1296 precedent). Test-only: nothing here is
 * imported by runtime code.
 */
import { describe, expect, it } from 'vitest';
import type { i18n as I18n } from 'i18next';
import { hasEngineToken, studentFacingViolations } from '../../studentText';

export type Payload = Record<string, unknown>;
export type Fixed = (k: string, o?: Record<string, unknown>) => string;

/** Every string the synthetic payloads use — what "the student typed" (the vocabulary a value may name). */
export const TYPED = [
  'P', 'Q', 'A', 'B', 'AB', 'CD', 'ABC', 'ABCD', 'ABCDE', 'AG, BH', '∠ABC, ∠ABD', 'AB = 3', '∠ABC = 40°', '|AB| = |CD|',
  'הוכיחו כי AB = CD', 'ДЖФ', 'x_B', 'k', 'π1', 'ℓ', 'נפח התיבה = 12', 'משולש ABC', 'ישר זווית ב-B', '∠ABC = 90°',
  'P אמצע AB', 'P על AB', 'l1', 'I', 'II', '1', 'z1 = 3+4i', 'z1', 'w', '45', '30', 'cos45 + i sin30', 'zi', 'z*i',
  'שורש של 3', '√3', 'לא', 'u מספר מרוכב', 'u', 'z^3', '2', 'z^2 = 2i', 'קובץ.json', '200', 'I מעגל',
].join(' ');

/**
 * Render `render` through a recording `t` in `lng`: the text, every string value the TEMPLATE interpolates (a
 * renderer may pass both locales' params — analytic's `shapeHe`/`shapeEn` — and only the ones the sentence uses
 * reach the student), and every key that missed.
 */
export function drive(inst: I18n, lng: 'he' | 'en', render: (t: Fixed) => string | null) {
  const fixed = inst.getFixedT(lng) as Fixed;
  const values: string[] = [];
  const missing: string[] = [];
  const t: Fixed = (k, o) => {
    const tpl = inst.getResource(lng, 'translation', k);
    const src = typeof tpl === 'string' ? tpl : JSON.stringify(tpl ?? '');
    for (const [name, v] of Object.entries(o ?? {})) {
      if (typeof v === 'string' && v && new RegExp(String.raw`\{\{-?\s*${name}\s*(,[^}]*)?\}\}`).test(src)) values.push(v);
    }
    const out = fixed(k, o);
    if (out === k) missing.push(k);
    return out;
  };
  return { text: render(t), values, missing };
}

/** The three assertions, over one builder's rows. */
export function lockMessageFloor(name: string, inst: I18n, rows: { label: string; render: (t: Fixed) => string | null }[]) {
  describe(`#2028 — ${name}: every typed refusal renders a locale sentence of the student's own words`, () => {
    it('the table is driven (non-vacuous)', () => {
      expect(rows.length).toBeGreaterThan(10);
    });
    for (const { label, render } of rows) {
      it(label, () => {
        const h = drive(inst, 'he', render);
        const e = drive(inst, 'en', render);
        expect(h.missing, 'a missing Hebrew locale entry').toEqual([]);
        expect(e.missing, 'a missing English locale entry').toEqual([]);
        expect(typeof h.text === 'string' && h.text.length > 0).toBe(true);
        expect(studentFacingViolations(h.values, { typed: TYPED, names: [] })).toEqual([]);
        expect(e.values.filter(hasEngineToken)).toEqual([]);
      });
    }
  });
}


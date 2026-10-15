/**
 * #1453 (ADR-W-098) — ONE WORDING FOR ONE STATE, in every builder (operator ruling 2026-09-27, the
 * "Explicit set"). The same state had four wordings («נקבע במלואו» / «הכול נקבע על-ידי הנתונים» / …) and
 * one button three («חשב» / «שאל» / «שאלו»). Shell holds no strings, so this reads each product's locale
 * by FILE (the row-parity pattern — no test may import two product trees) and asserts that every role
 * resolves to the same text, in Hebrew and in English, wherever the product has that surface.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

type Lang = 'he' | 'en';
type Product = '2d' | '3d' | 'complex' | 'analytic';

function jsonValue(product: '2d' | '3d', lang: Lang, key: string): string | undefined {
  const tree = product === '2d' ? 'src' : 'src3d';
  let o: unknown = JSON.parse(read(`${tree}/i18n/locales/${lang}.json`));
  for (const k of key.split('.')) o = (o as Record<string, unknown> | undefined)?.[k];
  return typeof o === 'string' ? o : undefined;
}

/** A TS-object locale: `const he = { … }` then `const en: typeof he = { … }`. */
function tsValue(product: 'complex' | 'analytic', lang: Lang, key: string): string | undefined {
  const src = read(`${product === 'complex' ? 'src-complex' : 'src-analytic'}/i18n/index.ts`);
  const heAt = src.indexOf('const he = {');
  const enAt = src.indexOf('const en: typeof he = {');
  const block = lang === 'he' ? src.slice(heAt, enAt) : src.slice(enAt);
  const m = block.match(new RegExp(String.raw`\n\s*${key}:\s*'((?:[^'\\]|\\.)*)'`));
  return m?.[1].replace(/\\(.)/g, '$1'); // a JS escape («can\'t») reads as the character it escapes
}

const valueOf = (p: Product, lang: Lang, key: string) =>
  p === '2d' || p === '3d' ? jsonValue(p, lang, key) : tsValue(p, lang, key);

/**
 * role → the key(s) each product shows it with. `null` = the product has no such surface at all (said
 * why), which is not a different wording. Several keys = every one must read the role's wording.
 */
const ROLES: Record<string, Record<Product, string[] | null>> = {
  determined: { '2d': ['actions.determined'], '3d': ['cue.determined'], complex: ['freedomPinned'], analytic: ['pinned'] },
  // #1444 (ADR-556): 0 DOF but more than one configuration — the note ADDED to the DOF count (operator
  // ruling 2026-09-30), with a stable count N and without one. Only 2-D's cue reads a discrete admissible
  // pool (the ruling was scoped to 2-D; "consistent across tools" is a workspace follow-up); a sibling
  // whose cue gains that state adds its key here.
  dofConfigs: { '2d': ['actions.dofConfigs'], '3d': null, complex: null, analytic: null },
  dofConfigsMany: { '2d': ['actions.dofConfigsMany'], '3d': null, complex: null, analytic: null },
  dofCount: { '2d': ['actions.dof'], '3d': ['cue.free'], complex: ['freedomCount'], analytic: ['freeDof'] },
  // complex has no asynchronous path (no LLM, no deferred values), so it never shows a busy state
  busy: { '2d': ['input.loading', 'values.computing'], '3d': ['input.thinking'], complex: null, analytic: ['thinking'] },
  askSubmit: { '2d': ['values.queryAdd'], '3d': ['query.add'], complex: ['askAdd'], analytic: ['askAdd'] },
  undo: { '2d': ['actions.undo'], '3d': ['actions.undo'], complex: ['undo'], analytic: ['undo'] },
  redo: { '2d': ['actions.redo'], '3d': ['actions.redo'], complex: ['redo'], analytic: ['redo'] },
  clearAll: { '2d': ['actions.clear'], '3d': ['actions.clear'], complex: ['clearAll'], analytic: ['clearAll'] },
  showAnother: { '2d': ['actions.another'], '3d': ['actions.another'], complex: ['anotherConfig'], analytic: ['another'] },
  about: { '2d': ['header.about'], '3d': ['aboutLabel'], complex: ['menuAbout'], analytic: ['about'] },
  // #1864 (ADR-AG-267, B10): a choice the tool made for an unstated given — 2-D's notes, ported to analytic word for
  // word. 3-D and complex hold no such choice (n/a in 02w's row).
  unstatedEqualPair: { '2d': ['steps.unstatedEqualPair'], '3d': null, complex: null, analytic: ['unstatedEqualPair'] },
  unstatedParallelPairPlain: { '2d': ['steps.unstatedParallelPairPlain'], '3d': null, complex: null, analytic: ['unstatedParallelPairPlain'] },
  unstatedParallelPair: { '2d': ['steps.unstatedParallelPair'], '3d': null, complex: null, analytic: ['unstatedParallelPair'] },
  unstatedTitle: { '2d': ['steps.unstatedTitle'], '3d': null, complex: null, analytic: ['unstatedTitle'] },
  stateEqualPair: { '2d': ['steps.stateEqualPair'], '3d': null, complex: null, analytic: ['stateEqualPair'] },
  stateParallel: { '2d': ['steps.stateParallel'], '3d': null, complex: null, analytic: ['stateParallel'] },
  drawnParallel: { '2d': ['steps.drawnParallel'], '3d': null, complex: null, analytic: ['drawnParallel'] },
  // #1872 (ADR-W-126): «הורידו שאלה» is in every builder (B16), so its label and the document's heading are one role each
  saveQuestion: { '2d': ['canvas.saveQuestion'], '3d': ['actions.saveQuestion'], complex: ['saveQuestion'], analytic: ['saveQuestion'] },
  questionHeading: { '2d': ['questionDoc.given'], '3d': ['questionDoc.given'], complex: ['questionGiven'], analytic: ['questionGiven'] },
  // #2023 / #2054 (ADR-661, ADR-3D-344, ADR-AG-277; operator rulings 2026-10-13 — «all three builders, the same
  // sentences»): a second letter for an angle or a segment. 3-D has no symbolic LENGTH (a 3-D «AB=a» is a vector, X7);
  // the complex builder has no angles or segments.
  angleNameTaken: { '2d': ['errors.angleNameTaken_said_vs'], '3d': ['err.angleNameTaken'], complex: null, analytic: ['errAngleNameTaken_vs'] },
  angleNameTakenAlone: { '2d': ['errors.angleNameTaken'], '3d': ['err.angleNameTakenAlone'], complex: null, analytic: ['errAngleNameTaken'] },
  lengthNameTaken: { '2d': ['errors.lengthNameTaken_said_vs'], '3d': null, complex: null, analytic: ['errLengthNameTaken_vs'] },
  lengthNameTakenAlone: { '2d': ['errors.lengthNameTaken'], '3d': null, complex: null, analytic: ['errLengthNameTaken'] },
  // #2061 (ADR-AG-277; ruling 2026-10-14, card d14b-2061-crosstool A): analytic speaks 2-D's over-constrained frame for
  // the same letter with another coefficient. 3-D keeps its own conflict sentence (card d14b-2061-wording A).
  measureContradicts: { '2d': ['errors.overConstrained_said_vs'], '3d': null, complex: null, analytic: ['errMeasureContradicts'] },
  measureContradictsAlone: { '2d': ['errors.overConstrained_said'], '3d': null, complex: null, analytic: ['errMeasureContradictsAlone'] },
};

/** The ruled wording (the "Explicit set", 2026-09-27) — the lock's anchor, not just "all equal". */
const RULED: Record<string, Record<Lang, string>> = {
  determined: { he: '✓ הציור נקבע במלואו על ידי הנתונים', en: '✓ The figure is fully determined by the givens' },
  dofConfigs: {
    he: 'דרגות חופש: 0 · יש {{N}} תצורות אפשריות — לחצו «הציגו תצורה אחרת»',
    en: 'Degrees of freedom: 0 · {{N}} configurations are possible — press «Show another configuration»',
  },
  dofConfigsMany: {
    he: 'דרגות חופש: 0 · יש יותר מתצורה אחת — לחצו «הציגו תצורה אחרת»',
    en: 'Degrees of freedom: 0 · more than one configuration is possible — press «Show another configuration»',
  },
  dofCount: { he: 'דרגות חופש: {{N}}', en: 'Degrees of freedom: {{N}}' },
  busy: { he: 'חושב…', en: 'Working…' },
  askSubmit: { he: 'שאלו', en: 'Ask' },
  saveQuestion: { he: 'הורידו שאלה', en: 'Download question' },
  questionHeading: { he: 'נתון:', en: 'Given:' },
  // the operator's verbatim sentences (2026-10-13, cards d4-2023 and d5-2023-length), placeholders normalised
  angleNameTaken: {
    he: 'לזווית {{N}} כבר יש שם: {{N}} (בשורה «{{N}}»). לכל זווית שם אחד — המשיכו עם {{N}}.',
    en: 'Angle {{N}} already has a name: {{N}} (in the line «{{N}}»). An angle has one name — keep using {{N}}.',
  },
  lengthNameTaken: {
    he: 'לקטע {{N}} כבר יש שם: {{N}} (בשורה «{{N}}»). לכל קטע שם אחד — המשיכו עם {{N}}.',
    en: 'Segment {{N}} already has a name: {{N}} (in the line «{{N}}»). A segment has one name — keep using {{N}}.',
  },
  measureContradicts: {
    he: 'לא ניתן: «{{N}}» סותר את «{{N}}» — אי אפשר לקיים את שניהם יחד. הסיבה: {{N}}.',
    en: "Can't do that: «{{N}}» contradicts «{{N}}» — they can't both hold. The reason: {{N}}.",
  },
};

/** Interpolation names differ per product ({{count}} / {{n}}) — the WORDING is what must match. */
const normalize = (s: string) => s.replace(/\{\{\s*\w+\s*\}\}/g, '{{N}}');

describe('#1453 — one wording per role, in every builder', () => {
  for (const [role, perProduct] of Object.entries(ROLES)) {
    for (const lang of ['he', 'en'] as const) {
      it(`${role} (${lang}) reads the same everywhere`, () => {
        const seen: string[] = [];
        for (const [product, keys] of Object.entries(perProduct) as [Product, string[] | null][]) {
          if (keys === null) continue;
          for (const key of keys) {
            const v = valueOf(product, lang, key);
            expect(v, `${product} ${lang} ${key} is missing`).toBeDefined();
            seen.push(`${normalize(v!)}`);
          }
        }
        expect(new Set(seen).size, `${role} (${lang}): ${[...new Set(seen)].join(' | ')}`).toBe(1);
        if (RULED[role]) expect(seen[0]).toBe(RULED[role][lang]);
      });
    }
  }

  it('the reader is not vacuous: it finds a known key in each locale form', () => {
    expect(valueOf('complex', 'he', 'undo')).toBe('בטל');
    expect(valueOf('analytic', 'en', 'undo')).toBe('Undo');
    expect(valueOf('2d', 'he', 'actions.undo')).toBe('בטל');
  });
});

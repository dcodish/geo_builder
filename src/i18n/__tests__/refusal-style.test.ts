/**
 * #1995 stage 5 ([ADR-W-154](../../../docs/06w-decisions-workspace.md#adr-w-154)) — 2-D's rows of the refusal-style
 * ratchet: every refusal the student reads gives one next step, or says plainly there is none. The assertions are
 * shared (`shell/__tests__/fixtures/refusal-style.ts`); the rows are this tree's, rendered AS THE STUDENT SEES THEM:
 *
 *   (i)  every engine message of the humaniser's corpus (`fixtures/humanize-cases.ts`) through `explainError` — the
 *        renderer the banner, the row tooltip and the submit note all call. It appends `errors.retryHint` to every
 *        humanised refusal but the floor and the next-step patterns (ADR-W-130 §2), so a table-only reading of
 *        `errors.*` would be 40 false violations;
 *   (ii) every note key `src/app/` hands the student (`{ key: '…' }` in the submit lane, read by the shared AST
 *        walker, so a new refusal key cannot dodge), plus the store-op notes `input.{rename,swap,merge}_*`, rendered
 *        through `t(key, params)` — the `noteText` path — with synthetic student params.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { explainError, type Translate } from '@/i18n/humanizeError';
import he from '@/i18n/locales/he.json';
import suiteHe from '../../../shell/locales/he.json';
import { flatten } from '../../../shell/__tests__/fixtures/locale-tables';
import { lockRefusalStyle, type Row } from '../../../shell/__tests__/fixtures/refusal-style';
import { parseSource, propertyStrings, sourceFiles } from '../../../shell/__tests__/fixtures/ts-literals';
import { CASES } from './fixtures/humanize-cases';

const T: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const TABLE = flatten({ ...suiteHe, ...he });

/**
 * Note keys `src/app/` returns that are NOT refusals — a figure status or a note on a line that DID build — each
 * with its reason. Every other enumerated key is a row. A key listed here that `src/app/` no longer returns fails.
 */
const NOT_REFUSAL: Record<string, string> = {
  'actions.dof': 'figure status chip (degrees of freedom left), not a reply to a line',
  'actions.dofConfigs': 'figure status chip',
  'actions.dofConfigsMany': 'figure status chip',
  'actions.determined': 'figure status chip',
  'actions.checking': 'figure status chip (pending)',
  'actions.dofTooComplex': 'figure status chip',
  'input.canonicalHint': 'the line built; the note teaches the canonical spelling',
  'input.measureCaseNote': 'the line built; the note says how a letter was read',
  'input.vertexAngleReadAs': 'the line built; the note says how a vertex angle was read',
  'input.greekAngleLetter': 'the line built; the note says how a Greek letter was read',
  'input.scope.split-advisory': 'the line built; the note advises one fact per line',
};

/** `src/app/` note keys: every `key:` literal, and every template prefix expanded over the locale table. */
function noteKeys(): string[] {
  const keys = new Set<string>();
  for (const f of sourceFiles(['src/app'], new Set(['__tests__']))) {
    const { literals, prefixes } = propertyStrings(parseSource(f), 'key');
    for (const k of literals) keys.add(k);
    for (const p of prefixes) for (const k of Object.keys(TABLE)) if (k.startsWith(p)) keys.add(k);
  }
  // submitPipeline.ts: `input.${op}_${res.reason}` — the store operations' refusals
  for (const k of Object.keys(TABLE)) if (/^input\.(rename|swap|merge)_/.test(k)) keys.add(k);
  return [...keys].sort();
}

/** A synthetic value for each slot — what a student could have typed. */
const SAMPLE: Record<string, string> = { sentence: 'AB = 3', detail: 'AB = 3', canonical: 'AB = 3', corrected: 'AB = 3', phrase: 'y = 2x', count: '2' };
const slotsOf = (tpl: string) => [...tpl.matchAll(/\{\{-?\s*(\w+)/g)].map((m) => m[1]);
/** Params the noteText path passes as a translation (`{ t: key }`) where the sentence's remedy lives. */
const VARIANTS: Record<string, Record<string, string>[]> = {
  'input.scope.foreign-given': [{ guide: T('input.scope.cross-app') }, { guide: T('input.scope.analytic') }],
};

function noteRows(): Row[] {
  return noteKeys()
    .filter((k) => !(k in NOT_REFUSAL))
    .flatMap((key) => {
      const base = Object.fromEntries(slotsOf(TABLE[key] ?? '').map((s) => [s, SAMPLE[s] ?? 'AB']));
      const variants = VARIANTS[key] ?? [{}];
      return variants.map((v, i) => ({ label: `note ${key}${variants.length > 1 ? ` #${i + 1}` : ''}`, key, he: T(key, { ...base, ...v }) }));
    });
}

function explainRows(): Row[] {
  return CASES.map(({ raw }) => ({ label: `explain ${raw.slice(0, 72)}`, key: 'explainError', he: explainError(raw, T) }));
}

lockRefusalStyle('2d', () => [...explainRows(), ...noteRows()]);

describe('#1995 stage 5 — 2-D: the note-key enumeration is complete and honest', () => {
  const keys = noteKeys();
  it('every enumerated note key exists in the Hebrew table (a missing one would print its bare key)', () => {
    expect(keys.filter((k) => !(k in TABLE))).toEqual([]);
  });
  it('is non-vacuous: the walker finds the submit lane refusals', () => {
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).toContain('input.unknownCircle');
    expect(keys.some((k) => k.startsWith('input.trigGiven.'))).toBe(true); // a template key family is expanded
    expect(keys.some((k) => k.startsWith('input.rename_'))).toBe(true);
  });
  it('every NOT_REFUSAL entry is still a key src/app returns (no stale exemption)', () => {
    expect(Object.keys(NOT_REFUSAL).filter((k) => !keys.includes(k))).toEqual([]);
  });
});

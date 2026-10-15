/**
 * Every catalog line on a FRESH figure (#2037, [ADR-663](../../docs/06-decisions.md#adr-663)).
 *
 * The catalog is the student's reference: a line it shows should build when typed on an empty canvas. #2037's plan
 * measured 161 rows × he/en and found 27 that did not — the three arc lines among them («קשת AB = 40 במעגל O» was
 * refused «∠AOB = 40° references an unknown point»). This sweep runs each line through the real pre-model decision
 * (`decideDeterministic2D`) and, when it commits, through the gate and `replay`. A line passes when it commits and
 * every row is green.
 *
 * The lines that still fail are an explicit allowlist that may only SHRINK: a new failure fails the sweep, and so does
 * an allowlisted line that now passes (remove it from the list in the commit that heals it). Most of the remaining
 * rows are #1467's (a referenced point that does not exist yet) and #2048's.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '@/app/decideDeterministic';
import { COMMAND_CATALOG } from '@/parser/catalog';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from './submit-gate';

/** The catalog lines (`he` text, then the locale) that do not build on a fresh figure today. Only ever shrinks. */
const STILL_FAILING: ReadonlySet<string> = new Set<string>([
  'C במרחק 5 מ-A ו-5 מ-B [he]',
  'C במרחק 5 מ-A ו-5 מ-B [en]',
  'F רגל האנך מ-C ל-AD [he]',
  'F רגל האנך מ-C ל-AD [en]',
  'E חיתוך חוצי הזוויות BAC ו-BCA [he]',
  'E חיתוך חוצי הזוויות BAC ו-BCA [en]',
  'חוצה זווית ABC [he]',
  'חוצה זווית ABC [en]',
  'ישר דרך P מקביל ל-AB [he]',
  'ישר דרך P מקביל ל-AB [en]',
  'ישר ABE [he]',
  'ישר ABE [en]',
  'AD תיכון לצלע BC [he]',
  'AD תיכון לצלע BC [en]',
  'אנך אמצעי ל-AB [he]',
  'אנך אמצעי ל-AB [en]',
  'AD חוצה את הזווית BAC [he]',
  'AD חוצה את הזווית BAC [en]',
  'שטח המשולש ABC הוא 13 [he]',
  'שטח המשולש ABC הוא 13 [en]',
  'שטח ABF גדול פי 2 משטח BFE [he]',
  'שטח ABF גדול פי 2 משטח BFE [en]',
  'היקף המשולש ABC = 20 [he]',
  'היקף המשולש ABC = 20 [en]',
  'AB = 2 AD [he]',
  'AB = 2 AD [en]',
  'AD:DB = 1:2 [he]',
  'AD:DB = 1:2 [en]',
  'α < β [he]',
  'α < β [en]',
  'המעגל עובר דרך A [he]',
  'המעגל עובר דרך A [en]',
  'המעגל החוסם את משולש ABC חותך את CE בנקודה D [he]',
  'המעגל החוסם את משולש ABC חותך את CE בנקודה D [en]',
  'הישר AO חותך את מעגל O בנקודות C ו-D [he]',
  'הישר AO חותך את מעגל O בנקודות C ו-D [en]',
  'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E [he]',
  'קוטר מעגל O היוצא מנקודה F חותך את הצלע AC בנקודה E [en]',
  'E חיתוך המשיק למעגל O בנקודה A עם BC [he]',
  'E חיתוך המשיק למעגל O בנקודה A עם BC [en]',
  'G חיתוך מעגל O ומעגל P [he]',
  'G חיתוך מעגל O ומעגל P [en]',
  'המשך AC חותך את מעגל P בנקודה E [he]',
  'המשך AC חותך את מעגל P בנקודה E [en]',
  'הישר AC פוגש את מעגל P בנקודה E [he]',
  'הישר AC פוגש את מעגל P בנקודה E [en]',
]);

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function freshVerdict(line: string, locale: 'he' | 'en'): Promise<string> {
  useGeoStore.getState().clear();
  const empty = replay([], 0);
  const v = await decideDeterministic2D({ facts: [], seed: 0, view: { construction: empty.construction, positions: empty.positions } }, line, locale);
  if (v.kind !== 'commit') return v.kind;
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate([line]);
  if (refused.length) return 'gate-refused';
  const fig = replay(facts, useGeoStore.getState().seed);
  if (fig.lastError) return 'error';
  return facts.every((f) => fig.status[f.id] === 'ok') ? 'ok' : 'red-row';
}

describe('every catalog line on a fresh figure', () => {
  it('builds, or is on the shrinking allowlist', async () => {
    const failing: string[] = [];
    for (const e of COMMAND_CATALOG) {
      if (!e.supported || e.needsFigure) continue;
      for (const [line, locale] of [[e.he, 'he'], [e.en, 'en']] as const) {
        if (!line) continue;
        const verdict = await freshVerdict(line, locale);
        if (verdict !== 'ok') failing.push(`${e.he} [${locale}]`);
      }
    }
    const newlyFailing = failing.filter((k) => !STILL_FAILING.has(k));
    const healed = [...STILL_FAILING].filter((k) => !failing.includes(k));
    if (process.env.CATALOG_SWEEP_PRINT) console.log(JSON.stringify(failing, null, 1));
    expect(newlyFailing, 'catalog lines that stopped building on a fresh figure').toEqual([]);
    expect(healed, 'allowlisted lines that build now — remove them from STILL_FAILING').toEqual([]);
  }, 600_000);

  it('the three arc lines build (ADR-663)', async () => {
    for (const line of ['קשת AB = 40 במעגל O', 'קשת DE = 2 קשת CE במעגל O', 'קשת AC + קשת BE = קשת AD + קשת BC במעגל O'])
      expect(await freshVerdict(line, 'he'), line).toBe('ok');
  });
});

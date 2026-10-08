/**
 * #1888 ([ADR-603](../../../docs/06-decisions.md#adr-603)) — the CLASS lock, grammar-wide, both locales.
 *
 * Every supported catalog example that commits is re-submitted with a trailing qualifier built from its own labels
 * («ב-X», «שהיא אמצע PQ», «על PQ», «שנמצאת על PQ», and the English forms). Measured at 5edeeca1: 455 of 888 such
 * lines committed with a byte-identical lowering — the qualifier silently dropped, in 86 of 111 Hebrew constructs.
 *
 * The property: no such line may commit with the identical lowering, unless the qualifier is a CO-REFERENCE (a
 * single letter the line already reads, «בנקודה M ב-M»: the student named the point twice), or it is one of the
 * measured residual rows below. And no catalog example itself may be refused (0 of 264 at pickup).
 */
import { describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { COMMAND_CATALOG } from '@/parser';
import { loweringKey } from '../unreadParts';

/**
 * The measured residual: a synthetic line on an EMPTY canvas whose qualifier the probe cannot see, because the line
 * has no spare letter and a fresh one trips a rule's fail-closed leftover, or the rule reads the substituted side.
 * On a real figure the figure's own points supply the spare letter. A row that starts refusing turns this red —
 * delete it then, never silence it.
 */
const RESIDUAL = new Set([
  'תיכון מ-A במשולש ABC על AB',
  'תיכון מ-A במשולש ABC שנמצאת על AB',
  'משיק למעגל O בנקודה A שהיא אמצע OA',
  'משיק למעגל O בנקודה A על OA',
  'משיק למעגל O בנקודה A שנמצאת על OA',
  'tangent to circle O at A which is the midpoint of OA',
  'tangent to circle O at A on OA',
  'tangent to circle O at A which lies on OA',
]);

async function decideEmpty(line: string, lang: 'he' | 'en') {
  useGeoStore.getState().clear();
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, lang);
}

describe('#1888 — no catalog construct drops a trailing qualifier green', () => {
  it('every committing catalog example, plus a qualifier from its own labels, is refused, escalated or read', async () => {
    let base = 0;
    let lines = 0;
    const refusedBase: string[] = [];
    const dropped: string[] = [];
    const residualHeld = new Set<string>();
    for (const lang of ['he', 'en'] as const) {
      for (const doc of COMMAND_CATALOG) {
        if (!doc.supported) continue;
        const ex = lang === 'he' ? doc.he : doc.en;
        const v = await decideEmpty(ex, lang);
        if (v.kind === 'refuse' && /unread-part/.test(String(v.logs.at(-1)?.result))) refusedBase.push(ex);
        if (v.kind !== 'commit') continue;
        base++;
        const letters = [...new Set(ex.match(/[A-Z]\d*/g) ?? [])];
        if (letters.length < 2) continue;
        const X = letters[letters.length - 1];
        const PQ = letters[0] + letters[1];
        const quals = lang === 'he' ? [`ב-${X}`, `שהיא אמצע ${PQ}`, `על ${PQ}`, `שנמצאת על ${PQ}`] : [`at ${X}`, `which is the midpoint of ${PQ}`, `on ${PQ}`, `which lies on ${PQ}`];
        for (const q of quals) {
          const line = `${ex} ${q}`;
          lines++;
          const v2 = await decideEmpty(line, lang);
          if (v2.kind !== 'commit' || loweringKey(v2.commands) !== loweringKey(v.commands)) continue;
          // a co-reference: the qualifier's single letter is a single-letter run the example already states
          const coRef = q.endsWith(` ${X}`) || q.endsWith(`-${X}`) ? new RegExp(`(?<![A-Za-z])${X}(?![A-Za-z\\d])`).test(ex) : false;
          if (coRef) continue;
          if (RESIDUAL.has(line)) {
            residualHeld.add(line);
            continue;
          }
          dropped.push(line);
        }
      }
    }
    expect(refusedBase, 'a catalog example is never refused as a lost part').toEqual([]);
    expect(dropped, 'a qualifier dropped green').toEqual([]);
    expect([...RESIDUAL].filter((r) => !residualHeld.has(r)), 'a residual row that no longer commits: delete it').toEqual([]);
    expect(base, 'the catalog was exercised').toBeGreaterThanOrEqual(250);
    expect(lines).toBeGreaterThanOrEqual(800);
    expect(llmParseMock).not.toHaveBeenCalled();
  }, 600_000);
});

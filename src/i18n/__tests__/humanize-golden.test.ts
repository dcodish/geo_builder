/**
 * #2201 phase 3 ([ADR-756](../../../docs/06-decisions.md#adr-756)) — THE GOLDEN LOCK: every 2-D refusal reads the
 * same after the engine's errors became codes.
 *
 * `fixtures/humanize-golden.json` was captured BEFORE any engine edit (phase 3's golden-first rule), from the
 * humaniser as it was at 776fe3a0: every raw message of the humaniser's own evidence corpus (`humanize-cases.ts`,
 * with no sentence, with the student's sentence, and with both sides), the floor lock's messages, the side-statement
 * and constraint vocabulary, every 2-D corpus scenario that ends in an error (with the figure it ends on), and the
 * four leak issues' exact sequences (#2151, #2132, #2345, #2048) through the real submit path. Each entry records the
 * rendered refusal in Hebrew and in English, exactly as `explainError` produced it.
 *
 * Phase 3a (the bank) changes no entry: the wire is parsed by the engine's own inverse and worded by a `switch`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import i18n from '@/i18n';
import { explainError, type Translate } from '@/i18n/humanizeError';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const en: Translate = (k, o) => i18n.getFixedT('en')(k, o) as string;

export interface GoldenEntry {
  source: string;
  raw: string;
  said?: string;
  other?: string;
  vocab?: { typed: string[]; objects: { id: string; kind: string; hidden?: true; center?: string; innerOf?: string }[] };
  he: string;
  en: string;
}
export const GOLDEN: GoldenEntry[] = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/humanize-golden.json', import.meta.url)), 'utf8')).entries;

describe('#2201 phase 3 — the golden lock', () => {
  it('measures something: every source family is present', () => {
    expect(GOLDEN.length).toBeGreaterThan(300);
    for (const src of ['cases', 'floor', 'corpus:', 'leak:2151', 'leak:2132', 'leak:2345', 'leak:2048']) {
      expect(GOLDEN.some((e) => e.source.startsWith(src)), src).toBe(true);
    }
  });

  it('every entry renders byte-identically, in Hebrew and in English', () => {
    const drift: string[] = [];
    for (const e of GOLDEN) {
      const gotHe = explainError(e.raw, he, e.said, e.other);
      const gotEn = explainError(e.raw, en, e.said, e.other);
      if (gotHe !== e.he) drift.push(`[he] ${e.source} «${e.raw}» said=${e.said ?? '-'}\n   was: ${e.he}\n   now: ${gotHe}`);
      if (gotEn !== e.en) drift.push(`[en] ${e.source} «${e.raw}» said=${e.said ?? '-'}\n   was: ${e.en}\n   now: ${gotEn}`);
    }
    expect(drift, drift.join('\n')).toEqual([]);
  });
});

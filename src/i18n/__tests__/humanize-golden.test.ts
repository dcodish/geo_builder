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
 *
 * Phase 3b ([ADR-W-130](../../../docs/06w-decisions-workspace.md#adr-w-130) Am. 1) renders each entry that carries
 * its figure WITH that figure's vocabulary (the provenance check). Every entry stays byte-identical except the ones
 * listed in {@link FLIPPED}, each of which the check sends to the floor or rewrites per the operator's d20 ruling (c′)
 * — asserted exactly. No corpus entry flips, and no ruled frame does (the 2026-10-23 amendment's escalation condition).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import i18n from '@/i18n';
import { explainError, type Translate } from '@/i18n/humanizeError';
import { studentVocabulary } from '@/app/studentVocabulary';

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

const FLOOR_HE = 'משהו השתבש בבניית השורה הזאת. נסו לנסח אותה אחרת, או לפרק אותה לשני צעדים.';
const FLOOR_EN = 'Something went wrong building this line. Try wording it differently, or split it into two steps.';
const HINT_HE = 'אפשר לנסות סדר אחר (להזין קודם את הנתונים), לנסח מחדש, או לבנות את זה בכמה צעדים קטנים.';
const HINT_EN = 'You can try a different order (enter the givens first), reword it, or build it in a few smaller steps.';
const missingHe = (said: string, pts: string) => `הנתון «${said}» מתייחס לנקודה שעדיין לא הוגדרה (${pts}). הגדירו אותה תחילה. ${HINT_HE}`;
const missingEn = (said: string, pts: string) => `«${said}» refers to a point that hasn't been defined yet (${pts}). Create it first. ${HINT_EN}`;

/**
 * Phase 3b's flips — `source | raw` → the exact text, Hebrew and English. Each is one of the four leak issues:
 *   #2151: the scaffold circle `tanaux-OP` and the minted point T are the tool's → the floor (ADR-W-130 1(b));
 *   #2345: «∠AAB» is the tool's misreading, not the student's angle → the floor (d20 A, "the third");
 *   #2132 / #2048: the unknown-point sentence is true → it keeps its frame, the bracket names the missing points (d20 A).
 */
export const FLIPPED: Record<string, { he: string; en: string }> = {
  'leak:2151 | cannot construct T: circles circle-O and tanaux-OP do not meet': { he: FLOOR_HE, en: FLOOR_EN },
  'leak:2345 | an angle needs three distinct points — "∠AAB" repeats its vertex': { he: FLOOR_HE, en: FLOOR_EN },
  'leak:2132 | |OR| = 1·R references an unknown point': { he: missingHe('OR=r', 'R'), en: missingEn('OR=r', 'R') },
  'leak:2048 | |AD| = 0.5·|DB| references an unknown point': { he: missingHe('AD:DB = 1:2', 'A, D, B'), en: missingEn('AD:DB = 1:2', 'A, D, B') },
  'leak:2048 | area(ABC) = 0.75·area(DEF) references an unknown point': {
    he: missingHe('S_{ABC}/S_{DEF} = 3/4', 'A, B, C, D, E, F'),
    en: missingEn('S_{ABC}/S_{DEF} = 3/4', 'A, B, C, D, E, F'),
  },
};
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

describe('#2201 phase 3 — the golden lock', () => {
  it('measures something: every source family is present', () => {
    expect(GOLDEN.length).toBeGreaterThan(300);
    for (const src of ['cases', 'floor', 'corpus:', 'leak:2151', 'leak:2132', 'leak:2345', 'leak:2048']) {
      expect(GOLDEN.some((e) => e.source.startsWith(src)), src).toBe(true);
    }
  });

  it('phase 3a: without a figure vocabulary every entry renders byte-identically, in Hebrew and in English', () => {
    const drift: string[] = [];
    for (const e of GOLDEN) {
      const gotHe = explainError(e.raw, he, e.said, e.other);
      const gotEn = explainError(e.raw, en, e.said, e.other);
      if (gotHe !== e.he) drift.push(`[he] ${e.source} «${e.raw}» said=${e.said ?? '-'}\n   was: ${e.he}\n   now: ${gotHe}`);
      if (gotEn !== e.en) drift.push(`[en] ${e.source} «${e.raw}» said=${e.said ?? '-'}\n   was: ${e.en}\n   now: ${gotEn}`);
    }
    expect(drift, drift.join('\n')).toEqual([]);
  });

  it('phase 3b: with each figure’s vocabulary, byte-identical except the listed flips, which are exact', () => {
    const drift: string[] = [];
    const flipped = new Set<string>();
    for (const e of GOLDEN) {
      if (!e.vocab) continue;
      const vocab = studentVocabulary({ objects: e.vocab.objects as never }, e.vocab.typed);
      const id = `${e.source} | ${e.raw}`;
      const want = FLIPPED[id] ?? { he: e.he, en: e.en };
      if (FLIPPED[id]) flipped.add(id);
      const gotHe = plain(explainError(e.raw, he, e.said, e.other, undefined, vocab));
      const gotEn = plain(explainError(e.raw, en, e.said, e.other, undefined, vocab));
      if (gotHe !== plain(want.he)) drift.push(`[he] ${id}\n   want: ${plain(want.he)}\n   got:  ${gotHe}`);
      if (gotEn !== plain(want.en)) drift.push(`[en] ${id}\n   want: ${plain(want.en)}\n   got:  ${gotEn}`);
    }
    expect(drift, drift.join('\n')).toEqual([]);
    expect([...flipped].sort(), 'every listed flip is an entry of the golden').toEqual(Object.keys(FLIPPED).sort());
    // the corpus entries carry their figure, so the check ran on them — and flipped none
    expect(GOLDEN.filter((e) => e.vocab && e.source.startsWith('corpus:')).length).toBeGreaterThan(15);
  });
});

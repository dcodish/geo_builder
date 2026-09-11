/**
 * #983 (ADR-500) — the AUDIT's findings outside the reported file.
 *
 * The reported defect was two collapsed backslashes in `src/i18n/humanizeError.ts`. Scanning the whole
 * workspace for the same shape — a lone escape inside a `new RegExp` template literal, which JavaScript
 * eats before the RegExp sees it — found three more, all here:
 *
 *   `solidNounOf`        `^(?:the\s+)?(?:${src})$`                       → `thes+`
 *   `quadDiagonals` (a)  `…${BASE}\s*$`                                  → `…${BASE}s*$`
 *   `quadDiagonals` (b)  `…((?:${LBL})+)\s*$`                            → `…s*$`
 *
 * Two of the three are LATENT and that is measured, not assumed: the volume rule strips the article
 * outside its own capture group before `solidNounOf` ever sees the word, and both `quadDiagonals` arms
 * run on `s.trim()`, so a trailing-whitespace matcher has nothing left to match. They are repaired
 * anyway — each is one caller away from being a live defect.
 *
 * **One behaviour did change, in the honest direction**, and it is locked below: `s*$` also matched a
 * trailing literal *"s"*, so «diagonals of the bases» — plural, on a prism that has two of them —
 * silently resolved to THE single base. Measured on `main` before the change: `{face: []}`, the
 * base sentinel. It now escalates instead of guessing which base the student meant.
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';

describe('#983 — the repaired quadDiagonals patterns', () => {
  it.each([
    ['אלכסוני הבסיס', []],
    ['diagonals of the base', []],
    ['the diagonals of the base', []],
    ['אלכסוני ABCD', ['A', 'B', 'C', 'D']],
    ['diagonals of ABCD', ['A', 'B', 'C', 'D']],
  ])('«%s» still lowers to quad-diagonals — unchanged', (s, face) => {
    const r = parse3(s as string);
    expect(r.ok, s as string).toBe(true);
    expect(r.ok && r.commands).toEqual([{ type: 'quad-diagonals', face }]);
  });

  it('«diagonals of the bases» (PLURAL) no longer silently means the one base', () => {
    // On `main` this returned `{type:'quad-diagonals', face: []}` — the single-base sentinel — because
    // the collapsed `s*$` happily matched the plural "s". Dropping a student's plural is the honesty
    // invariant's own case: escalate, never guess which one they meant.
    const r = parse3('diagonals of the bases');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('not-handled');
  });

  it('trailing whitespace is still tolerated (what the escape was FOR)', () => {
    for (const s of ['אלכסוני הבסיס   ', 'diagonals of ABCD  ']) {
      expect(parse3(s).ok, s).toBe(true);
    }
  });
});

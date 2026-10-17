/**
 * #1870 ([ADR-CX-083](../../docs/06d-decisions-complex.md#adr-cx-083), ADR-W-107; ruling B14/D3) — complex's
 * thin lock on the shared proof-target rows (`shell/__tests__/fixtures/proof-target-rows.ts`, docs/28 §5c),
 * the fourth caller of `shell/proofTarget`.
 *
 * Measured on `main` b0e9dbea through `submitLine`, on «z1 = 3+4i · z2 = 3-4i · w = z1·z2»: «הוכיחו כי |z1| = 5»,
 * «הוכיחו ש-w ממשי», «הראו ש-arg(z1) > 0» and the exam's mixed line «נתון z1 = 3+4i. הוכיחו כי |z1| = 5» were each
 * refused `not-handled` — the generic "I could not understand" — with nothing saying it is a claim to prove.
 * (On 5edeeca1 «prove that w is real» was even RECORDED as a ✓ claim about a number named "prove".)
 * Now each is refused as `proof-target`, quoting the proof sentence, and nothing of it is recorded. How a BARE
 * statement («w ממשי») is read is not this file's to lock: ruled to change (#2338, 2026-10-17).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { editLine, submitLine, toggleLine } from '../app/submit';
import { errorText } from '../app/errorText';
import { complexI18n } from '../i18n';
import { CATALOG } from '../parser/catalog';
import { useComplexStore } from '../store/useComplexStore';
import { findProofTarget } from '../../shell/proofTarget';
import { proofTargetFaults, type ProofGate } from '../../shell/__tests__/fixtures/proof-target-rows';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(complexI18n.getFixedT('he') as unknown as T);
const tEn = plain(complexI18n.getFixedT('en') as unknown as T);

const st = () => useComplexStore.getState();
const BASE = ['z1 = 3+4i', 'z2 = 3-4i', 'w = z1·z2'];

/** A fresh session holding `lines` — every row starts from the same figure, so the gate is pure per row. */
function session(lines: readonly string[]): void {
  st().resetSession();
  for (const l of lines) if (!submitLine(l)) throw new Error(`setup: «${l}» did not record`);
}

/** The REAL entry point the input box calls, asked about one line on a fresh session. */
function verdict(line: string, lines: readonly string[] = BASE) {
  session(lines);
  const before = { lines: st().lines.length, queries: st().queries.length };
  const ok = submitLine(line);
  const err = st().lastError;
  return {
    ok,
    err,
    recorded: st().lines.length > before.lines || st().queries.length > before.queries,
    text: !ok && err ? errorText(err, t) : null,
  };
}

const gate: ProofGate = (line) => {
  const v = verdict(line);
  return { proof: v.err?.key === 'proof-target', recorded: v.recorded, text: v.text };
};

const REFUSAL = (sentence: string) =>
  `זו טענה להוכחה, לא נתון — הכלי משרטט את הנתונים ואינו בודק הוכחות. הקלידו רק את מה שנתון בשאלה: "${sentence}"`;

beforeEach(() => st().resetSession());

describe('#1870 — complex refuses a proof target at the submit gate (the shared rule)', () => {
  it('the shared rows hold through submitLine', async () => {
    expect(await proofTargetFaults(gate)).toEqual([]);
  });

  it.each([
    ['הוכיחו כי |z1| = 5', 'הוכיחו כי |z1| = 5'],
    ['הוכיחו ש-w ממשי', 'הוכיחו ש-w ממשי'],
    ['הראו ש-arg(z1) > 0', 'הראו ש-arg(z1) > 0'],
    ['prove that w is real', 'prove that w is real'],
    // the exam's mixed line: nothing of it is recorded, and only the CLAIM is quoted
    ['נתון z1 = 3+4i. הוכיחו כי |z1| = 5', 'הוכיחו כי |z1| = 5'],
  ])('«%s» is refused as a claim to prove, quoting «%s», and records nothing', (line, sentence) => {
    const v = verdict(line);
    expect(v.ok).toBe(false);
    expect(v.err).toEqual({ key: 'proof-target', detail: sentence });
    expect(v.recorded).toBe(false);
    expect(v.text).toBe(REFUSAL(sentence));
    expect(st().lines).toEqual(BASE);
  });

  it('the English refusal is 2-D\'s English sentence', () => {
    verdict('prove that w is real');
    expect(errorText(st().lastError!, tEn)).toBe(
      'That is a claim to prove, not a given — this tool draws the givens; it does not check proofs. Type only what the question gives: "prove that w is real"',
    );
  });

  it('no line of the complex catalog reads as a proof target', () => {
    const hits = CATALOG.flatMap((e) => [e.he, e.en]).filter((s) => s && findProofTarget(s));
    expect(hits).toEqual([]);
  });
});

describe('#1870 — an edit into a proof line is refused too, muted row or not', () => {
  it('an enabled row edited into a claim to prove keeps its text', () => {
    session(BASE);
    expect(editLine(0, 'הוכיחו כי |z1| = 5')).toBe(false);
    expect(st().lastError).toEqual({ key: 'proof-target', detail: 'הוכיחו כי |z1| = 5' });
    expect(st().lines).toEqual(BASE);
  });

  it('a MUTED row edited into a claim to prove keeps its text', () => {
    session(BASE);
    expect(toggleLine(2)).toBe(true); // mute «w = z1·z2»
    expect(editLine(2, 'prove that w is real')).toBe(false);
    expect(st().lastError).toEqual({ key: 'proof-target', detail: 'prove that w is real' });
    expect(st().lines).toEqual(BASE);
  });
});

/**
 * Honesty gates on the 3-D LLM commit path (S2.3 of docs/24-foundation-hardening-plan.md — the 2-D
 * gate battery COPIED as a pattern per docs/20 §12, never imported).
 *
 * The seam they guard: out-of-grammar input escalates to the LLM (`llm3.ts`), whose canonical lines are
 * re-parsed by `parse3` and committed as ONE fact (`store3.submitSteps`). Nothing there compared the
 * committed commands against the student's ORIGINAL utterance, so a decomposition that silently lost a
 * stated point, vector, or magnitude committed a partial figure with a green row — the exact 2-D class
 * ADR-089/ADR-240 (dropped labels) and ADR-250 (dropped numbers) closed. These are the two
 * highest-value gates, 3-D edition; the docs/23 cross-product review found the 3-D seam had none.
 *
 * Doctrine (the 2-D gates' own): the utterance-side extraction is CONSERVATIVE (only unambiguous
 * labels/magnitudes are demanded) and the command-side accounting is GENEROUS (any plausible lowering
 * accounts) — a false account only suppresses a warning, while a false drop would refuse a working
 * input.
 *
 * 3-D token specifics the 2-D gates never faced:
 *  - point labels are uppercase + optional digits + optional PRIME (`A'` — canonical after normalize3);
 *  - named VECTORS are single lowercase letters (u/v/w by convention), also stated glued to a
 *    coefficient (`tw`, `0.5v`, `βv`);
 *  - ℓ-line names (ℓ/ℓ1/ℓ2), π-plane names (π1) and Greek scalars (α β γ θ) are NOT labels;
 *  - lowercase k/m/t are figure symbols, x/y/z are axes — never point or vector names;
 *  - name subscripts (`π1`, `ℓ2`, `O1`) are NOT magnitudes;
 *  - coordinates `(2,-2,6)` state several signed numbers; π-sizes (`100π`), radicals (`√35/10`,
 *    `5√5`), fractions, ratios (`2:1`, glued `AK = 2KA'` → t = 2/3) and degree values all lower to
 *    derived numeric payloads.
 */

import type { Command3, Id } from '../engine/types';
import { labelTokens, normalize3 } from './parse3';

/**
 * Uppercase point labels (and conventional vector names) the utterance STATES but the committed
 * commands neither reference nor the figure already has — the sign the LLM decomposition silently
 * DROPPED a stated object. Returns the lost names (empty = pass).
 *
 * `existingPoints` / `existingVectors`: ids already on the figure — a stated label that already exists
 * but isn't re-referenced is CONTEXT (e.g. a relation about existing points), never a drop.
 */
export function droppedNewLabels3(
  utterance: string,
  commands: Command3[],
  existingPoints: Id[] = [],
  existingVectors: string[] = [],
): string[] {
  const s = normalize3(utterance); // the SAME text the rules parse (primes canonical, arrows stripped)
  const json = JSON.stringify(commands);
  // Every label the commands reference — including glued runs inside stored plane/face names ("BC'D"
  // decomposes to B, C', D). Command type strings and field keys are all-lowercase, so uppercase
  // matches in the JSON are labels and nothing else.
  const used = new Set(json.match(/[A-Z]\d*'?/g) ?? []);
  const have = new Set(existingPoints);
  const dropped: string[] = [...new Set(labelTokens(s))].filter((L) => !have.has(L) && !used.has(L));

  // Named vectors: the conventional basis letters u/v/w, stated standalone (`u ⊥ v`, `|w|`) or glued
  // to a coefficient (`tw`, `0.5v`, `αu`). Deliberately narrow — an exotic vector name is only a
  // missed warning, while matching arbitrary lowercase letters would trip on English words. Accounted
  // when the letter appears as a single-character JSON string VALUE (a name-vector's `name`, a
  // vec-rel/dot atom's `name`) — keys like `u:`/`v:` (cos-angle operand fields) don't account, hence
  // the `(?!\s*:)` value guard.
  const boundVecs = new Set([...json.matchAll(/"([a-z])"(?!\s*:)/g)].map((m) => m[1]));
  const haveVecs = new Set(existingVectors);
  for (const v of ['u', 'v', 'w']) {
    if (!new RegExp(`(?<![A-Za-z])(?:\\d+(?:\\.\\d+)?|[ktm])?${v}(?![A-Za-z0-9])`).test(s)) continue;
    if (!haveVecs.has(v) && !boundVecs.has(v)) dropped.push(v);
  }
  return dropped;
}

/**
 * Stated numeric magnitudes absent from every committed command's payload — the sign the LLM
 * decomposition silently DROPPED a given. Returns the lost numbers as the raw stated snippets
 * (empty = pass).
 */
export function droppedGivenNumbers3(utterance: string, commands: Command3[]): string[] {
  const q = (n: number): number => Math.round(n * 1e6) / 1e6;
  // ---- accounting side (generous): every numeric payload of every command ----
  const acc = new Set<number>();
  const walk = (v: unknown): void => {
    if (typeof v === 'number' && Number.isFinite(v)) acc.add(q(v));
    else if (typeof v === 'string') {
      for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) acc.add(q(parseFloat(m)));
    } else if (Array.isArray(v)) {
      if (v.length && v.every((x) => typeof x === 'string')) acc.add(v.length); // a count lowered by structure
      for (const x of v) walk(x);
    } else if (v && typeof v === 'object') {
      for (const x of Object.values(v)) walk(x);
    }
  };
  for (const c of commands) walk(c);
  const has = (vals: number[]): boolean => vals.some((v) => Number.isFinite(v) && acc.has(q(v)));

  // ---- utterance side (conservative): blank every token whose digits are NOT magnitudes ----
  let s = normalize3(utterance);
  // a comparison to ZERO is sign notation (`t > 0` / `k < 0`, ADR-3D-079 Am. 1), not a magnitude;
  // a non-zero bound (`> 0.5`, `< 90`) stays a real number the commands must account for
  s = s.replace(/[<>]\s*0(?![.\d])/g, ' ');
  // name subscripts are names, not numbers: ℓ1/ℓ2 line names (typed l1 too), π1/π2 plane names
  s = s.replace(/[ℓπ]\d+/g, ' ').replace(/(?<![A-Za-z])l\d+(?![A-Za-z])/g, ' ');
  // label-glued digits are subscripts (O1, A2), and blanking every latin letter also removes words
  // (the 2-D discipline: each letter → space, so `x`, `t(...)`, `k/6` leave their digits behind)
  s = s.replace(/[A-Za-z]\d*/g, ' ');
  // after blanking, parentheses wrap only numeric content — `(√6/4)`, coordinate triples `(2,-2,6)` —
  // so drop them, letting the fraction/radical spans read whole
  s = s.replace(/[()]/g, ' ');

  const dropped: string[] = [];
  const seen = new Set<string>();
  const spans: [number, number][] = [];
  const inSpan = (i: number): boolean => spans.some(([x, y]) => i >= x && i < y);
  const flag = (raw: string): void => {
    const key = raw.replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      dropped.push(key);
    }
  };

  // 1) RATIO `a:b` — one statement, consumed whole: lowered as t = a/(a+b) (on-segment ratios),
  //    as the plain quotient (length-ratio claims), or kept as its two integers.
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g)) {
    const i = m.index!;
    spans.push([i, i + m[0].length]);
    const a = parseFloat(m[1]);
    const b = parseFloat(m[2]);
    if (!has([a / (a + b), b / (a + b), b === 0 ? NaN : a / b, a === 0 ? NaN : b / a, a, b, -a, -b])) flag(m[0]);
  }

  // 2) RADICAL / FRACTION value expressions `[coef]√n [/ term]` or `a/b` — evaluated and consumed
  //    WHOLE (the value the parser lowers to is what must be accounted, not the raw digits).
  const RAD = String.raw`√\s*\d+(?:\.\d+)?`;
  const TERM = String.raw`(?:\d+(?:\.\d+)?\s*[*·]?\s*)?${RAD}|\d+(?:\.\d+)?`;
  const evalTerm = (t: string): number => {
    const r = t.trim().match(/^(?:(\d+(?:\.\d+)?)\s*[*·]?\s*)?√\s*(\d+(?:\.\d+)?)$/);
    if (!r) return parseFloat(t);
    return (r[1] ? parseFloat(r[1]) : 1) * Math.sqrt(parseFloat(r[2]));
  };
  for (const m of s.matchAll(new RegExp(`(${TERM})(?:\\s*/\\s*(${TERM}))?`, 'g'))) {
    if (!/√|\//.test(m[0])) continue; // a bare number → the single-number pass below (with its own lowering candidates)
    const i = m.index!;
    if (inSpan(i)) continue;
    spans.push([i, i + m[0].length]);
    const num = evalTerm(m[1]);
    const den = m[2] !== undefined ? evalTerm(m[2]) : 1;
    const val = den !== 0 ? num / den : num;
    if (!has([val, -val, num, den])) flag(m[0]);
  }

  // 3) bare numbers — accounted directly or via a standard lowering: a signed coordinate (−n), a
  //    π-size (n·π — volumes/areas of revolution solids), a glued ratio coefficient (`AK = 2KA'`
  //    → t = n/(n+1) or 1/(n+1)), a divided symbol (`k/6` → 1/n), a percent (n/100), or a degree
  //    value a rule lowered trigonometrically (cos/sin of n°).
  for (const m of s.matchAll(/\d+(?:\.\d+)?/g)) {
    const i = m.index!;
    if (inSpan(i)) continue;
    const n = parseFloat(m[0]);
    const cands = [
      n,
      -n,
      n * Math.PI,
      n / (n + 1),
      1 / (n + 1),
      n === 0 ? NaN : 1 / n,
      n / 100,
      Math.cos((n * Math.PI) / 180),
      Math.sin((n * Math.PI) / 180),
    ];
    if (!has(cands)) flag(m[0]);
  }
  return dropped;
}

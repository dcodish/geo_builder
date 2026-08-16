/**
 * The rule list — normalized text → constraints, with a SPAN CLAIM for everything consumed.
 *
 * Ordered, first match wins. Every rule composes from `lexicon` atoms and spells no fragment inline
 * ([ADR-CX-009](../../docs/06d-decisions-complex.md#adr-cx-009) §4), and every rule returns the range
 * it claimed so the accountant can refuse a parse that quietly dropped half the line — there is no
 * `dropped*` gate here and there never will be (§2).
 *
 * The families implemented are the ones the S3 bridge covered, so this replaces it rather than
 * sitting beside it: F1 declarations · F2 value definitions · F3 modulus relations · F4 argument
 * relations · F5 quadrant givens · F8 `Xⁿ = expr` equations. The rest of docs/27 §10 and §10b grows
 * against this same shape.
 */

import { type Expr, abs, ref } from '../model/expr';
import type { BranchFilter, Constraint } from '../model/constraint';
import { rat } from '../value/rational';
import { isComplexName, parseExpr } from './exprParse';
import { ARG_KW, NAME, ORDINALS, QUADRANT_KW, rx } from './lexicon';
import { normalize } from './normalize';
import { type Claim, claimAll, unaccountedText } from './span';

export interface ParsedLine {
  readonly constraints: Constraint[];
  readonly filters: BranchFilter[];
  /** names the line brings into existence, whether or not a constraint mentions them */
  readonly declares: string[];
  readonly claims: Claim[];
}

export type ParseOutcome =
  | { readonly ok: true; readonly line: ParsedLine; readonly normalized: string }
  /** the grammar recognised nothing — the seam where the LLM fallback escalates */
  | { readonly ok: false; readonly reason: 'not-handled'; readonly normalized: string }
  /** a rule matched but left part of the student's line unclaimed — never committed */
  | {
      readonly ok: false;
      readonly reason: 'unaccounted';
      readonly normalized: string;
      readonly items: string[];
    };

const empty = (): ParsedLine => ({ constraints: [], filters: [], declares: [], claims: [] });

type Rule = (s: string) => ParsedLine | null;

/** F1 — a bare name declares a number. `z1` on its own line is a legitimate given. */
const declaration: Rule = (s) => {
  const m = s.match(rx(`^(${NAME})$`));
  if (!m) return null;
  const name = m[1].toLowerCase();
  if (!isComplexName(name)) return null; // a bare parameter declares nothing to draw
  return { ...empty(), declares: [name], claims: [claimAll(s)] };
};

/** F5 — «z1 ברביע הראשון» / «z1 in the first quadrant». A filter, never a driver. */
const quadrantGiven: Rule = (s) => {
  // The two languages order the noun and the ordinal differently — «ברביע הראשון» against «in the
  // first quadrant» — so the rule requires BOTH to be present in the tail rather than fixing a word
  // order. Spelling one order would refuse half the register: the ADR-3D-145 class.
  const m = s.match(rx(`^(${NAME})\\s+(.*)$`));
  if (!m) return null;
  const tail = m[2];
  const tailAt = s.length - tail.length;
  const kw = tail.match(rx(QUADRANT_KW));
  if (!kw) return null;
  const name = m[1].toLowerCase();
  const found = ORDINALS.find(([re]) => re.test(tail));
  if (!found) return null;
  const ord = tail.match(found[0]);
  if (!ord) return null;
  // Claim ONLY what was understood: the name, the noun, the ordinal. Claiming the whole line would
  // let «z1 ברביע הראשון ומקבילית» through with the last word silently dropped — which is precisely
  // what the accountant exists to refuse, and it caught this rule doing it.
  return {
    ...empty(),
    declares: [name],
    filters: [{ kind: 'quadrant', name, q: found[1] }],
    claims: [
      { start: 0, end: m[1].length },
      { start: tailAt + (kw.index ?? 0), end: tailAt + (kw.index ?? 0) + kw[0].length },
      { start: tailAt + (ord.index ?? 0), end: tailAt + (ord.index ?? 0) + ord[0].length },
    ],
  };
};

/**
 * F4 — an ARGUMENT relation: `arg z1 - arg z2 = 90`, `arg z1 = 45`.
 *
 * Emitted as an argument-only constraint, because a direction given says nothing about magnitude —
 * writing it as a full equation would invent the half the student did not state (ADR-052).
 */
const argumentRelation: Rule = (s) => {
  const two = s.match(rx(`^${ARG_KW}\\s*(${NAME})\\s*([+-])\\s*${ARG_KW}\\s*(${NAME})\\s*=\\s*(-?\\d+)$`));
  if (two) {
    const [, a, sign, b, deg] = two;
    if (sign === '-') {
      return {
        ...empty(),
        declares: [a.toLowerCase(), b.toLowerCase()],
        constraints: [
          { kind: 'arg', lhs: ref(a.toLowerCase()), rhs: ref(b.toLowerCase()), deltaTurns: rat(Number(deg), 360), src: s },
        ],
        claims: [claimAll(s)],
      };
    }
    // arg a + arg b = c  ⟺  arg(a) − arg(conj b) = c
    return {
      ...empty(),
      declares: [a.toLowerCase(), b.toLowerCase()],
      constraints: [
        {
          kind: 'arg',
          lhs: ref(a.toLowerCase()),
          rhs: { t: 'conj', e: ref(b.toLowerCase()) },
          deltaTurns: rat(Number(deg), 360),
          src: s,
        },
      ],
      claims: [claimAll(s)],
    };
  }
  const one = s.match(rx(`^${ARG_KW}\\s*(${NAME})\\s*=\\s*(-?\\d+)$`));
  if (!one) return null;
  const name = one[1].toLowerCase();
  return {
    ...empty(),
    declares: [name],
    constraints: [{ kind: 'arg', lhs: ref(name), rhs: { t: 'num', v: rat(1) }, deltaTurns: rat(Number(one[2]), 360), src: s },
    ],
    claims: [claimAll(s)],
  };
};

/**
 * F2 / F3 / F8 — an EQUATION between two expressions.
 *
 * One sentence form, and the engine decides what it means: both sides wrapped in `|·|` is a magnitude
 * relation (modulus row only), anything else is a complex equation (both rows). That is docs/27 §10's
 * P1 — one form, driveOrCheck decides — so a magnitude given and a magnitude claim are never two
 * phrasings.
 */
const equation: Rule = (s) => {
  const eq = s.indexOf('=');
  if (eq < 0) return null;
  const lhs = parseExpr(s, 0, eq);
  const rhs = parseExpr(s, eq + 1, s.length);
  if (!lhs || !rhs) return null;
  const modulusOnly = lhs.t === 'abs' || rhs.t === 'abs';
  return {
    ...empty(),
    declares: refNames(lhs).concat(refNames(rhs)),
    constraints: [
      modulusOnly
        ? { kind: 'mod', lhs: lhs.t === 'abs' ? lhs : abs(lhs), rhs: rhs.t === 'abs' ? rhs : abs(rhs), src: s }
        : { lhs, rhs, src: s },
    ],
    claims: [claimAll(s)],
  };
};

function refNames(e: Expr): string[] {
  const out: string[] = [];
  const walk = (x: Expr): void => {
    switch (x.t) {
      case 'ref':
        out.push(x.name);
        return;
      case 'add':
      case 'sub':
      case 'mul':
      case 'div':
        walk(x.l);
        walk(x.r);
        return;
      case 'pow':
        walk(x.base);
        return;
      case 'conj':
      case 'neg':
      case 'abs':
        walk(x.e);
        return;
      default:
        return;
    }
  };
  walk(e);
  return out;
}

/** First match wins. Order is specific-to-general: a relation sentence before the bare equation. */
export const RULES: readonly { readonly name: string; readonly rule: Rule }[] = [
  { name: 'declaration', rule: declaration },
  { name: 'quadrant', rule: quadrantGiven },
  { name: 'argument-relation', rule: argumentRelation },
  { name: 'equation', rule: equation },
];

/**
 * Parse one line.
 *
 * A rule that matches but leaves content unclaimed does NOT commit — the line is refused with the
 * student's own words, which is the whole point of the accountant. `not-handled` is reserved for
 * "no rule recognised this", and is the only outcome that escalates.
 */
export function parseLineV2(raw: string): ParseOutcome {
  const normalized = normalize(raw);
  if (!normalized) return { ok: false, reason: 'not-handled', normalized };
  for (const { rule } of RULES) {
    const line = rule(normalized);
    if (!line) continue;
    const items = unaccountedText(normalized, line.claims);
    if (items.length) return { ok: false, reason: 'unaccounted', normalized, items };
    return { ok: true, line, normalized };
  }
  return { ok: false, reason: 'not-handled', normalized };
}

/**
 * #1904 item B′ ([ADR-3D-317](../../docs/06b-decisions-3d.md#adr-3d-317)) — A ROLE WORD THE READING NEVER READ, in 3-D.
 *
 * The word sibling of #1888's label member (`unreadParts3`), over the shell's word class (`readWords`,
 * ADR-W-120 / ADR-604); the port of 2-D's `unreadRoles`. Both statement seams reach it, on the deterministic lane.
 *
 * WHAT WENT WRONG. «משולש ABC» · «AD תיכון לצלע BC שהוא גם גובה» recorded the median alone: 3-D's median rule
 * fires on «תיכון» and looks at nothing else, every LABEL is read, and `droppedConstructNoun3` accounts «גובה»
 * and «תיכון» together by family presence. 25 measured lines dropped a role green this way — the median winning
 * over «…שהוא גם גובה / חוצה זווית / אנך / מאונך ל-BC», «…ו-AD גובה», «…שמאונך לה», and three English lines.
 *
 * THE CHECK. Each cevian role word (`CEVIAN_NOUNS3_HE` / `_EN`, the members of 3-D's `CONSTRUCT_NOUNS`), the
 * bisect verb stem, and the ⟂ words (`PERP_WORDS3`: 3-D has no verb gate, so ⟂ belongs here; «ניצב» is left out,
 * it is also the leg noun) is DELETED with its clitics and the line re-read with `parse3`: an occurrence the
 * lowering does not depend on was not read.
 *
 * THE REFUSAL TEACHES (operator ruling W22, 2026-10-08): «…כתבו כל תפקיד בשורה נפרדת: «AD תיכון לצלע BC», ואחר כך
 * «AD גובה לצלע BC».» — the student's segment, the side the reading found and the student's roles in order, the
 * taught lines PROVED to record on this figure first (a taught remedy is a hypothesis). A line it cannot prove,
 * a bare verb («שחוצה את …») or a ⟂ word gets the shared parts message, cut before the later role word.
 */
import { parse3, CEVIAN_NOUNS3_EN, CEVIAN_NOUNS3_HE, PERP_WORDS3 } from '../parser/parse3';
import type { Command3 } from '../engine/types';
import { labelRuns, readWords, type Occurrence, type Reader } from '../../shell/readExtent';
import { LABEL3, LABEL_RUN3 } from './unreadParts3';

/** A role; `verb` is a bare bisect verb, `perp` a ⟂ word — neither names a cevian line to teach. */
type Role = 'altitude' | 'median' | 'bisector' | 'verb' | 'perp';

const isHe = (w: string) => /[א-ת]/.test(w);
const PERP_HE = PERP_WORDS3.split('|').filter(isHe).join('|');
const PERP_EN = PERP_WORDS3.split('|').filter((w) => /^[a-z]/i.test(w)).join('|');
/** One role word with its clitics: Hebrew prefixes and the article; English articles. Nouns before the bare verb stem. */
const HE_ROLE = String.raw`(?<![א-ת])[ובלכשמ]{0,2}ה?(${CEVIAN_NOUNS3_HE}|חוצ[א-ת]*|${PERP_HE})(?![א-ת])`;
const EN_ROLE = String.raw`(?<![A-Za-z])(?:the\s+|an?\s+)?(?:angle\s+)?(${CEVIAN_NOUNS3_EN}|${PERP_EN})(?![A-Za-z])`;
const roleMatcher = (): RegExp => new RegExp(`(?:${HE_ROLE})|(?:${EN_ROLE})`, 'gi');

const roleOf = (word: string): Role =>
  /גוב|גבה|altitude|height/i.test(word)
    ? 'altitude'
    : /תיכו|median/i.test(word)
      ? 'median'
      : /זו?וית|bisector/i.test(word)
        ? 'bisector'
        : /מאונ|אנ[כך]|perpendicular/i.test(word)
          ? 'perp'
          : 'verb';

const key = (cmds: readonly Command3[]): string => JSON.stringify(cmds);
const reader3: Reader<string> = {
  read: (text) => {
    const r = parse3(text);
    return r.ok && r.commands.length > 0 ? key(r.commands) : null;
  },
  same: (a, b) => a === b,
};

export interface RoleReport3 {
  /** the role words no reading depends on, as typed */
  readonly unread: readonly Occurrence[];
  /** every role the line states, in order of first appearance */
  readonly roles: readonly Role[];
}

/** The member. Null when the reading reads every role word the student typed (or the lowering is not this line's own reading). */
export function unreadRoles3(utterance: string, commands: readonly Command3[]): RoleReport3 | null {
  if (!roleMatcher().test(utterance)) return null;
  const lowering = key(commands);
  if (reader3.read(utterance) !== lowering) return null; // the #866 repair's rebuilt sentence: nothing to compare with
  const occ = readWords(utterance, lowering, reader3, roleMatcher(), roleOf);
  if (occ.unread.length === 0) return null;
  const all = [...occ.read, ...occ.unread, ...occ.exempt].sort((a, b) => a.at - b.at);
  return { unread: occ.unread, roles: [...new Set(all.map((o) => o.parts[0] as Role))] };
}

const TAUGHT: Record<'he' | 'en', Record<'altitude' | 'median' | 'bisector', (seg: string, apex: string, side: string) => string>> = {
  he: {
    altitude: (s, _a, side) => `${s} גובה לצלע ${side}`,
    median: (s, _a, side) => `${s} תיכון לצלע ${side}`,
    bisector: (s, a) => `${s} חוצה זווית ${a}`,
  },
  en: {
    altitude: (s, _a, side) => `${s} is the altitude to ${side}`,
    median: (s, _a, side) => `${s} is the median to ${side}`,
    bisector: (s, a) => `${s} is the bisector of angle ${a}`,
  },
};

/** The refusal of a lost role, as a 3-D store error (2-D's `lostRoleNote`, ported: the same decision, 2-D's text). */
export type LostRole3 = { code: 'split-roles'; first: string; second: string } | { code: 'split-statements'; all: string };

/**
 * W22: one line per role, the student's segment and the side the reading found, PROVED by `proves` (the real
 * submit decision, line after line, on this figure) — else the parts message, the line cut before the later role
 * word (moved back over its connective: «AD תיכון לצלע BC | שהוא גם גובה»). Null when there is no second part.
 */
export function lostRole3(utterance: string, commands: readonly Command3[], report: RoleReport3, proves: (lines: string[]) => boolean): LostRole3 | null {
  const seg = labelRuns(utterance, LABEL_RUN3, LABEL3).find((o) => o.parts.length === 2);
  const roles = report.roles;
  if (seg && roles.length === 2 && roles.every((r) => r === 'altitude' || r === 'median' || r === 'bisector')) {
    const [apex, foot] = seg.parts;
    const side = sideOf(commands, apex, foot);
    if (side) {
      const lines = roles.map((r) => TAUGHT[isHe(utterance) ? 'he' : 'en'][r as 'altitude'](seg.text, apex, side));
      if (proves(lines)) return { code: 'split-roles', first: lines[0], second: lines[1] };
    }
  }
  const parts = cutBeforeLaterRole(utterance);
  return parts ? { code: 'split-statements', all: parts.map((p, i) => `(${i + 1}) ${p}`).join('  ') } : null;
}

/** The side the cevian meets, from the reading: a command's two endpoints that are neither the apex nor the foot. */
function sideOf(commands: readonly Command3[], apex: string, foot: string): string | null {
  const one = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]\d*'*$/.test(v);
  for (const c of commands as unknown as Record<string, unknown>[]) {
    const [p, q] = [c.a, c.b];
    if (one(p) && one(q) && ![apex, foot].includes(p) && ![apex, foot].includes(q)) return `${p}${q}`;
  }
  return null;
}

/** The parts: cut before the second role word, moved back over the connective words before it (no label, no number, no role word). */
function cutBeforeLaterRole(utterance: string): [string, string] | null {
  const words = [...utterance.matchAll(roleMatcher())];
  if (words.length < 2) return null;
  let cut = words[1].index! + (words[1][0].length - words[1][0].trimStart().length);
  const tokens = [...utterance.slice(0, cut).matchAll(/\S+/g)];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i][0];
    if (/[A-Z]|\d/.test(t) || new RegExp(roleMatcher().source, 'i').test(t)) {
      // a label run joined by «ו» / "and" is the second statement's subject («… BC | ו-AD גובה»), as the plan cuts it
      if (/^ו-?(?:[A-Z]\d*'*)+$/.test(t)) cut = tokens[i].index!;
      else if (/^(?:[A-Z]\d*'*)+$/.test(t) && /^and$/i.test(tokens[i - 1]?.[0] ?? '')) cut = tokens[i - 1].index!;
      break;
    }
    cut = tokens[i].index!;
  }
  const first = utterance.slice(0, cut).trim();
  const second = utterance.slice(cut).trim();
  return first && second ? [first, second] : null;
}

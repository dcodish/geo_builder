/**
 * #1904 ([ADR-604](../../docs/06-decisions.md#adr-604)) — A ROLE WORD THE READING NEVER READ.
 *
 * The word sibling of #1888's label member (`unreadParts`), over the same shell module (`shell/readExtent.ts`,
 * the word class), in the same battery, so both 2-D commit seams have it.
 *
 * WHAT WENT WRONG. «משולש ABC» · «AD גובה לצלע BC שהוא גם תיכון» committed `midpoint, segment`: the median rule is
 * first among the cevian rules, fires on «תיכון» anywhere in the line and looks at nothing else. Every LABEL is read,
 * so #1888's probe sees nothing; ADR-430's construct-noun gate accounts «גובה» and «תיכון» together by family
 * presence (one midpoint is "a construct"); the span accountant accounts words by vocabulary; ADR-598's clause gate
 * does not cut at «שהוא גם». The altitude was dropped green, and AD was drawn not perpendicular to BC.
 *
 * THE CHECK. Each cevian role word (`CEVIAN_NOUNS_HE` / `_EN`, ADR-430's own members, plus the bisect verb stem of
 * ADR-292's row) is DELETED with its clitics and the line re-read: an occurrence the lowering does not depend on was
 * not read. Deletion, not substitution: a sibling role word lets a higher-priority rule win, which reads as
 * "changed" (measured: «AD חוצה זווית A שהוא גם גובה» passed the swap).
 *
 * THE REFUSAL TEACHES (operator ruling W22, 2026-10-08): «…כתבו כל תפקיד בשורה נפרדת: «AD גובה לצלע BC», ואחר כך
 * «AD תיכון לצלע BC».» — the student's letters and role words filled in, each taught line PROVED to read on this
 * figure first (#1183: a taught remedy is a hypothesis). A line it cannot prove gets the shared parts message.
 */
import { augmentParseCtx, parse } from '@/parser';
import type { ParseContext } from '@/parser';
import { BISECT_KW, CEVIAN_NOUNS_EN, CEVIAN_NOUNS_HE } from '@/parser/lexicon';
import type { AnyCommand } from '@/engine';
import { labelRuns, readWords, type Occurrence, type Reader } from '../../shell/readExtent';
import { loweringKey } from './unreadParts';

/** A cevian role; `verb` is a bare bisect verb («שחוצה את …», "bisects"), whose object the word alone does not name. */
type Role = 'altitude' | 'median' | 'bisector' | 'verb';

/** One role word, with its clitics: Hebrew prefixes ו/ב/ל/כ/ש/מ and the article; English articles. */
const HE_ROLE = String.raw`(?<![א-ת])[ובלכשמ]{0,2}ה?(${CEVIAN_NOUNS_HE}|${BISECT_KW.split('|').find((x) => /[א-ת]/.test(x))}[א-ת]*)(?![א-ת])`;
const EN_ROLE = String.raw`(?<![A-Za-z])(?:the\s+|an?\s+)?(?:angle\s+)?(${CEVIAN_NOUNS_EN})(?![A-Za-z])`;
const ROLE_WORD = new RegExp(`${HE_ROLE}|${EN_ROLE}`, 'gi');
/** The role a word names — searched, not anchored: an English match arrives with its article («the altitude»). */
const roleOf = (word: string): Role =>
  /גוב|גבה|altitude|height/i.test(word) ? 'altitude' : /תיכו|median/i.test(word) ? 'median' : /זו?וית|bisector/i.test(word) ? 'bisector' : 'verb';

/** The reader in a context: the lowering key of a successful parse, null otherwise. */
const readerIn = (ctx: ParseContext): Reader<string> => ({
  read: (text) => {
    const r = parse(text, ctx);
    return r.ok && r.commands.length > 0 ? loweringKey(r.commands) : null;
  },
  same: (a, b) => a === b,
});

export interface RoleReport {
  /** the role words no reading depends on, as typed */
  unread: readonly Occurrence[];
  /** every role the line states, in order of first appearance */
  roles: Role[];
  /** what was left unread, in the student's words */
  items: string[];
}

/** Every role-word occurrence (a Hebrew word in group 1; an English one is classed from its whole match). */
function roleMatcher(): RegExp {
  return new RegExp(`(?:${HE_ROLE})|(?:${EN_ROLE})`, 'gi');
}

/** The member. Null when the reading reads every role word the student typed. */
export function unreadRoles(utterance: string, commands: readonly AnyCommand[], ctx: ParseContext): RoleReport | null {
  if (!ROLE_WORD.test(utterance)) return null;
  ROLE_WORD.lastIndex = 0;
  const occ = readWords(utterance, loweringKey(commands), readerIn(ctx), roleMatcher(), roleOf);
  if (occ.unread.length === 0) return null;
  const all = [...occ.read, ...occ.unread, ...occ.exempt].sort((a, b) => a.at - b.at);
  const roles = [...new Set(all.map((o) => o.parts[0] as Role))];
  return { unread: occ.unread, roles, items: occ.unread.map((o) => o.text) };
}

const TAUGHT: Record<'he' | 'en', Record<Exclude<Role, 'verb'>, (seg: string, apex: string, side: string) => string>> = {
  he: {
    altitude: (s, _a, side) => `${s} גובה לצלע ${side}`,
    median: (s, _a, side) => `${s} תיכון לצלע ${side}`,
    bisector: (s, a) => `${s} חוצה זווית ${a}`,
  },
  en: {
    altitude: (s, _a, side) => `${s} altitude to ${side}`,
    median: (s, _a, side) => `${s} median to ${side}`,
    bisector: (s, a) => `${s} bisector of angle ${a}`,
  },
};

/**
 * The refusal a lost role gets. W22: one line per role, the student's segment and the side its reading found, each
 * line proved to read on this figure in turn — else the shared parts message, the line cut before the later role
 * word (moved back over its connective: «AD גובה לצלע BC | שהוא גם תיכון»).
 */
export function lostRoleNote(utterance: string, commands: readonly AnyCommand[], report: RoleReport, ctx: ParseContext): { key: string; params: Record<string, string> } | null {
  const seg = labelRuns(utterance).find((o) => o.parts.length === 2);
  // a bare bisect verb names no angle («חוצה את BC» bisects a SIDE): only noun roles are taught
  if (seg && report.roles.length === 2 && !report.roles.includes('verb')) {
    const [apex, foot] = seg.parts;
    const side = sideOf(commands, apex, foot, ctx);
    if (side) {
      const lang = /[א-ת]/.test(utterance) ? 'he' : 'en';
      const lines = report.roles.map((r) => TAUGHT[lang][r as Exclude<Role, 'verb'>](seg.text, apex, side));
      let cur = ctx;
      const proved = lines.every((l) => {
        const r = parse(l, cur);
        if (!r.ok || r.commands.length === 0) return false;
        cur = augmentParseCtx(cur, r.commands);
        return true;
      });
      if (proved) return { key: 'input.scope.split-roles', params: { first: lines[0], second: lines[1] } };
    }
  }
  const parts = cutBeforeLaterRole(utterance);
  return parts ? { key: 'input.scope.split-statements', params: { first: parts[0], second: parts[1], all: parts.map((p, i) => `(${i + 1}) ${p}`).join('  ') } } : null;
}

/** The side the cevian meets, from the reading (a foot's or midpoint's endpoints, a bisector's rays), else the figure's triangle. */
function sideOf(commands: readonly AnyCommand[], apex: string, foot: string, ctx: ParseContext): string | null {
  const one = (v: unknown) => typeof v === 'string' && /^[A-Z]\d*$/.test(v);
  for (const c of commands as unknown as Record<string, unknown>[]) {
    for (const [x, y] of [['a', 'b'], ['p', 'q']] as const) {
      const [P, Q] = [c[x], c[y]];
      if (one(P) && one(Q) && ![apex, foot].includes(P as string) && ![apex, foot].includes(Q as string)) return `${P}${Q}`;
    }
  }
  const tri = (ctx.polygons ?? []).filter((p) => p.length === 3 && p.includes(apex));
  return tri.length === 1 ? tri[0].filter((v) => v !== apex).join('') : null;
}

/** The parts: cut before the second role word, moved back over the connective words before it (no label, no number, no role word). */
function cutBeforeLaterRole(utterance: string): [string, string] | null {
  const words = [...utterance.matchAll(roleMatcher())];
  if (words.length < 2) return null;
  let cut = words[1].index! + (words[1][0].length - words[1][0].trimStart().length);
  const before = utterance.slice(0, cut);
  const tokens = [...before.matchAll(/\S+/g)];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i][0];
    if (/[A-Z]|\d/.test(t) || new RegExp(roleMatcher().source, 'i').test(t)) break;
    cut = tokens[i].index!;
  }
  const first = utterance.slice(0, cut).trim();
  const second = utterance.slice(cut).trim();
  return first && second ? [first, second] : null;
}

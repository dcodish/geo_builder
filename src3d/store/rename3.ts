/**
 * RENAME A POINT LETTER (#578, ADR-3D-211) — the pure fact-list core.
 *
 * A rename is a **rewrite of history**, not a fact and not a parser command: the ordered fact list stays
 * the source of truth, and every id the student ever typed is replaced wherever it occurs, so replay is
 * byte-for-byte what it would have been had they typed the new letter from the start. This mirrors the
 * 2-D mechanism (`renameFacts`, #539) — the PATTERN is copied, never imported: docs/20 §12, and
 * `BOUNDARIES.json` forbids the import outright.
 *
 * Both halves of a `Fact3` are rewritten. The utterance alone would not do: an LLM-committed fact holds
 * `cmds` its utterance never produced, so re-parsing the rewritten text would silently build something
 * else. The commands alone would not do either: the step row shows the utterance, and a row that still
 * says «E אמצע AC» after E became O is a lie about what the figure holds.
 */

import type { Command3 } from '../engine/types';
import type { Fact3 } from './store3';
import type { PlaneDisplayMode3Map } from './figureFile3';

/**
 * A 3-D point label: a capital, optional digits, optional PRIME — `A`, `B1`, `A'`, `C1'`. The prime is
 * this product's own (parse3.ts:109) and it is what makes 2-D's `(?!\d)` guard insufficient here: on a
 * cube, `A` and `A'` are two different vertices, so renaming one must never touch the other.
 */
const LABEL3 = /[A-Z]\d*'?/g;

/** A string that is nothing but labels — a single id (`A'`) or a point RUN (`ABCD`, the name a
 *  point-run plane carries and `planeDisplay` is keyed by). */
const PURE_LABELS = /^(?:[A-Z]\d*'?)+$/;

/**
 * Rewrite WHOLE label tokens `from`→`to` in one string, leaving every other character alone.
 *
 * The boundaries are the whole point:
 *  - a following lowercase letter, digit or prime means the match is a DIFFERENT token — `A` must not
 *    eat the `A` of `A'`, of `A1`, or of an English word like "Add";
 *  - a preceding lowercase letter, digit or prime, likewise;
 *  - an adjacent UPPERCASE letter is fine, because that is exactly what a run like `ABCD` is.
 *
 * `from` is interpolated into the pattern unescaped, which is safe BY THE LABEL GRAMMAR: every caller
 * passes a value through {@link normalizeLabel3}, so it matches the label grammar and carries no regex
 * metacharacter. A caller that skips that normalisation is the bug, not the escaping.
 */
export function relabelTokens3(s: string, from: string, to: string): string {
  const tail = from.endsWith("'") ? "(?![a-z0-9])" : "(?![a-z0-9'])";
  return s.replace(new RegExp(`(?<![a-z0-9'])${from}${tail}`, 'g'), to);
}

/**
 * Fields whose string value is RAW SOURCE, not ids — the equation text a plane/line was typed from. It
 * is echoed back to the student verbatim and can legitimately contain a capital that is not a point (a
 * symbolic coefficient, #339). 2-D's `expr` carve-out, same reason.
 */
const RAW_TEXT_FIELDS = new Set(['src', 'requested']);

/** Recursively map every string in a command-shaped value, skipping the raw-source fields. */
function mapStrings(v: unknown, key: string | null, f: (s: string) => string): unknown {
  if (key !== null && RAW_TEXT_FIELDS.has(key)) return v;
  if (typeof v === 'string') return f(v);
  if (Array.isArray(v)) return v.map((e) => mapStrings(e, null, f));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, mapStrings(x, k, f)]));
  }
  return v;
}

/**
 * Rewrite a label across ONE command — a recursive STRUCTURAL walk, never a per-command field list.
 * `Command3` operands nest (`{kind:'segment',a,b}`, `{kind:'plane-run',ids:[…]}`, claim structures), and
 * a command kind added later must not quietly escape the rewrite: an enumeration is not a rule
 * (`src3d/CLAUDE.md`). The label grammar is what decides what is an id, so a `kind`/`type`/`rel` value
 * (all lowercase) and a plane/line name (`π1`, `ℓ`) are untouched for free, while a point-run plane's
 * name (`"ABCD"`) is rewritten letter by letter, which is what keeps `pointPlanes` addressable.
 */
export function renameInCommand3(cmd: Command3, from: string, to: string): Command3 {
  return mapStrings(cmd, null, (s) => relabelTokens3(s, from, to)) as Command3;
}

/** Every point label the commands mention (a run contributes each of its letters). */
export function pointLabels3(cmds: readonly Command3[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, key: string | null) => {
    if (key !== null && RAW_TEXT_FIELDS.has(key)) return;
    if (typeof v === 'string') {
      if (PURE_LABELS.test(v)) for (const t of v.match(LABEL3) ?? []) out.add(t);
      return;
    }
    if (Array.isArray(v)) return void v.forEach((e) => walk(e, null));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k);
  };
  for (const c of cmds) walk(c, null);
  return out;
}

/** Why a rename did nothing — so the UI can say which, rather than silently no-op. */
export type RenameResult3 = { ok: true } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' };

/**
 * The pure core: rewrite `from`→`to` across every fact, both halves.
 *
 * `target-taken` is a refusal, not a merge: two distinct points sharing a letter is a different
 * operation (2-D's ADR-122 swap/merge territory), and doing it silently would fuse two vertices of the
 * student's figure without being asked.
 */
export function renameFacts3(
  facts: readonly Fact3[],
  from: string,
  to: string,
): { ok: true; facts: Fact3[] } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' } {
  const F = normalizeLabel3(from);
  const T = normalizeLabel3(to);
  if (!F || !T) return { ok: false, reason: 'no-source' };
  if (F === T) return { ok: false, reason: 'same' };
  const all = new Set<string>();
  for (const f of facts) for (const l of pointLabels3(f.cmds)) all.add(l);
  if (!all.has(F)) return { ok: false, reason: 'no-source' };
  if (all.has(T)) return { ok: false, reason: 'target-taken' };
  return {
    ok: true,
    facts: facts.map((f) => ({
      ...f,
      cmds: f.cmds.map((c) => renameInCommand3(c, F, T)),
      utterance: relabelTokens3(f.utterance, F, T),
    })),
  };
}

/** Upper-case a typed letter and keep a legal label; null when it is not one. */
export function normalizeLabel3(raw: string): string | null {
  const s = raw.trim().toUpperCase().replace(/[’´`]/g, "'"); // a typed curly quote is a prime
  return /^[A-Z]\d*'?$/.test(s) ? s : null;
}

/**
 * The session's other ID-KEYED state, rewritten with the facts. `planeDisplay` is keyed by the plane's
 * point RUN («ABCD») and `queries` are student-typed expressions over labels («|AB|»), so a rename that
 * skipped them would leave a display toggle addressing a plane that no longer exists and a data-panel
 * row asking about a vanished point — the figure would be right and the session around it stale.
 */
export function renamePlaneDisplay3(map: PlaneDisplayMode3Map, from: string, to: string): PlaneDisplayMode3Map {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [relabelTokens3(k, from, to), v])) as PlaneDisplayMode3Map;
}

export const renameQueries3 = (queries: readonly string[], from: string, to: string): string[] =>
  queries.map((q) => relabelTokens3(q, from, to));

/**
 * CLOSING ✅ AND 👁 WITHOUT THE OPERATOR — the pure half (#2654 step 3, ADR-W-168 §2).
 *
 * Operator, 2026-11-01: *"all look and verified items can be closed automatically without me
 * spenmding time on them."* A 🎮 case is his. Every other case closes in one of two ways:
 *
 *   - `assertion` — the spec carries checks the driver decides (page text, a refusal, a label on the
 *     canvas, a row in the givens list, a figure that changes on «הציגו תצורה אחרת»). A green drive
 *     closes it.
 *   - `blind-review` — nothing mechanical can say it (a shape, a placement). A subagent that sees
 *     ONLY the case's lines, its Look-for and its screenshots judges it. The packet below is what it
 *     receives; the fix, the plan, the issue and the session's expectation never travel with it.
 *
 * And the honesty half: about one closed case in ten is picked, deterministically, for his next
 * sitting (a SPOT AUDIT). A failed audit DEMOTES that kind of case (product × how it closed): every
 * closed case of the kind then goes to him, not one in ten, until three clean audits restore it. The
 * session still drives and closes them first, so a demoted kind is checked twice, never skipped. The ledger is a tracked file, so it travels between machines.
 */

/** The spec fields the driver decides by itself. A case carrying any of them can close on assertion. */
export const ASSERTION_KEYS = ['expect', 'expectAbsent', 'expectRefusal', 'expectFigure', 'expectRows', 'expectConfigsDiffer'];

/** Clean audits a demoted kind needs before the session may close it again. */
export const CLEAN_AUDITS_TO_RESTORE = 3;

/** The share of closed cases that go to his next sitting. */
export const AUDIT_RATE = 0.1;

export function hasAssertions(spec) {
  return ASSERTION_KEYS.some((k) => {
    const v = spec?.[k];
    return Array.isArray(v) ? v.length > 0 : Boolean(v);
  });
}

/** How a case closes, before it is driven: `operator` (🎮), or the session's `assertion` / `blind-review`. */
export function closureMethod(spec) {
  if (spec.class === 'play') return 'operator';
  return hasAssertions(spec) ? 'assertion' : 'blind-review';
}

/** The KIND an audit judges: which builder, and how the case was closed. */
export function kindOf(spec) {
  return `${spec.product}:${closureMethod(spec)}`;
}

/**
 * Where one driven case stands. `problems` is `caseVerdict`'s list; `review` is the blind reviewer's
 * answer for this case, when there is one ({ pass, saw }).
 */
export function closureOf(spec, problems, review) {
  if (problems.length) return { state: 'red', method: closureMethod(spec) };
  const method = closureMethod(spec);
  if (method === 'operator') return { state: 'operator', method };
  if (method === 'assertion') return { state: 'closed', method };
  if (!review) return { state: 'awaiting-review', method };
  return review.pass ? { state: 'closed', method, saw: review.saw } : { state: 'red', method, saw: review.saw };
}

/**
 * The packet a blind reviewer receives. Deliberately NOT carried: `title` (sessions write the fix into
 * it), `issue`, `_note`, `_probe`, `before`'s claim about what changed, and any expectation field.
 */
export function reviewPacket(spec, shotPaths) {
  return {
    id: spec.id,
    product: spec.product,
    lines: spec.lines,
    ...(spec.asks ? { asks: spec.asks } : {}),
    ...(spec.after ? { after: spec.after } : {}),
    ...(spec.cycles ? { cycles: spec.cycles } : {}),
    lookFor: spec.lookFor,
    screenshots: shotPaths,
  };
}

/** The brief every blind reviewer gets, ahead of its packets. */
export const REVIEW_BRIEF = `You are checking screenshots of a geometry teaching tool, as a careful student-facing tester.
For each case you get only: the lines a student typed (Hebrew, one per line), what to look for, and the screenshots taken after typing them.
You are not told what was changed or why. Judge only what the screenshots show against "lookFor".
Answer per case: {"id", "pass": true|false, "saw": "<one sentence: what the screenshot shows that decides it>"}.
Fail when the screenshot does not clearly show what lookFor asks, when something on the figure contradicts the typed lines, or when the screenshot is unreadable. When unsure, fail: a fail costs a second look, a wrong pass reaches a student.`;

/** A stable 32-bit hash (FNV-1a), so the audit pick is the same on every machine and every re-run. */
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Pick the spot audits among the CLOSED cases of one sheet: every case of a demoted kind, plus about
 * `rate` of the rest (at least one when any closed), ranked by a hash of sheet name and case id, so
 * the pick is deterministic and not the session's choice.
 */
export function pickSpotAudits(sheetName, closedSpecs, ledger = emptyLedger(), rate = AUDIT_RATE) {
  const demoted = ledger.demoted ?? {};
  const forced = closedSpecs.filter((s) => kindOf(s) in demoted);
  const rest = closedSpecs.filter((s) => !(kindOf(s) in demoted));
  if (!rest.length) return forced;
  const n = Math.max(1, Math.round(rest.length * rate));
  return [...forced, ...[...rest].sort((a, b) => hash(`${sheetName}:${a.id}`) - hash(`${sheetName}:${b.id}`)).slice(0, n)];
}

export function emptyLedger() {
  return { pending: [], results: [], demoted: {} };
}

/** Queue audits for his next sitting; a case already pending is not queued twice. */
export function queueAudits(ledger, sheetName, specs, date) {
  const have = new Set(ledger.pending.map((p) => `${p.sheet}:${p.id}`));
  for (const s of specs) {
    if (have.has(`${sheetName}:${s.id}`)) continue;
    ledger.pending.push({
      sheet: sheetName,
      id: s.id,
      kind: kindOf(s),
      queued: date,
      product: s.product,
      base: s.base,
      ...(s.path ? { path: s.path } : {}),
      lines: s.lines,
      lookFor: s.lookFor,
    });
  }
  return ledger;
}

/**
 * Record his verdict on one pending audit. A fail demotes its kind (count back to 0); a pass on a
 * demoted kind counts toward restoring it, and the third clean pass restores it.
 */
export function recordAudit(ledger, sheetName, id, pass, date, note) {
  const at = ledger.pending.findIndex((p) => p.sheet === sheetName && p.id === id);
  if (at < 0) throw new Error(`no pending audit ${sheetName}:${id}`);
  const [entry] = ledger.pending.splice(at, 1);
  ledger.results.push({ ...entry, pass, date, ...(note ? { note } : {}) });
  if (!pass) ledger.demoted[entry.kind] = 0;
  else if (entry.kind in ledger.demoted) {
    ledger.demoted[entry.kind] += 1;
    if (ledger.demoted[entry.kind] >= CLEAN_AUDITS_TO_RESTORE) delete ledger.demoted[entry.kind];
  }
  return ledger;
}

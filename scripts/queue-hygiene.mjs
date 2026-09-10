/**
 * queue-hygiene — does an issue's `needs-operator` LABEL agree with its comment THREAD? (#959,
 * [ADR-W-049](../docs/06w-decisions-workspace.md))
 *
 * The structural problem this exists for: an issue BODY is written once and never revised — the ruling
 * lives in a comment (#509, #659) — so **the body of a ruled issue is guaranteed to still contain the
 * open question.** A pass that triages from the body will therefore re-apply `needs-operator` to every
 * ruled issue, forever. That happened four times, three of them on one day, each costing an operator
 * decision slot to re-establish something already decided.
 *
 * It fails in the other direction too, and worse: an issue whose LABEL says blocked and whose THREAD
 * says ruled gets its armed work skipped by a fix round.
 *
 * The fix is not "read more carefully". It is that ruled-ness becomes a QUERY. The marker already
 * exists — `/decisions` passes have been writing «## Operator ruling — DATE» and «**Ruled:** …» all
 * along ({@link RULING_MARKERS} is derived from the real corpus, not invented) — and nothing ever
 * asked. This asks.
 *
 * Run it:  node scripts/queue-hygiene.mjs            (reports both directions, exit 1 if any)
 *          node scripts/queue-hygiene.mjs --json     (machine-readable)
 *
 * The predicates below are PURE over a plain `{ labels, comments }` shape, so they are unit-tested
 * offline against fixtures; only {@link main} touches the network.
 */

/**
 * How a ruling ANNOUNCES itself, measured from the live queue rather than invented — the shapes in use
 * across #920, #943, #956, #911, #364, #370, #551:
 *
 *   «## Operator ruling — 2026-09-09 (`/decisions` pass)»      (9 occurrences)
 *   «## Operator answer — 2026-09-10: …»                       (1)
 *   «## Operator ruling (2026-08-13): **count them.**»
 *   «**Ruled: blame the LAST statement added …**»
 *   «Operator decision (2026-07-28): **accept the brief flash**»
 *
 * `answer` is in the list because RUNNING this script found its absence: #960 read as an unanswered
 * escalation while the operator had answered it that morning under a heading this file did not know.
 * A vocabulary of what passes are SUPPOSED to write is worth nothing; this one is measured from what
 * they DO write, and widening it is the expected maintenance — the alternative is a guard that quietly
 * mislabels the queue it exists to keep honest.
 *
 * Deliberately anchored to the OPERATOR: a session's own analysis comment must not read as a ruling,
 * or the guard would clear labels nobody answered. `Ruled:` is included because it is always written by
 * a pass transcribing the operator, immediately under the heading.
 */
export const RULING_MARKERS = [
  /^\s*#{1,4}\s*operator (ruling|decision|answer)\b/im,
  /\boperator (ruling|decision|answer)\s*[—\-(:]/i,
  /\*\*ruled\b/i,
];

/** Does this comment body announce an operator ruling? */
export const isRulingComment = (body) => RULING_MARKERS.some((re) => re.test(body ?? ''));

/** Every comment in the thread that announces a ruling, oldest first. */
export const rulingComments = (comments = []) => comments.filter((c) => isRulingComment(c.body));

const hasLabel = (issue, name) => (issue.labels ?? []).some((l) => (typeof l === 'string' ? l : l.name) === name);

/**
 * The two disagreements between a label and its thread. Returns `null` when they agree.
 *
 * - `stale-label` — carries `needs-operator` while the thread already holds a ruling. Costs an operator
 *   slot: they re-decide something they decided weeks ago, with nothing to distinguish it from a real
 *   question except reading the thread themselves — the work the label exists to save them.
 * - `unlabelled-question` — the thread's LAST ruling-ish activity is an ESCALATION (a fix round that hit
 *   the code and asked something new) but the label is gone. The opposite failure: a real question
 *   invisible in the queue.
 *
 * A ruling that PRE-dates the newest escalation is not stale — round #961 escalated #960 with a genuine
 * new question on an issue whose thread already held older rulings, and the operator answered it one
 * message later. So recency decides, not mere presence.
 */
export function labelThreadDisagreement(issue) {
  const comments = issue.comments ?? [];
  const lastRuling = rulingComments(comments).at(-1);
  const lastEscalation = comments.filter((c) => /^\s*#{1,4}\s*escalation\b/im.test(c.body ?? '')).at(-1);
  const idx = (c) => (c ? comments.indexOf(c) : -1);
  const ruledAfterEscalation = idx(lastRuling) > idx(lastEscalation);

  if (hasLabel(issue, 'needs-operator') && lastRuling && ruledAfterEscalation) {
    return { kind: 'stale-label', issue: issue.number, title: issue.title, evidence: firstLine(lastRuling.body) };
  }
  if (!hasLabel(issue, 'needs-operator') && lastEscalation && !ruledAfterEscalation) {
    return { kind: 'unlabelled-question', issue: issue.number, title: issue.title, evidence: firstLine(lastEscalation.body) };
  }
  return null;
}

const firstLine = (body) => (body ?? '').split('\n').find((l) => l.trim())?.trim().slice(0, 120) ?? '';

/** Every disagreement across a list of issues. */
export const auditQueue = (issues) => issues.map(labelThreadDisagreement).filter(Boolean);

// ── the only part that touches the network ────────────────────────────────────────────────────────
async function main() {
  const { execFileSync } = await import('node:child_process');
  const sh = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const list = JSON.parse(sh(['issue', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,labels']));
  const issues = [];
  for (const it of list) {
    const withComments = JSON.parse(sh(['issue', 'view', String(it.number), '--json', 'number,title,labels,comments']));
    issues.push(withComments);
  }
  const found = auditQueue(issues);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(found, null, 2));
  } else if (!found.length) {
    console.log(`queue-hygiene: ${issues.length} open issues, label and thread agree everywhere.`);
  } else {
    console.log(`queue-hygiene: ${found.length} disagreement(s) across ${issues.length} open issues\n`);
    for (const f of found) {
      const what = f.kind === 'stale-label'
        ? 'carries `needs-operator` but its thread already holds a ruling'
        : 'has an unanswered escalation but no `needs-operator`';
      console.log(`  #${f.issue} ${what}\n      ${f.title}\n      ↳ ${f.evidence}\n`);
    }
  }
  process.exitCode = found.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('queue-hygiene.mjs')) {
  await main();
}

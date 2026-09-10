/**
 * #959 ([ADR-W-049](../../docs/06w-decisions-workspace.md)) — the queue's label must agree with its
 * thread, and "has this been answered" must be a QUERY.
 *
 * Fixtures are the REAL shapes from the live queue (#956, #920, #370, #364, #551, #960), so the
 * predicate is tested against what passes actually write, not against an invented convention.
 * Offline by construction — the network half of the script is `main()`, which is not imported here.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a plain .mjs script, deliberately not part of the TS project
import { isRulingComment, rulingComments, labelThreadDisagreement, auditQueue } from '../queue-hygiene.mjs';

const c = (body: string) => ({ body });
const issue = (over: Record<string, unknown> = {}) => ({ number: 1, title: 't', labels: [], comments: [], ...over });

describe('#959 — a ruling announces itself in the shapes passes actually write', () => {
  it.each([
    ['## Operator ruling — 2026-09-09 (`/decisions` pass)\n\n**Ruled: blame the LAST statement added.**'],
    ['## Operator ruling (2026-08-13): **count them.** When the cue…'],
    ['Operator ruling — 2026-08-26 (`/decisions` pass): PARK it until demand shows up.'],
    ['Operator decision (2026-07-28): **accept the brief flash**'],
    ['Asked: how far to go.\n\n**Ruled: option A — echo the student’s own sentence.**'],
    // found by RUNNING the script, not by writing the list: #960's operator answer used this
    // heading and the first vocabulary did not know it, so a real answer read as unanswered.
    ['## Operator answer — 2026-09-10: *"i cannot reproduce this now so maybe its fixed"*'],
  ])('recognises %s', (body) => {
    expect(isRulingComment(body)).toBe(true);
  });

  it("does NOT read a session's own analysis as a ruling — that would clear a label nobody answered", () => {
    for (const body of [
      'Cross-ref: the display half of the same report is #955.',
      '## Plan correction — 2026-09-05 (`/decisions` pass). **Not a ruling; no approval implied.**',
      '## The corrected scan, RUN — 2026-09-07. **Evidence only; still not a ruling.**',
      '`auto-ok` applied per the operator’s STANDING ruling (2026-08-13, ADR-W-014 Am. 1)',
    ]) {
      expect(isRulingComment(body), body.slice(0, 40)).toBe(false);
    }
  });

  it('collects every ruling in order, so the LAST one can be compared against an escalation', () => {
    const thread = [c('noise'), c('## Operator ruling — 2026-08-13: count them'), c('more noise'), c('**Ruled: park it**')];
    expect(rulingComments(thread)).toHaveLength(2);
    expect(rulingComments(thread).at(-1)!.body).toContain('park it');
  });
});

describe('#959 — the stale label, which is the reported defect', () => {
  it('flags `needs-operator` sitting over a ruling already in the thread', () => {
    const d = labelThreadDisagreement(
      issue({
        number: 370,
        labels: [{ name: 'needs-operator' }, { name: 'P3' }],
        comments: [c('## Operator ruling (2026-08-13): **count them.**')],
      }),
    );
    expect(d).toMatchObject({ kind: 'stale-label', issue: 370 });
    expect(d.evidence, 'the operator can see WHY without opening the issue').toContain('count them');
  });

  it('says nothing when the label and the thread agree', () => {
    expect(labelThreadDisagreement(issue({ labels: [{ name: 'needs-operator' }], comments: [c('just analysis')] }))).toBeNull();
    expect(labelThreadDisagreement(issue({ labels: [{ name: 'auto-ok' }], comments: [c('## Operator ruling — x')] }))).toBeNull();
  });

  it('accepts bare string labels too (the `gh --json labels` shape varies by call)', () => {
    expect(labelThreadDisagreement(issue({ labels: ['needs-operator'], comments: [c('**Ruled: yes**')] }))).toMatchObject({ kind: 'stale-label' });
  });
});

describe('#959 — the reverse direction, and why RECENCY decides', () => {
  it('an escalation AFTER the last ruling is a genuine new question — not stale', () => {
    // Round #961 on #960: the thread already held older rulings, then a fix round hit the code and
    // asked something new. Clearing that label would have hidden a real question.
    const d = labelThreadDisagreement(
      issue({
        number: 960,
        labels: [{ name: 'needs-operator' }],
        comments: [c('## Operator ruling — 2026-09-01: do X'), c('## ESCALATION — the plan is wrong. No code kept.')],
      }),
    );
    expect(d, 'a fresh escalation keeps its label').toBeNull();
  });

  it('…and once the operator answers it, the label IS stale again', () => {
    const d = labelThreadDisagreement(
      issue({
        number: 960,
        labels: [{ name: 'needs-operator' }],
        comments: [
          c('## ESCALATION — the plan is wrong. No code kept.'),
          c('## Operator answer — 2026-09-10: cannot reproduce; narrow it.'),
          c('**Ruled: narrowed to part 1.**'),
        ],
      }),
    );
    expect(d).toMatchObject({ kind: 'stale-label' });
  });

  it('an unanswered escalation with NO label is the opposite failure — armed work skipped', () => {
    const d = labelThreadDisagreement(
      issue({ number: 42, labels: [{ name: 'auto-ok' }], comments: [c('## ESCALATION — two attempts left the gates red.')] }),
    );
    expect(d).toMatchObject({ kind: 'unlabelled-question', issue: 42 });
  });
});

describe('#959 — the queue audit', () => {
  it('reports every disagreement and nothing else', () => {
    const found = auditQueue([
      issue({ number: 1, labels: [{ name: 'needs-operator' }], comments: [c('## Operator ruling — a')] }),
      issue({ number: 2, labels: [{ name: 'auto-ok' }], comments: [c('plain analysis')] }),
      issue({ number: 3, labels: [], comments: [c('## ESCALATION — b')] }),
    ]);
    expect(found.map((f: { issue: number }) => f.issue)).toEqual([1, 3]);
  });

  it('an empty queue is clean, not an error', () => {
    expect(auditQueue([])).toEqual([]);
  });
});

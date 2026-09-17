/**
 * #1011 — A DISPLAY-ONLY COMMAND REACHES THE FIGURE.
 *
 * The submit gate decides "did this line produce anything?" from the figure: did the construction grow,
 * did a DOF go, did the scale become fixed, did something move. A command whose whole job is to make
 * something VISIBLE answers no to all of them and has still done exactly what the student asked. The
 * gate handled that by enumeration — `name-center || show-circle`, each added when its own feature was
 * found broken in play — and `mark-angle` was never added.
 *
 * ## This file drives the REAL SUBMIT GATE, and that is the point
 *
 * The defect reached play precisely because #248's lock drove `store.execute(...)` directly and never
 * crossed `dryRunOutcome`. A display feature validated below the gate is a display feature whose gate is
 * untested, so every case here goes through `parse → dryRunOutcome`, which is what the app calls.
 *
 * ## A note on the witness
 *
 * #1011 was filed against PR #1008's branch, and **that PR was closed without merging** — so its
 * headline utterance («זוית ABC») does not parse on `main` at all. The CLASS is untouched by that: the
 * valueless CENTRAL angle lowers to the same `mark-angle`, and on a figure whose two radii already exist
 * it was swallowed identically. That is the witness used here, measured on `main` before the fix:
 * `{produced: false, reason: 'empty'}`.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, trialFacts, dryRunOutcome } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { DISPLAY_ONLY, freeDofCount } from '@/engine';

/** Build a fact list through the real parse-with-context path. */
function build(lines: string[]): { facts: Fact[]; fig: ReturnType<typeof replay> } {
  let facts: Fact[] = [];
  let fig = replay([], 0);
  for (const u of lines) {
    const pctx = buildParseCtx(fig.construction, fig.positions);
    const r = parse(u, pctx);
    expect(r.ok, `setup parses: ${u}`).toBe(true);
    if (!r.ok) continue;
    facts = trialFacts(facts, r.commands);
    fig = replay(facts, 0);
  }
  return { facts, fig };
}

/** What the APP would decide about `line` on the figure `setup` builds. */
function submit(setup: string[], line: string) {
  const { facts, fig } = build(setup);
  const pctx = buildParseCtx(fig.construction, fig.positions);
  const r = parse(line, pctx);
  expect(r.ok, `parses: ${line}`).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  return { facts, before: fig, commands: r.commands, outcome: dryRunOutcome(facts, r.commands, 0) };
}

/** A circle with two points on it, and both radii already drawn — the arms the mark needs. */
const ARMS_DRAWN = ['מעגל O', 'A על מעגל O', 'B על מעגל O', 'הקטע OA', 'הקטע OB'];
/** The same figure with the radii NOT drawn — the case that always worked, because the segments grew. */
const ARMS_NEW = ['מעגל O', 'A על מעגל O', 'B על מעגל O'];

describe('#1011 — the display-only class', () => {
  /**
   * THE DECLARED PROPERTY, not a list in the gate.
   *
   * Asserted on the exported set rather than on behaviour, because the whole fix is that membership is
   * declared beside the command union where a new command is written — so a future display command is
   * added by the person who writes it rather than discovered by a student.
   */
  it('the three members are declared, together', () => {
    expect([...DISPLAY_ONLY].sort()).toEqual(['mark-angle', 'name-center', 'show-circle']);
  });

  /** The reported class, at the gate the app actually consults. */
  it('a valueless central angle COMMITS when its arms are already drawn', () => {
    const { outcome, commands } = submit(ARMS_DRAWN, 'זוית מרכזית AOB');
    expect(commands.map((c) => c.type)).toEqual(['segment', 'segment', 'mark-angle']);
    expect(outcome.produced, `${outcome.produced ? '' : outcome.reason}`).toBe(true);
  });

  it('…and still commits when its arms are NEW (the case that always worked)', () => {
    expect(submit(ARMS_NEW, 'זוית מרכזית AOB').outcome.produced).toBe(true);
  });

  /**
   * THE MARK STATES NOTHING — the DOF-neutrality row, kept from #1008's own lock.
   *
   * It is what makes this a display command rather than a given: committing it must not remove a degree
   * of freedom, or the tool has quietly asserted an angle the student never gave (ADR-052).
   */
  it('committing the mark asserts NOTHING — the DOF count is unchanged', () => {
    const { facts, before, commands } = submit(ARMS_DRAWN, 'זוית מרכזית AOB');
    const after = replay(trialFacts(facts, commands), 0);
    expect(freeDofCount(after.construction)).toBe(freeDofCount(before.construction));
    expect(after.construction.constraints.length).toBe(before.construction.constraints.length);
  });

  /**
   * AN EXACT RE-STATEMENT IS STILL A FRIENDLY NO-OP.
   *
   * The counter-direction guard: a display command that produced unconditionally would draw a second
   * identical arc every time the student re-typed the line, and «כבר קיים באיור» is the honest answer
   * there. The duplicate exclusion mirrors `dataOnly`'s, which has always had it.
   */
  it('saying the same mark twice is «already there», not a second arc', () => {
    const { facts, fig } = build(ARMS_DRAWN);
    const pctx = buildParseCtx(fig.construction, fig.positions);
    const first = parse('זוית מרכזית AOB', pctx);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(dryRunOutcome(facts, first.commands, 0).produced).toBe(true);

    const committed = trialFacts(facts, first.commands);
    const fig2 = replay(committed, 0);
    const again = parse('זוית מרכזית AOB', buildParseCtx(fig2.construction, fig2.positions));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const out = dryRunOutcome(committed, again.commands, 0);
    expect(out.produced).toBe(false);
    // `StepOutcome` is a discriminated union — the reason exists only on the negative arm.
    if (!out.produced) expect(out.reason).toBe('empty');
  });

  /**
   * A VALUE makes it a GIVEN, not a display command — it must commit for its own reason (it constrains),
   * and it must keep doing so. The two readings share a parser rule, so a change to one can reach both.
   */
  it('the same utterance WITH a value is a given, and commits as one', () => {
    const { outcome, commands } = submit(ARMS_DRAWN, 'זוית מרכזית AOB = 80');
    expect(commands.map((c) => c.type)).toEqual(['segment', 'segment', 'set-angle']);
    expect(outcome.produced).toBe(true);
  });

  /** The two older members keep working — they are why the enumeration existed. */
  it('name-center still produces', () => {
    expect(submit(['מעגל O', 'A על מעגל O'], 'O הוא מרכז המעגל').outcome.produced).toBe(true);
  });
});

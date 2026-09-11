/**
 * #866 (ADR-3D-239) — «AD חוצה את זווית A»: the bisected angle named by its VERTEX alone.
 *
 * The fifth of #343's bisector frames, and the one that needed a ruling rather than code. In 2-D a
 * vertex usually carries exactly two edges, so ADR-164 resolves «זווית A» from the figure. In 3-D it
 * usually does not — a pyramid apex has three or more, a box vertex three — so the sentence names one
 * of several angles, and picking one would draw a bisector of the WRONG angle with a green ✓: the
 * silent-wrong-ink class that can never appear in the prod logs as a failure.
 *
 * **Operator ruling, 2026-09-02 (playing PR #867):** *"error message specifically here should be that
 * there is more than one A angle so user should specify which. current message should be used when the
 * tool doesnt support the command — not when it's not fully defined."* So the frame is UNDER-SPECIFIED,
 * not unsupported: it must be RECOGNISED and must surface a typed ambiguity naming the candidates, and
 * it must not borrow the scope register's "not supported here" voice. Measured before the fix, the line
 * reached no register at all — `parse3` returned `not-handled`, `classifyGuidance3` returned null, and
 * the store said `not-understood`, so it escalated to the PAID model. Both halves needed building.
 *
 * **The one-candidate case is why this is not simply "always ask".** On «משולש ABC» exactly one angle
 * meets at A, so the clarification's own sentence — "more than one angle meets at A" — would be FALSE.
 * A vertex with one angle is not ambiguous, and resolving it is not a guess. So: one candidate resolves,
 * two or more ask. That is also the recommendation recorded when the issue was armed (*"ask whenever the
 * vertex carries three or more incident edges"*).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { classifyGuidance3 } from '../parser/scope3';
import { useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (lines: string[]) => {
  reset();
  for (const l of lines) useGeo3.getState().submit(l);
  return useGeo3.getState();
};

beforeEach(reset);

describe('#866 — the frame is RECOGNISED, in every spelling the supported form has', () => {
  it.each([
    ['bare', 'AD חוצה זווית A'],
    ['with את', 'AD חוצה את זווית A'],
    ['definite', 'AD חוצה את הזווית A'],
    ['English bisects', 'AD bisects angle A'],
    ['English is-the-bisector-of', 'AD is the bisector of angle A'],
    ['English glyph', 'AD bisects ∠A'],
  ])('%s', (_l, u) => {
    const r = parse3(u);
    expect(r.ok, u).toBe(false);
    // A TYPED refusal — never `not-handled`, which is what the App escalates to the paid LLM lane.
    expect((r as { reason: string }).reason, u).toBe('ambiguous-angle-vertex');
    expect((r as { vertex: string }).vertex, u).toBe('A');
  });

  it('carries the RIDER, so the canonical sentence can be rebuilt where the figure is known', () => {
    expect(parse3('AD חוצה את זווית A')).toMatchObject({ reason: 'ambiguous-angle-vertex', vertex: 'A', rider: 'D' });
    // The vertex may be either letter of the segment — «DA חוצה זווית A» is the same statement.
    expect(parse3('DA חוצה את זווית A')).toMatchObject({ reason: 'ambiguous-angle-vertex', vertex: 'A', rider: 'D' });
  });

  it('does NOT borrow the scope register — this is under-specified, not unsupported', () => {
    // The operator's ruling is precisely about which voice the student hears. If this ever starts
    // matching a scope category, the message reverts to "the tool does not support this".
    expect(classifyGuidance3('AD חוצה את זווית A')).toBeNull();
  });
});

describe('#866 — the three-letter form still BUILDS, and neighbours stay untouched', () => {
  it.each([
    ['Hebrew triple', 'AD חוצה זווית BAC'],
    ['English triple', 'AD bisects angle BAC'],
    ['apex is derived, not positional', 'OD חוצה זווית AOC'],
  ])('%s', (_l, u) => {
    const r = parse3(u);
    expect(r.ok, u).toBe(true);
    if (r.ok) expect(r.commands[0].type).toBe('bisector-ray');
  });

  it('a sentence whose vertex is NOT on the bisecting segment stays a genuine gap', () => {
    // «AD חוצה את זווית B» does not describe a bisector at all. Offering a clarification for a sentence
    // the tool does not understand would be worse than silence, so the guard is on the shared letter.
    for (const u of ['AD חוצה את זווית B', 'XY חוצה את זווית A']) {
      expect(parse3(u), u).toMatchObject({ ok: false, reason: 'not-handled' });
    }
  });
});

describe('#866 — the figure decides whether to ask, and the ask names the candidates', () => {
  it('a THREE-edge vertex asks, listing every angle it could mean', () => {
    // The issue's own worked example: on a triangular pyramid the edges at A are AB, AC and AD.
    const st = build(['פירמידה משולשת ABCD', 'AD חוצה את זווית A']);
    expect(st.lastError).toEqual({ code: 'ambiguous-angle-vertex', vertex: 'A', angles: 'BAC, BAD, CAD' });
  });

  it('a box vertex asks too, in the student’s own notation', () => {
    const st = build(["תיבה ABCDA'B'C'D'", 'AB חוצה את זווית A']);
    expect(st.lastError).toMatchObject({ code: 'ambiguous-angle-vertex', vertex: 'A' });
    expect((st.lastError as { angles: string }).angles).toBe("A'AB, A'AD, BAD");
  });

  it('a vertex with exactly ONE angle RESOLVES — the ask would otherwise say something false', () => {
    const st = build(['משולש ABC', 'AD חוצה את זווית A']);
    expect(st.lastError).toBeNull();
    // The student's own wording stays on the fact; the resolved command is attached to it, so the
    // panel shows what they typed and replay folds what it means.
    const fact = st.facts[st.facts.length - 1];
    expect(fact.utterance).toBe('AD חוצה את זווית A');
    expect(fact.cmds).toEqual([{ type: 'bisector-ray', id: 'D', a: 'B', b: 'C', apex: 'A' }]);
  });

  it('with NO figure it still asks, and does not print an empty list', () => {
    const st = build(['AD חוצה את זווית A']);
    expect(st.lastError).toMatchObject({ code: 'ambiguous-angle-vertex', vertex: 'A', angles: '' });
    // The empty string is what routes App3 to the BARE message — asserted here because the two-form
    // shape is the whole reason the store returns a list rather than a sentence.
  });
});

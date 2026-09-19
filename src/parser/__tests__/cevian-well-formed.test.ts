/**
 * #1233 (ADR-525) — a cevian's apex may not lie on the side it is drawn to, in EVERY rule that
 * emits one.
 *
 * «BD גובה לצלע AB» built a ZERO-LENGTH altitude: B is an endpoint of AB, so the foot of the
 * perpendicular from B to AB is B itself. The tool drew it, reported `ok`, and said nothing beyond a
 * coincidence notice. The gate that refuses exactly this existed — inside the MEDIAN rule, as
 * `opp[0] === apex || opp[1] === apex` — and lived in one of the several rules that need it.
 *
 * THE LOCK IS THE TABLE, not the reported cell. Measured on «משולש ABC» before the fix, the same five
 * degenerate shapes behaved five different ways depending on which rule read the sentence — escalate,
 * over-constrained, a silent zero-length segment, a hidden `~B` on top of `B`, and (for
 * «AD גובה לצלע AB») a figure drawn to a side the student never named. One predicate now answers all
 * of them, and the test CALLS it through `parse` rather than re-implementing it
 * ([ADR-W-053](../../../docs/06w-decisions-workspace.md)).
 *
 * The NEGATIVE controls are the half that matters most: the gate must not have eaten the feature.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '../index';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

/** The figure «משולש ABC», through the real fact path, so the parse context is the app's. */
const triangleCtx = (): ReturnType<typeof buildParseCtx> => {
  const facts: Fact[] = [];
  const r = parse('משולש ABC', buildParseCtx(replay([]).construction, replay([]).positions));
  if (!r.ok) throw new Error('the fixture triangle must parse');
  r.commands.forEach((cmd, i) => facts.push({ id: `g0.${i}`, group: 'g0', enabled: true, utterance: 'משולש ABC', cmd }));
  const fig = replay(facts);
  return buildParseCtx(fig.construction, fig.positions);
};

const CTX = triangleCtx();

/** Every command the utterance would commit on «משולש ABC» — `[]` when the rule declines. */
const commit = (u: string): { type: string }[] => {
  const r = parse(u, CTX);
  return r.ok ? (r.commands as { type: string }[]) : [];
};

describe('ADR-525 — the cevian incidence is checked in every rule that emits a foot (#1233)', () => {
  /**
   * apex ∈ side (both endpoints), apex === foot, foot ∈ side (both endpoints) — for the median and
   * the altitude, in Hebrew and English. `AA …` is deliberately absent from the median rows: 2-D
   * reads a repeated run as naming no segment and falls through to the honest apex form
   * («median from A»), which draws the correct figure with an auto-named foot. It is a recovery, not
   * a lie, and refusing it would remove a working spelling — see the ADR.
   */
  it.each([
    // ── median, Hebrew ──
    ['median he apex=u', 'BD תיכון לצלע AB'],
    ['median he apex=v', 'AD תיכון לצלע AB'],
    ['median he foot=u', 'AB תיכון לצלע BC'],
    ['median he foot=v', 'AC תיכון לצלע BC'],
    // ── median, English ──
    ['median en apex=u', 'BD median to side AB'],
    ['median en foot=u', 'AB median to side BC'],
    // ── altitude, Hebrew — the reported cell and its four siblings ──
    ['altitude he apex=u', 'BD גובה לצלע AB'],
    ['altitude he apex=v', 'AD גובה לצלע AB'],
    ['altitude he apex=foot', 'AA גובה לצלע BC'],
    ['altitude he foot=u', 'AB גובה לצלע BC'],
    ['altitude he foot=v', 'AC גובה לצלע BC'],
    // ── altitude, English ──
    ['altitude en apex=u', 'BD altitude to side AB'],
    ['altitude en apex=foot', 'AA altitude to side BC'],
    // ── the foot rule, the family's third spelling ──
    ['foot rule apex on side', 'F רגל האנך מ-B ל-AB'],
    ['foot rule id = apex', 'B רגל האנך מ-B ל-CD'],
    ['foot rule en apex on side', 'F is the foot of the perpendicular from B to AB'],
  ])('%s is refused', (_name, u) => {
    expect(commit(u as string)).toEqual([]);
  });

  /**
   * THE GATE HAS NOT EATEN THE FEATURE. A well-formed cevian in either role, either locale, still
   * builds — and still builds the SAME thing, asserted as parity between the roles' spellings rather
   * than as hand-written command lists.
   */
  it.each([
    ['median he', 'AD תיכון לצלע BC', 'midpoint'],
    ['median en', 'AD median to side BC', 'midpoint'],
    ['altitude he', 'AD גובה לצלע BC', 'foot'],
    ['altitude en', 'AD altitude to side BC', 'foot'],
    ['foot rule', 'F רגל האנך מ-A ל-BC', 'foot'],
  ])('%s still builds', (_name, u, kind) => {
    const types = commit(u as string).map((c) => c.type);
    expect(types).toContain(kind);
  });

  it('the Hebrew and English spellings of one role commit the same thing', () => {
    expect(commit('AD median to side BC')).toEqual(commit('AD תיכון לצלע BC'));
    expect(commit('AD altitude to side BC')).toEqual(commit('AD גובה לצלע BC'));
  });

  /**
   * The second defect this fix closed, and the one nobody had filed: the altitude rule used to check
   * only the stated side's FIRST letter, and answered a degenerate statement by DISCARDING it and
   * deriving a different side from the figure. «AD גובה לצלע AB» drew the altitude to **BC** — the
   * student stated one side and silently got another. A stated side is a given.
   */
  it('a stated side is never silently swapped for another', () => {
    // it is refused (above); what this asserts is that it is not quietly redirected to BC
    const cmds = commit('AD גובה לצלע AB') as { type: string; a?: string; b?: string }[];
    expect(cmds.filter((c) => c.type === 'foot')).toEqual([]);
  });

  it('a well-formed stated side is still the side that is used', () => {
    const foot = commit('AD גובה לצלע BC').find((c) => c.type === 'foot') as
      | { a: string; b: string }
      | undefined;
    expect([foot?.a, foot?.b].sort()).toEqual(['B', 'C']);
  });
});

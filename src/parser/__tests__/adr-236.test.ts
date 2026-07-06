/**
 * ADR-236 — the four parser/harness findings of the T1 B-corpus wiring, fixed at root:
 *
 *  1. A drawn ⊥/∥ line's cut-compound ("the perpendicular to AB at E cuts [the extension of /
 *     line] BD at G") failed to bind on the English fillers, fell through to the ADR-036 line-NAMING
 *     fallback, and GRABBED the existing D as an on-line marker (a silently wrong figure) while
 *     dropping G. Now: the shared LINE_CUT clause swallows both languages' fillers, the compound
 *     lowers to line∩line, and an unbindable cut-verb utterance escalates instead of half-parsing.
 *  2. "kite ABCD inscribed in circle O" silently dropped the kite word (the ADR-117 class, quad
 *     edition) — now it carries the kite `shape-variant` (ADR-138 axis machinery) in every branch.
 *  3. `droppedNewLabels` read the ADR-118 area marker `S` (and the raw `O_1` subscript) as point
 *     labels — a cleanly-parsed area given escalated to the LLM for nothing. Now it normalizes the
 *     utterance like `parse` does and masks the glued area marker.
 *  4. "G on line BD" for a NEW G emitted `set-collinear` with a point nothing defines — headless
 *     replay crashed inside `constraintIsPending` (residual over a missing position). Now the rule
 *     creates G as a free point the constraint drives, and `constraintIsPending` skips (never
 *     crashes on) a constraint whose refs have no position.
 *
 * All through the real parse-with-context → replay path.
 */

import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx, droppedNewLabels } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { detectTheorems } from '@/theorems';

function build(utterances: string[]): { facts: Fact[]; final: ReturnType<typeof replay> } {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const ctx = buildParseCtx(construction, positions);
    const r = parse(u, ctx);
    expect(r.ok, `did not parse: ${u}`).toBe(true);
    if (!r.ok) break;
    expect(droppedNewLabels(u, r.commands, ctx.points), `dropped labels in: ${u}`).toEqual([]);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  return { facts, final: replay(facts) };
}

describe('1 — the ⊥/∥ cut-compound binds (no D-grab, no dropped G)', () => {
  const PREFIX = ['rhombus ABCD', 'E is the midpoint of AB'];

  for (const cutForm of [
    'the perpendicular to AB at E cuts the extension of BD at G',
    'the perpendicular to AB at E cuts line BD at G',
    'the perpendicular to AB at E meets the extension of BD at G',
    'האנך ל-AB בנקודה E חותך את המשך BD בנקודה G',
  ]) {
    it(`"${cutForm}" lowers to line∩line at G and never re-places D`, () => {
      const { facts } = build([...PREFIX, cutForm]);
      const cmds = facts.map((f) => f.cmd);
      // G is the intersection of the perpendicular with line BD…
      expect(cmds.some((c) => c.type === 'line-intersection' && c.id === 'G')).toBe(true);
      // …and NO command re-defines the rhombus's own D (the old point-on-line grab).
      expect(cmds.some((c) => c.type === 'point-on-line' && c.id === 'D')).toBe(false);
    });
  }

  it('an unbindable VERB cut-compound escalates instead of half-parsing', () => {
    const { final } = build(PREFIX);
    const ctx = buildParseCtx(final.construction, final.positions);
    // A cut VERB aimed at a named segment that LINE_CUT can't bind (two cuts in one clause) → null.
    const r = parse('the perpendicular to AB at E cuts BD at G and cuts AC at H at once nonsense', ctx);
    expect(r.ok && r.commands.some((c) => c.type === 'point-on-line' && c.id === 'D')).toBe(false);
  });

  it('the intersection-NOUN form never grabs D and never silently commits G', () => {
    const { final } = build(PREFIX);
    const ctx = buildParseCtx(final.construction, final.positions);
    const u = 'G is the intersection of the perpendicular to AB at E and line BD';
    const r = parse(u, ctx);
    if (!r.ok) return; // escalating is fine
    // If it parses at all: the cut-line's letters must not be read as the perpendicular's own name
    // (the old D-grab), and a dropped G must be flagged so the app escalates instead of committing.
    expect(r.commands.some((c) => c.type === 'point-on-line' && c.id === 'D')).toBe(false);
    const referencesG = JSON.stringify(r.commands).includes('"G"');
    if (!referencesG) expect(droppedNewLabels(u, r.commands, ctx.points)).toContain('G');
  });

  it('the pronoun cut ("וחותך אותו בנקודה E") stays the reposition/foot form (scenario class kept)', () => {
    // "CD אנך ל-AB וחותך אותו בנקודה E" — cuts IT (=AB) at E: E is the through-point/foot, C,D name
    // the perpendicular (ADR-036 reposition). The ADR-236 escalate-guard must NOT catch this.
    const { facts } = build(['segment AB', 'CD אנך ל-AB וחותך אותו בנקודה E']);
    const cmds = facts.map((f) => f.cmd);
    expect(cmds.some((c) => c.type === 'perpendicular-line')).toBe(true);
  });

  it('the parallel twin: "the line through L parallel to AB cuts BD at M" places M on line∩line', () => {
    const { facts } = build(['parallelogram ABCD', 'L is the midpoint of AD', 'the line through L parallel to AB cuts BD at M']);
    const cmds = facts.map((f) => f.cmd);
    expect(cmds.some((c) => c.type === 'line-intersection' && c.id === 'M')).toBe(true);
  });
});

describe('2 — an inscribed kite carries its shape word', () => {
  it('"kite ABCD inscribed in circle O" emits the kite shape-variant and 37/38 surface', () => {
    const { facts, final } = build(['kite ABCD inscribed in circle O']);
    expect(facts.some((f) => f.cmd.type === 'shape-variant' && f.cmd.shape === 'kite')).toBe(true);
    expect(final.lastError).toBeNull();
    const feed = new Set(detectTheorems({ facts, construction: final.construction }).map((e) => e.id));
    expect(feed.has(37)).toBe(true);
    expect(feed.has(38)).toBe(true);
  });

  it('Hebrew: "דלתון ABCD חסום במעגל O" — same lowering', () => {
    const { facts, final } = build(['דלתון ABCD חסום במעגל O']);
    expect(facts.some((f) => f.cmd.type === 'shape-variant' && f.cmd.shape === 'kite')).toBe(true);
    expect(final.lastError).toBeNull();
  });

  it("an explicit pair pins the inscribed kite's axis (ADR-138 still applies)", () => {
    // The booklet's own form: the kite word AND the explicit pairs — no double-drive, builds green.
    const { final } = build(['kite ABCD inscribed in circle O', 'AB = AD', 'CB = CD']);
    expect(final.lastError).toBeNull();
    expect(final.violations).toEqual([]);
  });
});

describe('3 — droppedNewLabels ignores notation markers', () => {
  it('a numeric area given does not read the S marker as a dropped point', () => {
    const { final } = build(['triangle ABC']);
    const ctx = buildParseCtx(final.construction, final.positions);
    for (const u of ['S_{ABC} = 13', 'S_ABC = 13', 'SABC = 13']) {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(droppedNewLabels(u, r.commands, ctx.points), u).toEqual([]);
    }
  });

  it('an S-form area RATIO commits without a fake dropped S', () => {
    // The exact ADR-121/123 form the T1 wiring caught escalating: the bare S marker of the
    // second operand is stored nowhere in the lowered set-area-ratio.
    const { final } = build(['triangle ABC', 'D on AB', 'segment DC']);
    const ctx = buildParseCtx(final.construction, final.positions);
    const r = parse('S_{ABC} = 4 S_{ADC}', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(droppedNewLabels('S_{ABC} = 4 S_{ADC}', r.commands, ctx.points)).toEqual([]);
  });

  it('a subscripted point label (O_1) compares against the normalized text', () => {
    const r = parse('circle O_1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(droppedNewLabels('circle O_1', r.commands, [])).toEqual([]);
  });

  it('a genuinely dropped label still flags', () => {
    // A real point label the commands never reference must STILL be reported (the guard's job).
    const r = parse('triangle ABC');
    expect(r.ok).toBe(true);
    if (r.ok) expect(droppedNewLabels('triangle ABC and the point Q', r.commands, [])).toEqual(['Q']);
  });
});

describe('4 — a NEW point named onto a line is created, never a dangling ref', () => {
  it('"G on line BD" creates G as a free point and replay does not crash', () => {
    const { facts, final } = build(['triangle ABD', 'G on line BD']);
    expect(facts.some((f) => f.cmd.type === 'free-point' && f.cmd.id === 'G')).toBe(true);
    expect(final.lastError).toBeNull();
    expect(final.positions.has('G')).toBe(true);
  });

  it('the B15 shape: G on line BD + GA ⊥ AD builds end-to-end', () => {
    const { final } = build(['triangle ABD', 'G on line BD', 'GA perpendicular to AD']);
    expect(final.lastError).toBeNull();
    expect(final.violations).toEqual([]);
  });

  it('"line QR passes through P" with a NEW P also creates it', () => {
    const { facts, final } = build(['triangle QRS', 'line QR passes through P']);
    expect(facts.some((f) => f.cmd.type === 'free-point' && f.cmd.id === 'P')).toBe(true);
    expect(final.lastError).toBeNull();
  });
});

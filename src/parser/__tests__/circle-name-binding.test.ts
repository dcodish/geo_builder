/**
 * #186 — a NAMED circle reference that matches NO existing circle, while the figure holds UNNAMED
 * (auto-centre) circles, is naming-by-use of one of them — never a silently invented new circle and
 * never the raw "unresolved dependencies" refusal (prod session hqxbjh0x: «D ו F על מעגל O1» /
 * «E ו C על מעגל O2» after «שני מעגלים נחתכים», whose two circles' auto centres are hidden so the
 * student cannot know their internal names).
 *
 * Locks: (1) `withImplicitCircles` TAGS the circle it invents (`implied`) so the App can distinguish
 * a student's dangling reference from a rule's own creation; (2) `impliedCircleBinding` — the pure
 * decision shared by App.submit, commitEdit, the scenario harness, and the log-triage mirror —
 * resolves by stated membership → sole unnamed circle → clarify, and stands down when the name is an
 * existing point (a "circle centred X" creation) or nothing unnamed exists (the LLM decomposition
 * seam keeps its implicit creation).
 */
import { describe, it, expect } from 'vitest';
import { parse, impliedCircleBinding, buildParseCtx } from '@/parser';
import { replay, nameCentreFacts } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const factsFrom = (steps: string[] | Fact[]): Fact[] => {
  if (steps.length && typeof steps[0] !== 'string') return steps as Fact[];
  let facts: Fact[] = [];
  let g = 0;
  for (const u of steps as string[]) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`step did not parse: ${u}`);
    const group = `g${g++}`;
    facts = [...facts, ...r.commands.map((cmd, i) => ({ id: `${group}.${i}`, utterance: u, group, cmd, enabled: true }))];
  }
  return facts;
};
const ctxOf = (facts: Fact[]) => {
  const { construction, positions } = replay(facts);
  return buildParseCtx(construction, positions);
};
const parseOk = (u: string, facts: Fact[]): AnyCommand[] => {
  const r = parse(u, ctxOf(facts));
  if (!r.ok) throw new Error(`did not parse: ${u}`);
  return r.commands;
};

describe('#186 — implied circle tagging + the binding decision', () => {
  it('a reference to a circle that does not exist is TAGGED as implied by the parser', () => {
    const facts = factsFrom(['שני מעגלים נחתכים']);
    const cmds = parseOk('E על מעגל O2', facts);
    const implied = cmds.filter((c) => c.type === 'circle' && (c as { implied?: boolean }).implied);
    expect(implied, 'the invented circle carries the implied tag').toHaveLength(1);
    expect((implied[0] as { id: string }).id).toBe('circle-O2');
  });

  it('two unnamed circles + NO membership signal → clarify (never a silent pick)', () => {
    const facts = factsFrom(['שני מעגלים נחתכים']);
    const cmds = parseOk('E ו C על מעגל O2', facts); // E,C are new — no signal
    const bind = impliedCircleBinding(cmds, ctxOf(facts));
    expect(bind).toEqual({ clarify: 'unknown-circle', center: 'O2' });
  });

  it('a stated-membership signal picks the circle the subjects already ride', () => {
    // D,F on the second circle (via its internal token P — the LLM-decomposition path in prod),
    // then «D ו F על מעגל O1» must bind THAT circle, not the other and not a new one.
    const base = factsFrom(['שני מעגלים נחתכים']);
    const withRiders: Fact[] = [
      ...base,
      { id: 'r.0', group: 'r', utterance: 'מיתר DF', cmd: { type: 'point-on-circle', id: 'D', circle: 'circle-P' } as AnyCommand, enabled: true },
      { id: 'r.1', group: 'r', utterance: 'מיתר DF', cmd: { type: 'point-on-circle', id: 'F', circle: 'circle-P' } as AnyCommand, enabled: true },
    ];
    const cmds = parseOk('D ו F על מעגל O1', withRiders);
    const bind = impliedCircleBinding(cmds, ctxOf(withRiders));
    expect(bind).toEqual({ from: 'P', to: 'O1' });
  });

  it('a single unnamed circle binds without any signal; after one bind the remaining circle binds next', () => {
    const base = factsFrom(['שני מעגלים נחתכים']);
    // bind the first name to one of the pair (the P token), as the App would after a signal:
    const r1 = nameCentreFacts(base, 'P', 'O1');
    if (!r1.ok) throw new Error('bind failed');
    const cmds = parseOk('E ו C על מעגל O2', r1.facts);
    const bind = impliedCircleBinding(cmds, ctxOf(r1.facts));
    expect(bind, 'one unnamed circle left → it is the referent').toEqual({ from: 'O', to: 'O2' });
    // and applying it yields a figure whose two circles ARE the student's names — no invented circle
    const r2 = nameCentreFacts(r1.facts, 'O', 'O2');
    if (!r2.ok) throw new Error('second bind failed');
    const rr = parse('E ו C על מעגל O2', ctxOf(r2.facts));
    expect(rr.ok).toBe(true);
    if (rr.ok) {
      expect(rr.commands.some((c) => c.type === 'circle'), 'no circle is invented once the name resolves').toBe(false);
      const fig = replay([...r2.facts, ...rr.commands.map((cmd, i) => ({ id: `e.${i}`, group: 'e', utterance: 'E ו C על מעגל O2', cmd, enabled: true }))]);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle');
      expect(circles.map((c) => c.id).sort()).toEqual(['circle-O1', 'circle-O2']);
      expect(Object.values(fig.status).every((s) => s === 'ok')).toBe(true);
    }
  });

  it('a name that IS an existing point stands down (a "circle centred X" creation, not a reference)', () => {
    const facts = factsFrom(['משולש ABC', 'שני מעגלים נחתכים']);
    const cmds = parseOk('D על מעגל A', facts); // A is a triangle vertex — a legitimate centre
    const bind = impliedCircleBinding(cmds, ctxOf(facts));
    expect(bind).toBeNull();
  });

  it('no unnamed circles → null (the LLM decomposition seam keeps its implicit creation)', () => {
    const facts = factsFrom(['מעגל שמרכזו P']); // a NAMED circle — nothing unnamed to bind
    const cmds = parseOk('D על מעגל Q', facts);
    const bind = impliedCircleBinding(cmds, ctxOf(facts));
    expect(bind).toBeNull();
  });
});

/**
 * Issue #539 (ADR-440) — the POINT edition of the #186 naming-by-use binding.
 *
 * The class: a statement's FRESH label that a drawn AUTO-NAMED point structurally satisfies was minted
 * as a DUPLICATE node beside it. «שני מעגלים משיקים מבחוץ» auto-names the touch «M»; the student's
 * worksheet calls it E, so they type «ישר A O1 E O2 C» — and got a second free rider next to M, with
 * every later given about E attaching to the phantom (the 2-D twin of the 3-D ADR-3D-139 P1).
 *
 * Mechanism: `autoNamedLabels` (a label appearing in NO fact utterance was auto-minted — rename and
 * name-centre rewrite utterances, so the predicate needs no per-rule marker) + `ctx.structuralBetween`
 * (points between two others BY CONSTRUCTION: an external tangency's touch between the centres, a
 * midpoint, an interior rider) + `impliedPointBinding` (fresh set-line label whose stated slot exactly
 * ONE such auto-named point occupies → rename it to the student's letter; shared by App.submit, the
 * edit path, the scenario harness, and the log-triage mirror).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx, impliedCircleBinding, impliedPointBinding, parseNameCenter } from '@/parser';
import { replay, autoNamedLabels, nameCentreFacts, renameFacts } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

/** The full App.submit-shaped loop: name-centre store ops + circle binds + point binds. Facts carry
 *  their UTTERANCE (the store's `executeMany` shape) — `autoNamedLabels` is defined over utterances,
 *  so a harness that drops them (a bare `trialFacts`) would count every student label as auto-named. */
function build(lines: string[]): { facts: Fact[]; fig: ReturnType<typeof replay> } {
  let facts: Fact[] = [];
  let fig = replay([], 0);
  let g = 0;
  for (const u of lines) {
    let pctx = buildParseCtx(fig.construction, fig.positions);
    const nc0 = parseNameCenter(u, pctx);
    if (nc0) {
      const res = nameCentreFacts(facts, nc0.from, nc0.to);
      if (res.ok) {
        facts = res.facts;
        fig = replay(facts, 0);
      }
      continue;
    }
    let r = parse(u, pctx);
    expect(r.ok, `parses: ${u}`).toBe(true);
    if (!r.ok) continue;
    for (let guard = 0; r.ok && guard < 3; guard++) {
      const bind = impliedCircleBinding(r.commands, pctx);
      if (bind && 'clarify' in bind) break;
      if (bind) {
        const nc = nameCentreFacts(facts, bind.from, bind.to);
        if (!nc.ok) break;
        facts = nc.facts;
      } else {
        const pbind = impliedPointBinding(r.commands, pctx, autoNamedLabels(facts));
        if (!pbind) break;
        const rn = renameFacts(facts, pbind.from, pbind.to);
        if (!rn.ok) break;
        facts = rn.facts;
      }
      fig = replay(facts, 0);
      pctx = buildParseCtx(fig.construction, fig.positions);
      r = parse(u, pctx);
    }
    if (!r.ok) continue;
    const group = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
    fig = replay(facts, 0);
  }
  return { facts, fig };
}

const PAIR = ['שני מעגלים משיקים מבחוץ', 'מרכז המעגל הקטן הוא O1', 'מרכז המעגל הגדול הוא O2'];

describe('#539 — a fresh set-line label binds the auto-named touch point instead of minting a duplicate', () => {
  it.each([
    ['He', 'ישר A O1 E O2 C'],
    ['En', 'line A O1 E O2 C'],
  ])('%s: «…A O1 E O2 C» renames the touch M → E; ONE point at the touch', (_t, line) => {
    const { fig } = build([...PAIR, 'A על מעגל O1', 'C על מעגל O2', line]);
    expect(fig.construction.objects.some((o) => o.id === 'M'), 'no leftover M').toBe(false);
    const pos = (id: string) => fig.positions.get(id)!;
    expect(pos('E'), 'E exists').toBeTruthy();
    // E is genuinely THE touch: on the centre line, strictly between the centres (external tangency)
    const [O1, O2, E] = [pos('O1'), pos('O2'), pos('E')];
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    expect(Math.abs((E.x - O1.x) * (O2.y - O1.y) - (E.y - O1.y) * (O2.x - O1.x)), 'E on the centre line').toBeLessThan(1e-3);
    expect(d(O1, E) + d(E, O2), 'E between the centres — the external touch').toBeCloseTo(d(O1, O2), 3);
  });

  it('the student NAMED the touch («בנקודה T») — T is not auto-named, so E stays a fresh rider and T survives', () => {
    const { fig } = build(['שני מעגלים משיקים מבחוץ בנקודה T', 'מרכז המעגל הקטן הוא O1', 'מרכז המעגל הגדול הוא O2', 'A על מעגל O1', 'C על מעגל O2', 'ישר A O1 E O2 C']);
    expect(fig.construction.objects.some((o) => o.id === 'T'), 'the student-named touch survives').toBe(true);
    expect(fig.construction.objects.some((o) => o.id === 'E'), 'E minted as its own rider').toBe(true);
  });

  it('internal tangency: the touch is NOT between the centres — no binding, E stays a fresh rider', () => {
    const { fig } = build([...PAIR, 'A על מעגל O1', 'C על מעגל O2', 'ישר A O1 E O2 C'].map((u) => u.replace('מבחוץ', 'מבפנים')));
    // whatever the auto touch is named, it was NOT renamed to E-in-the-middle
    expect(fig.construction.objects.some((o) => o.id === 'M'), 'the internal touch keeps its auto name').toBe(true);
  });

  it('an END slot extends the line — nothing to bind: «ישר E A O1» keeps M', () => {
    const { fig } = build([...PAIR, 'A על מעגל O1', 'ישר E A O1']);
    expect(fig.construction.objects.some((o) => o.id === 'M')).toBe(true);
    expect(fig.construction.objects.some((o) => o.id === 'E')).toBe(true);
  });

  it('the decision is pure and names the rename: {from: M, to: E}', () => {
    const { facts, fig } = build([...PAIR, 'A על מעגל O1', 'C על מעגל O2']);
    const pctx = buildParseCtx(fig.construction, fig.positions);
    const r = parse('ישר A O1 E O2 C', pctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(impliedPointBinding(r.commands, pctx, autoNamedLabels(facts))).toEqual({ from: 'M', to: 'E' });
  });
});

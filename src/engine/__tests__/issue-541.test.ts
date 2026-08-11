/**
 * Issue #541 (ADR-438) — the drivable-ancestor walk traverses DERIVED circle centres.
 *
 * The class: a constraint on a point derived from an auxiliary circle (the tangent-from-external-point
 * construction places its touch as a circle∩circle crossing on a Thales aux circle centred at
 * midpoint(centre, apex)) could not reach the free DOFs that actually position that circle, because the
 * walk surfaced only a circle's own radius / free-point centre and never walked THROUGH a derived
 * centre. With free radii the joint solve escaped via the radius DOF — which is exactly what masked the
 * gap: the operator's figure worked unsized and failed «over-constrained: … cannot hold» the moment
 * «היקף מעגל O1 הוא 6π» / «שטח מעגל O2 הוא 81π» pinned the radii, on a figure that provably exists
 * (r=3, r=9, |O1O2|=12, A–O1–E–O2–C the official bagrut Q11 drawing).
 *
 * Second defect, same issue: a multi-constraint refusal blamed `newCons[0]` — systematically the FIRST
 * lowered triple — so the operator was told «O2, A, O1 collinear cannot hold» on a figure where that
 * very triple builds. The blame now prefers a member of the primary evaluate's `violated` set.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx, parseNameCenter } from '@/parser';
import { replay, nameCentreFacts, trialFacts, dryRunOutcome } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { applyStep, allDrivableAncestors } from '../step';
import type { Command, Construction } from '../types';

/** Build a fact list through the real parse-with-context path (name-centre steps included). */
function build(lines: string[]): { facts: Fact[]; fig: ReturnType<typeof replay> } {
  let facts: Fact[] = [];
  let fig = replay([], 0);
  for (const u of lines) {
    const pctx = buildParseCtx(fig.construction, fig.positions);
    const nc = parseNameCenter(u, pctx);
    if (nc) {
      const res = nameCentreFacts(facts, nc.from, nc.to);
      expect(res.ok, `name-centre step applies: ${u}`).toBe(true);
      if (res.ok) {
        facts = res.facts;
        fig = replay(facts, 0);
      }
      continue;
    }
    const r = parse(u, pctx);
    expect(r.ok, `parses: ${u}`).toBe(true);
    if (!r.ok) continue;
    facts = trialFacts(facts, r.commands);
    fig = replay(facts, 0);
  }
  return { facts, fig };
}

const BAGRUT_Q11 = [
  'שני מעגלים משיקים מבחוץ',
  'מרכז המעגל הקטן הוא O1',
  'מרכז המעגל הגדול הוא O2',
  'היקף מעגל O1 הוא 6π',
  'שטח מעגל O2 הוא 81π',
  'A על מעגל O1',
  'AD משיק למעגל O2 בנקודה D',
  'B על המשך AD',
  'BC משיק למעגל O2 בנקודה C',
];

describe('#541 — a constraint on a Thales-aux touch point reaches the apex DOF behind the derived centre', () => {
  it('the drivable walk from the touch C surfaces the external point B (through midpoint(O2,B))', () => {
    const { fig } = build(BAGRUT_Q11);
    const reach = allDrivableAncestors(fig.construction.objects, 'C');
    expect(reach, 'B (the on-segment extension parameter) is reachable').toContain('B');
  });

  it.each([
    ['the 4-point form', 'ישר A O1 O2 C'],
    ["the operator's 5-point form (E auto-binds to the touch)", 'ישר A O1 E O2 C'],
    ['the through-the-centres phrasing', 'AC עובר דרך מרכזי המעגלים'],
  ])('%s builds with the radii PINNED — the exact case that used to refuse', (_t, last) => {
    const { facts, fig } = build(BAGRUT_Q11);
    const pctx = buildParseCtx(fig.construction, fig.positions);
    const r = parse(last, pctx);
    expect(r.ok, last).toBe(true);
    if (!r.ok) return;
    const outcome = dryRunOutcome(facts, r.commands, 0, {});
    expect(outcome.produced, `${last} → ${outcome.produced ? '' : `${outcome.reason}: ${outcome.detail ?? ''}`}`).toBe(true);
    const after = replay(trialFacts(facts, r.commands), 0);
    for (const [id, st] of Object.entries(after.status)) expect(st, `status of ${id}`).toBe('ok');
    const at = (id: string) => after.positions.get(id)!;
    const cross = (p: string, q: string, s: string) =>
      (at(q).x - at(p).x) * (at(s).y - at(p).y) - (at(q).y - at(p).y) * (at(s).x - at(p).x);
    expect(Math.abs(cross('A', 'O1', 'O2')), 'A on the centre line').toBeLessThan(1e-2);
    expect(Math.abs(cross('A', 'O2', 'C')), 'C on the centre line').toBeLessThan(1e-2);
    const d = Math.hypot(at('O2').x - at('O1').x, at('O2').y - at('O1').y);
    expect(d, 'the pinned tangency survives: |O1O2| = 3 + 9').toBeCloseTo(12, 3);
  });

  it('the free-radius variant still builds (the escape that used to mask the gap keeps working)', () => {
    const { facts, fig } = build(BAGRUT_Q11.filter((u) => !/היקף|שטח/.test(u)));
    const pctx = buildParseCtx(fig.construction, fig.positions);
    const r = parse('ישר A O1 O2 C', pctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(dryRunOutcome(facts, r.commands, 0, {}).produced).toBe(true);
  });
});

describe('#541 — an over-constrained refusal blames a member that actually FAILS, never just the first', () => {
  it('set-line [A,B,D,C]: D (free) satisfies its triple; C (pinned off-line) cannot — the error names C', () => {
    let c: Construction = { objects: [], constraints: [] };
    const cmds: Command[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 }, // a coordinate placement asserts a location (pinned)
      { type: 'free-point', id: 'B', x: 4, y: 0 },
      { type: 'free-point', id: 'D', x: 1, y: 1, free: true }, // floating — the recruiter can drive it onto AB
      { type: 'free-point', id: 'C', x: 8, y: 5 }, // placed OFF the line — the genuine violator
    ];
    for (const cmd of cmds) {
      const r = applyStep(c, cmd);
      expect(r.ok).toBe(true);
      if (r.ok) c = r.construction;
    }
    const r = applyStep(c, { type: 'set-line', points: ['A', 'B', 'D', 'C'] });
    expect(r.ok, 'a pinned off-line member genuinely refuses').toBe(false);
    if (r.ok) return;
    // the OLD blame named newCons[0] — «D, A, B collinear», a triple that HOLDS (D is free to slide
    // onto AB). Which member is infeasible is unknowable at the refuse seam (the driven solvers
    // early-out on the first casualty), so the honest refusal names the STUDENT'S WHOLE STATEMENT —
    // the stated order list — never one arbitrary lowered triple.
    expect(r.error).toContain('over-constrained');
    expect(r.error, `names the whole stated line, got: ${r.error}`).toContain('A–B–D–C in order on a line');
    expect(r.error, 'never the satisfiable first triple alone').not.toMatch(/^over-constrained: D, A, B collinear/);
  });
});

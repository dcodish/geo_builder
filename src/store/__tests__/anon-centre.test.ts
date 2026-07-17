/**
 * Anonymous auto-centres — the CLASS test ([ADR-342](docs/06-decisions.md#adr-342), issue #177 — the
 * ADR-297 namespace-hijack class, centre edition).
 *
 * An UNNAMED circle's auto-assigned centre letter used to be a real POINT ('O', 'P' — hidden per FR-RN-8),
 * silently occupying the student's namespace: «P על המשך BA» after «שני מעגלים נחתכים» M1-bound the
 * student's P to the INVISIBLE second centre and refused ("over-constrained") a statement that should have
 * created a new point. Now the centre POINT is anonymous ('@ctr-O') while the LETTER stays the circle's
 * reference token («מעגל O», `circle-O` — byte-unchanged), and — the operator's ruling (b) — a statement
 * whose WORDS name the centre («רדיוס OB») binds-and-PROMOTES the letter, while positional/definitional
 * statements always treat it as fresh.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse, buildParseCtx, parseNameCenter } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';
import { factsOf } from '../../__tests__/scenarios-corpus';

const beyond = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
  (p.x - a.x) * (a.x - b.x) + (p.y - a.y) * (a.y - b.y) > 0; // p beyond a on ray b→a

describe('anonymous auto-centres (ADR-342 / #177)', () => {
  beforeEach(() => useGeoStore.getState().clear());

  it('every auto-centre emitter mints an anonymous centre — the letter never becomes a point', () => {
    for (const [u, expectCircles] of [
      ['מעגל', 1],
      ['שני מעגלים נחתכים בנקודות A ו-B', 2],
      ['שני מעגלים משיקים מבפנים', 2],
      ['מעגל חסום במשולש ABC', 1],
      ['משולש ABC חסום במעגל', 1],
    ] as const) {
      const fig = replay(factsOf([u]), 0);
      const circles = fig.construction.objects.filter((o) => o.kind === 'circle' && !(o as { center: string }).center.startsWith('~'));
      expect(circles.length, `${u}: circles`).toBe(expectCircles);
      for (const c of circles) {
        const ctr = (c as { center: string }).center;
        expect(ctr.startsWith('@ctr-'), `${u}: centre "${ctr}" is anonymous`).toBe(true);
        // the letter itself is NOT a point (nothing squats the namespace)
        expect(fig.positions.has(ctr.slice(5)), `${u}: "${ctr.slice(5)}" free for the student`).toBe(false);
      }
    }
  });

  it('THE reported sequence: «P על המשך BA» creates the student\'s NEW P — never binds the hidden centre', () => {
    const fig = replay(factsOf(['שני מעגלים נחתכים', 'P על המשך BA']), 0);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(fig.violations).toEqual([]);
    expect(fig.pending, 'never the parked deferred-constraint the operator saw').toBe(false);
    const P = fig.positions.get('P')!;
    expect(beyond(P, fig.positions.get('A')!, fig.positions.get('B')!), 'P beyond A on ray B→A').toBe(true);
    // both circles intact, their centres anonymous and distinct from the student's P
    expect(fig.positions.has('@ctr-O')).toBe(true);
    expect(fig.positions.has('@ctr-P')).toBe(true);
  });

  it('semantic centre-use PROMOTES (ruling b): «רדיוס OB» makes O the real, visible centre — strictly', () => {
    const fig = replay(factsOf(['מעגל', 'רדיוס OB']), 0);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
    // STRICT: O is a real point (not the at() fallback), it IS the circle's centre, and B rides the circle.
    expect(fig.positions.has('O'), 'O promoted to a real point').toBe(true);
    const circle = fig.construction.objects.find((o) => o.kind === 'circle')! as { center: string };
    expect(circle.center, 'the circle is centred at O').toBe('O');
    const b = fig.construction.objects.find((o) => o.id === 'B')!;
    expect(b.kind, 'B rides the circle (the radius rim point)').toBe('on-circle');
    expect((b as { circle: string }).circle).toBe('circle-O');
  });

  it('a METRIC given binds the token (amended ruling): «OA=5» promotes O to the centre — a radius given', () => {
    const fig = replay(factsOf(['מעגל', 'OA=5']), 0);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
    // The textbook meaning: O IS the centre — promoted, and |OA| = 5 sizes the radius leg.
    expect(fig.positions.has('O'), 'O promoted').toBe(true);
    const circle = fig.construction.objects.find((o) => o.kind === 'circle')! as { center: string };
    expect(circle.center, 'the circle is centred at the promoted O').toBe('O');
    const O = fig.positions.get('O')!;
    const A = fig.positions.get('A')!;
    expect(Math.hypot(A.x - O.x, A.y - O.y), '|OA| = 5').toBeCloseTo(5, 3);
  });

  it('a POSITIONAL statement never binds (the reported bug class): «C על המשך AB» beside a circle keeps the letters fresh', () => {
    const fig = replay(factsOf(['מעגל', 'AB', 'C על המשך AB']), 0);
    for (const [, s] of Object.entries(fig.status)) expect(s).toBe('ok');
    expect(fig.positions.has('@ctr-O'), 'the anonymous centre is untouched').toBe(true);
  });

  it('the naming flow + converse: «מרכז המעגל הוא P» promotes, then «PA=5» binds the centre (a radius given)', () => {
    const st = useGeoStore.getState();
    const r0 = parse('מעגל', buildParseCtx(replay([], 0).construction, new Map()));
    if (!r0.ok) throw new Error('circle did not parse');
    st.executeMany(r0.commands, 'מעגל');
    const facts = useGeoStore.getState().facts;
    const fig = replay(facts, 0);
    const nc = parseNameCenter('מרכז המעגל הוא P', buildParseCtx(fig.construction, fig.positions));
    expect(nc, 'parseNameCenter resolves the sole auto centre').toBeTruthy();
    expect(st.nameCentre(nc!.from, nc!.to).ok).toBe(true);
    const after = replay(useGeoStore.getState().facts, 0);
    expect(after.positions.has('P'), 'P is the real centre now').toBe(true);
    const cmd = useGeoStore.getState().facts[0].cmd as { center?: string; autoCenter?: boolean };
    expect(cmd.center).toBe('P');
    expect(cmd.autoCenter, 'named ⇒ revealed').toBeUndefined();
    // the converse: PA=5 now binds the NAMED centre — the honest M1 radius given
    const r1 = parse('PA=5', buildParseCtx(after.construction, after.positions));
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.commands.some((c) => JSON.stringify(c).includes('"P"'))).toBe(true);
  });

  it('naming with TWO circles + a size qualifier resolves the right centre — never an arbitrary LLM point (#178)', () => {
    // The operator's exact dev sequence (2026-07-17): «שני מעגלים נחתכים» → «מרכז מעגל קטן הוא O1»
    // escalated to the LLM, which invented {free-point O1 at (3,2)}. parseNameCenter now reads the size
    // qualifier (articles optional) and resolves via the #102 core.
    const st = useGeoStore.getState();
    const r0 = parse('שני מעגלים נחתכים', buildParseCtx(replay([], 0).construction, new Map()));
    if (!r0.ok) throw new Error('did not parse');
    st.executeMany(r0.commands, 'שני מעגלים נחתכים');
    const figA = replay(useGeoStore.getState().facts, 0);
    const ctxA = buildParseCtx(figA.construction, figA.positions);
    const nc = parseNameCenter('מרכז מעגל קטן הוא O1', ctxA);
    expect(nc, 'the qualifier resolves — no LLM escalation').toBeTruthy();
    // the SMALL circle is the second one (seeded 3.6 vs 5) — its token is P
    expect(nc!.from).toBe('P');
    expect(nc!.to).toBe('O1');
    expect(nc!.assert, 'a first assigning use locks the roles (the #102 ruling)').toEqual({ outer: 'circle-O', inner: 'circle-P' });
    expect(st.nameCentre(nc!.from, nc!.to).ok).toBe(true);
    const after = replay(useGeoStore.getState().facts, 0);
    expect(after.positions.has('O1'), 'O1 is the real centre of the small circle').toBe(true);
    // the En mirror + the big qualifier, on a fresh figure
    st.clear();
    st.executeMany(r0.commands, 'שני מעגלים נחתכים');
    const figB = replay(useGeoStore.getState().facts, 0);
    const ncBig = parseNameCenter('the centre of the big circle is Q', buildParseCtx(figB.construction, figB.positions));
    expect(ncBig?.from).toBe('O');
    expect(ncBig?.to).toBe('Q');
    // NO qualifier with two circles → still honestly deferred (ambiguous)
    expect(parseNameCenter('מרכז המעגל הוא Q', buildParseCtx(figB.construction, figB.positions))).toBeNull();
  });

  it('dot-click promote routes a centre through the naming flow (reveal + circle-id follow)', () => {
    const st = useGeoStore.getState();
    const r0 = parse('מעגל', buildParseCtx(replay([], 0).construction, new Map()));
    if (!r0.ok) throw new Error('circle did not parse');
    st.executeMany(r0.commands, 'מעגל');
    const to = st.promote('@ctr-O');
    expect(to, 'promoted to the next free letter').toBeTruthy();
    const cmd = useGeoStore.getState().facts[0].cmd as { center?: string; autoCenter?: boolean };
    expect(cmd.center).toBe(to);
    expect(cmd.autoCenter, 'promoted ⇒ revealed').toBeUndefined();
  });
});

/**
 * #775 (ADR-465) — a special line to a side named by its ROLE: «תיכון ליתר» / «גובה ליתר» /
 * «תיכון לבסיס», + the «על צלע» preposition. Prod (session ks1up71f, 2026-08-17…24): «תיכון ליתר»
 * — the median to the hypotenuse, the phrasing a textbook uses — escalated to the paid LLM twice
 * for a construct the grammar nearly had. The hole was in the shared side-reference resolver
 * (both the median and the altitude heads failed identically), so the fix is one resolver:
 * the role noun resolves against the figure's DECLARED structure (`ctx.roleSides`) and the
 * utterance is rewritten to the letter form, serving every head that shares the side matchers.
 * A role with no unique referent refuses NAMING THE ROLE — never an arbitrary side (ADR-052).
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '../index';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { cyclableVariant, withVariant } from '@/engine';
import { renameInCommand } from '@/replay/naming';
import { buildMatchCtx } from '@/theorems';

function ctxAfter(utterances: string[]) {
  const facts: Fact[] = [];
  utterances.forEach((u, gi) => {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    expect(r.ok, u).toBe(true);
    if (r.ok) r.commands.forEach((cmd, ci) => facts.push({ id: `g${gi}.${ci}`, utterance: u, group: `g${gi}`, cmd, enabled: true }));
  });
  const { construction, positions } = replay(facts, 0);
  return buildParseCtx(construction, positions);
}

describe('#775 — the prod session: a right triangle, then the median to the hypotenuse', () => {
  const rt = ctxAfter(['משולש ישר זווית ABC']); // right angle at C (the engine convention) ⇒ hypotenuse AB

  it('«תיכון ליתר» builds the median from C to the midpoint of AB (the ks1up71f replay)', () => {
    for (const u of ['תיכון ליתר', 'התיכון ליתר', 'median to the hypotenuse']) {
      const r = parse(u, rt);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const mid = r.commands.find((c) => c.type === 'midpoint') as { a: string; b: string; id: string };
        expect([mid.a, mid.b].sort(), u).toEqual(['A', 'B']);
        const seg = r.commands.find((c) => c.type === 'segment') as { a: string; b: string };
        expect(seg.a, u).toBe('C');
      }
    }
  });

  it('the fix serves BOTH heads: «גובה ליתר» builds the altitude foot on AB from C', () => {
    const r = parse('גובה ליתר', rt);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const foot = r.commands.find((c) => c.type === 'foot') as { from: string; a: string; b: string };
      expect(foot.from).toBe('C');
      expect([foot.a, foot.b].sort()).toEqual(['A', 'B']);
    }
  });

  it('a run restating the side folds into the role («תיכון ליתר AB»)', () => {
    const r = parse('תיכון ליתר AB', rt);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mid = r.commands.find((c) => c.type === 'midpoint') as { a: string; b: string };
      expect([mid.a, mid.b].sort()).toEqual(['A', 'B']);
    }
  });

  it('the «על» preposition joins the letter-form slot: «תיכון על צלע BC» ≡ «תיכון לצלע BC»', () => {
    const a = parse('תיכון על צלע BC', rt);
    const b = parse('תיכון לצלע BC', rt);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.commands).toEqual(b.commands);
  });
});

describe('#775 — the isosceles roles, and the honest refusals', () => {
  const iso = ctxAfter(['משולש שווה שוקיים ABC']); // variant 0: apex A ⇒ base BC, legs AB, AC

  it('«תיכון לבסיס» / «גובה לבסיס» resolve the declared base', () => {
    for (const u of ['תיכון לבסיס', 'גובה לבסיס']) {
      const r = parse(u, iso);
      expect(r.ok, u).toBe(true);
      if (r.ok) {
        const target = r.commands.find((c) => c.type === 'midpoint' || c.type === 'foot') as { a: string; b: string };
        expect([target.a, target.b].sort(), u).toEqual(['B', 'C']);
      }
    }
  });

  it('«גובה לשוק» repetition semantics (#805 play, ADR-465 Am. 1+2): first leg, then the OTHER, then dedupe', () => {
    // The operator's exact complaint: repeating «גובה לשוק» stacked auto-named feet on one spot.
    // Now: the 1st takes a leg, the 2nd ROTATES to the unoccupied leg, and the 3rd re-lowers
    // IDENTICALLY to the 1st (foot reuse), which the #613 restate-dedupe reads as «already stated».
    const facts: Fact[] = [];
    let g = 0;
    const lower = (u: string) => {
      const { construction, positions } = replay(facts, 0);
      const r = parse(u, buildParseCtx(construction, positions));
      expect(r.ok, u).toBe(true);
      return r.ok ? r.commands : [];
    };
    const commit = (u: string) => {
      const cmds = lower(u);
      const grp = `g${g++}`;
      cmds.forEach((cmd) => facts.push({ id: `${grp}.${facts.length}`, utterance: u, group: grp, cmd, enabled: true }));
      return cmds;
    };
    commit('משולש שווה שוקיים ABC');
    const first = commit('גובה לשוק');
    const second = commit('גובה לשוק');
    const sideOf = (cmds: unknown[]): string => {
      const f = (cmds as { type: string; a: string; b: string }[]).find((c) => c.type === 'foot')!;
      return [f.a, f.b].sort().join('');
    };
    expect(['AB', 'AC']).toContain(sideOf(first));
    expect(['AB', 'AC']).toContain(sideOf(second));
    expect(sideOf(second), 'the repeat rotates to the OTHER leg').not.toBe(sideOf(first));
    // the 3rd re-lowers byte-identically to the 1st — the #613 dedupe's trigger, so no pile-up
    expect(lower('גובה לשוק')).toEqual(first);
    // explicit selection: letters after the role noun name WHICH leg
    const r = parse('גובה לשוק AC', buildParseCtx(replay(facts, 0).construction, replay(facts, 0).positions));
    expect(r.ok).toBe(true);
    if (r.ok) expect(sideOf(r.commands)).toBe('AC');
    // the median head keeps its own independent rotation
    const m1 = commit('תיכון לשוק');
    const m2 = lower('תיכון לשוק');
    const midSide = (cmds: unknown[]): string => {
      const f = (cmds as { type: string; a: string; b: string }[]).find((c) => c.type === 'midpoint')!;
      return [f.a, f.b].sort().join('');
    };
    expect(midSide(m2), 'the median rotates independently of the altitude').not.toBe(midSide(m1));
  });

  it('a role with NO referent refuses naming the role — a plain triangle has no hypotenuse', () => {
    const plain = ctxAfter(['משולש ABC']);
    const r = parse('תיכון ליתר', plain);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r).toEqual({ ok: false, reason: 'role-side-unresolved', role: 'יתר' });
  });

  it('a LATER-declared right angle induces the hypotenuse too (the class, not the macro)', () => {
    const rt2 = ctxAfter(['משולש ABC', 'זווית ABC = 90']);
    const r = parse('תיכון ליתר', rt2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const mid = r.commands.find((c) => c.type === 'midpoint') as { a: string; b: string };
      expect([mid.a, mid.b].sort()).toEqual(['A', 'C']); // right angle at B ⇒ hypotenuse AC
    }
  });
});

/**
 * #1810 (ADR-596) — a side named by its ROLE follows «הציגו תצורה אחרת». The role used to be resolved to
 * letters once, at parse time, so after one press «תיכון לבסיס» drew the median to a LEG. The commands now
 * carry the role binding and the replay fold re-resolves it against the configuration in force.
 */
describe('#1810 — a role-named side follows the configuration', () => {
  const factsFor = (us: string[]): Fact[] => {
    const facts: Fact[] = [];
    us.forEach((u, gi) => {
      const { construction, positions } = replay(facts, 0);
      const r = parse(u, buildParseCtx(construction, positions));
      expect(r.ok, u).toBe(true);
      if (r.ok) r.commands.forEach((cmd, ci) => facts.push({ id: `g${gi}.${ci}`, utterance: u, group: `g${gi}`, cmd, enabled: true }));
    });
    return facts;
  };
  /** The facts with the isosceles apex stepped to variant `v` — exactly the rewrite `cycleVariant` makes. */
  const atVariant = (facts: Fact[], v: number): Fact[] => facts.map((f) => (cyclableVariant(f.cmd) ? { ...f, cmd: withVariant(f.cmd, v) } : f));
  const view = (facts: Fact[]) => {
    const fig = replay(facts, 0);
    expect(Object.values(fig.status).every((s) => s === 'ok'), JSON.stringify(fig.status)).toBe(true);
    return fig;
  };
  type Fig = ReturnType<typeof replay>;
  const len = (fig: Fig, p: string, q: string) => {
    const a = fig.positions.get(p)!;
    const b = fig.positions.get(q)!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  /** The apex of the drawn isosceles: the vertex whose two sides measure equal. */
  const apexOf = (fig: Fig): string =>
    ['A', 'B', 'C'].find((r) => {
      const [p, q] = ['A', 'B', 'C'].filter((x) => x !== r);
      return Math.abs(len(fig, r, p) - len(fig, r, q)) < 1e-6;
    })!;
  const sideOf = (o: { a: string; b: string }) => [o.a, o.b].sort().join('');
  const baseOf = (apex: string) => ['A', 'B', 'C'].filter((x) => x !== apex).join('');
  const targets = (fig: Fig, kind: 'midpoint' | 'foot') =>
    fig.construction.objects.filter((o) => o.kind === kind) as unknown as { a: string; b: string; from?: string }[];

  it('«תיכון לבסיס» / «גובה לבסיס» / English: at EVERY variant the line goes from the apex to the base', () => {
    const cases = [
      ['תיכון לבסיס', 'midpoint'],
      ['גובה לבסיס', 'foot'],
      ['median to the base', 'midpoint'],
      ['altitude to the base', 'foot'],
    ] as const;
    for (const [line, kind] of cases) {
      const facts = factsFor(['משולש שווה שוקיים ABC', line]);
      const seen = new Set<string>();
      for (let v = 0; v < 3; v++) {
        const fig = view(atVariant(facts, v));
        const apex = apexOf(fig);
        seen.add(apex);
        const [t] = targets(fig, kind);
        expect(sideOf(t), `${line} @ variant ${v}`).toBe(baseOf(apex));
        if (kind === 'foot') expect(t.from, `${line} @ variant ${v}: from the apex`).toBe(apex);
      }
      expect([...seen].sort(), `${line}: the three variants are three apexes`).toEqual(['A', 'B', 'C']);
    }
  });

  it('«גובה לשוק» twice and «תיכון לשוק» twice: at every variant the two lines sit on the two LEGS, never the base', () => {
    for (const [line, kind] of [['גובה לשוק', 'foot'], ['תיכון לשוק', 'midpoint']] as const) {
      const facts = factsFor(['משולש שווה שוקיים ABC', line, line]);
      for (let v = 0; v < 3; v++) {
        const fig = view(atVariant(facts, v));
        const apex = apexOf(fig);
        const sides = targets(fig, kind).map(sideOf);
        expect(sides, `${line}×2 @ variant ${v}`).toHaveLength(2);
        expect(new Set(sides).size, `${line}×2 @ variant ${v}: two different legs`).toBe(2);
        for (const s of sides) expect(s.includes(apex) && s !== baseOf(apex), `${line} @ variant ${v}: ${s} is a leg at apex ${apex}`).toBe(true);
      }
    }
  });

  it('the rotation is path-independent: a second «גובה לשוק» typed AFTER a press still pairs with the first on the two legs', () => {
    const moved = atVariant(factsFor(['משולש שווה שוקיים ABC', 'גובה לשוק']), 1);
    const { construction, positions } = replay(moved, 0);
    const r = parse('גובה לשוק', buildParseCtx(construction, positions));
    expect(r.ok).toBe(true);
    const facts = [...moved];
    if (r.ok) r.commands.forEach((cmd, ci) => facts.push({ id: `g9.${ci}`, utterance: 'גובה לשוק', group: 'g9', cmd, enabled: true }));
    for (let v = 0; v < 3; v++) {
      const fig = view(atVariant(facts, v));
      const apex = apexOf(fig);
      const sides = targets(fig, 'foot').map(sideOf);
      expect(new Set(sides).size, `variant ${v}`).toBe(2);
      for (const s of sides) expect(s !== baseOf(apex), `variant ${v}: ${s} is not the base`).toBe(true);
    }
  });

  it('STABILITY: adding «תיכון לבסיס» never moves A, B, C — at any variant', () => {
    const tri = factsFor(['משולש שווה שוקיים ABC']);
    const both = factsFor(['משולש שווה שוקיים ABC', 'תיכון לבסיס']);
    for (let v = 0; v < 3; v++) {
      const a = replay(atVariant(tri, v), 0);
      const b = replay(atVariant(both, v), 0);
      for (const id of ['A', 'B', 'C']) {
        expect(b.positions.get(id)!.x, `${id} @ variant ${v}`).toBeCloseTo(a.positions.get(id)!.x, 9);
        expect(b.positions.get(id)!.y, `${id} @ variant ${v}`).toBeCloseTo(a.positions.get(id)!.y, 9);
      }
    }
  });

  it('a LATER statement that settles the apex moves the base too: «תיכון לבסיס» then «AB = BC» → the median goes to AC', () => {
    const fig = view(factsFor(['משולש שווה שוקיים ABC', 'תיכון לבסיס', 'AB = BC']));
    expect(apexOf(fig)).toBe('B');
    expect(sideOf(targets(fig, 'midpoint')[0])).toBe('AC');
  });

  it('the hypotenuse follows a re-seated right angle: «משולש ישר זווית ABC · תיכון ליתר · זווית BAC = 90» → the median goes to BC', () => {
    const fig = view(factsFor(['משולש ישר זווית ABC', 'תיכון ליתר', 'זווית BAC = 90']));
    expect(sideOf(targets(fig, 'midpoint')[0])).toBe('BC');
  });

  it('letters the STUDENT typed stay literal — no binding, so they never rotate (the #1810 ruling)', () => {
    const iso = ctxAfter(['משולש שווה שוקיים ABC']);
    for (const u of ['AD גובה לבסיס', 'גובה לשוק AC', 'תיכון לבסיס BC']) {
      const r = parse(u, iso);
      expect(r.ok, u).toBe(true);
      if (r.ok) expect(r.commands.every((c) => c.roleSide === undefined), u).toBe(true);
    }
    const r = parse('תיכון לבסיס', iso);
    expect(r.ok).toBe(true);
    if (r.ok) for (const c of r.commands) expect(c.roleSide).toEqual({ role: 'base', ring: ['A', 'B', 'C'], at: 'A' });
  });

  it('renaming a vertex renames the binding with it', () => {
    const facts = factsFor(['משולש שווה שוקיים ABC', 'תיכון לבסיס']);
    const m = facts.find((f) => f.cmd.type === 'midpoint')!;
    expect(renameInCommand(m.cmd, 'A', 'P').roleSide).toEqual({ role: 'base', ring: ['P', 'B', 'C'], at: 'P' });
  });

  it('the theorem context reads the line as the figure draws it (the side in force, not the parse-time letters)', () => {
    const facts = atVariant(factsFor(['משולש שווה שוקיים ABC', 'תיכון לבסיס']), 1);
    const fig = view(facts);
    const ctx = buildMatchCtx(facts, fig.construction);
    const mid = ctx.facts.find((f) => f.cmd.type === 'midpoint')!.cmd as { a: string; b: string };
    expect(sideOf(mid)).toBe(baseOf(apexOf(fig)));
  });
});

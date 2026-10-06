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
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: vi.fn(async () => ({ built: [], dropped: [] })) })); // never asked (standing rule 2)
import { parse, impliedCircleBinding, buildParseCtx } from '@/parser';
import { replay, nameCentreFacts } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { decideDeterministic2D, type Verdict2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { useGeoStore } from '@/store/geoStore';

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

  it('two FRESH intersecting circles + no signal → the first is named, by order (#1688 ruling (b), ADR-565)', () => {
    // nothing tells the pair apart — swapping them only reflects the figure — so naming either asserts nothing
    const facts = factsFrom(['שני מעגלים נחתכים']);
    const cmds = parseOk('E ו C על מעגל O2', facts); // E,C are new — no signal
    expect(impliedCircleBinding(cmds, ctxOf(facts))).toEqual({ from: 'O', to: 'O2' });
  });

  it('two unnamed circles a statement tells apart + NO membership signal → clarify (never a silent pick)', () => {
    const facts: Fact[] = [
      ...factsFrom(['שני מעגלים נחתכים']),
      { id: 'r.0', group: 'r', utterance: 'D על המעגל', cmd: { type: 'point-on-circle', id: 'D', circle: 'circle-P' } as AnyCommand, enabled: true },
    ];
    const cmds = parseOk('E ו C על מעגל O2', facts); // E,C are new — no signal; D distinguishes circle P
    expect(impliedCircleBinding(cmds, ctxOf(facts))).toEqual({ clarify: 'unknown-circle', center: 'O2' });
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

/**
 * #1694 — a FRESH circle letter in a sentence that places an existing point on that circle names the drawn circle
 * the point rides; it never mints a further circle through the student's points. The creation a rule makes for the
 * letter (`resolveOrIntroduceCircle`, `circleOnDiameter`) is a `'by-member'` naming-by-use candidate, and
 * `impliedCircleBinding` binds it ONLY on a membership signal. Through the real pre-LLM decision, each accepted line
 * applied as the pipeline applies it, counting circles in the figure.
 */
describe('#1694 — a fresh letter in a chord/diameter sentence names the drawn circle its point rides', () => {
  const st = () => useGeoStore.getState();
  const OPEN = 'שני מעגלים נחתכים בנקודות A ו-B';
  async function run(lines: string[]): Promise<Verdict2D[]> {
    st().clear();
    const out: Verdict2D[] = [];
    for (const line of lines) {
      const d = replay(st().facts, st().seed);
      const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: d.construction, positions: d.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
      if (v.kind === 'store-op') expect(v.op === 'name-centre' ? st().nameCentre(v.from, v.to) : st().rename(v.from, v.to)).toEqual({ ok: true });
      else commitVerdict(v, line);
      out.push(v);
    }
    return out;
  }
  const fig = () => replay(st().facts, st().seed);
  const centres = () => (fig().construction.objects.filter((o) => o.kind === 'circle') as unknown as { center: string }[]).map((c) => c.center);
  /** the circles a crossing point is structurally built from */
  const crossingOf = (id: string) => {
    const o = fig().construction.objects.find((x) => x.id === id) as unknown as { kind: string; circle1: string; circle2: string };
    return o.kind === 'circle-circle' ? [o.circle1, o.circle2].sort() : [];
  };
  const green = (vs: Verdict2D[]) => {
    vs.forEach((v, i) => expect(['commit', 'noop', 'store-op'], `line ${i + 1}: ${JSON.stringify(v).slice(0, 160)}`).toContain(v.kind));
    expect(Object.values(fig().status).every((s) => s === 'ok')).toBe(true);
  };

  // the class: every rule family that introduces the letter, both locales
  for (const [title, line, letter] of [
    ['a chord', 'AD מיתר במעגל P', 'P'],
    ['a chord, noun first', 'המיתר AD במעגל P', 'P'],
    ['a diameter with a new end', 'AD קוטר במעגל P', 'P'],
    ['a diameter through the other crossing', 'BD קוטר במעגל O', 'O'],
    ['a chord between the two crossings', 'AB מיתר במעגל O', 'O'],
    ['a tangent at a crossing', 'משיק למעגל P בנקודה A', 'P'],
    ['English: a chord', 'chord AD in circle P', 'P'],
    ['English: a diameter', 'AD is a diameter of circle P', 'P'],
  ] as const) {
    it(`${title} — «${line}» names one of the two drawn circles ${letter}; no third circle`, async () => {
      green(await run([line.startsWith('chord') || line.startsWith('AD is') ? 'two circles intersecting at A and B' : OPEN, line]));
      expect(centres(), 'still two circles').toHaveLength(2);
      expect(centres(), `one of them is named ${letter}`).toContain(letter);
      expect(crossingOf('A'), `A is a crossing of circle ${letter} itself`).toContain(`circle-${letter}`);
    });
  }

  it('the operator\'s combined sentence names BOTH circles — O by its tangency, P by its chord', async () => {
    green(await run([OPEN, 'AD מיתר במעגל P משיק למעגל O בנקודה A']));
    expect(centres().sort()).toEqual(['O', 'P']);
    expect(crossingOf('A')).toEqual(['circle-O', 'circle-P']);
    expect(crossingOf('B')).toEqual(['circle-O', 'circle-P']);
  });

  it('one circle named, one not: «AD מיתר במעגל P» names the OTHER circle (A rides only that unnamed one)', async () => {
    green(await run([OPEN, 'O מרכז המעגל', 'AD מיתר במעגל P']));
    expect(centres().sort()).toEqual(['O', 'P']);
  });

  it('a diameter that names the circle is still a diameter: P lies on AD, midway', async () => {
    green(await run([OPEN, 'AD קוטר במעגל P']));
    const p = fig().positions;
    const [A, D, P] = ['A', 'D', 'P'].map((id) => p.get(id)!);
    expect(Math.hypot((A.x + D.x) / 2 - P.x, (A.y + D.y) / 2 - P.y), 'P is the midpoint of AD').toBeLessThan(1e-6);
  });

  it('circles a statement tells apart: the crossing A rides both, so «AD מיתר במעגל P» ASKS which circle', async () => {
    const vs = await run([OPEN, 'C על המעגל הגדול', 'AD מיתר במעגל P']);
    expect(vs[2]).toMatchObject({ kind: 'refuse', category: 'clarify', note: { key: 'input.unknownCircle' } });
    expect(centres(), 'nothing minted').toHaveLength(2);
  });

  // must-not-change guards: no membership signal → the letter declares a NEW circle (ADR-565 decision 1)
  it('«CD קוטר במעגל O» with new C, D beside the pair is still a NEW circle', async () => {
    green(await run([OPEN, 'CD קוטר במעגל O']));
    expect(centres(), 'the pair + the new circle on CD').toHaveLength(3);
  });

  it('«מעגל O» alone is still a new circle', async () => {
    green(await run([OPEN, 'מעגל O']));
    expect(centres()).toHaveLength(3);
  });

  it('«שני מעגלים משיקים מבחוץ» · «AB קוטר במעגל O» with A, B new is still a new circle (nothing rides the pair)', async () => {
    green(await run(['שני מעגלים משיקים מבחוץ', 'AB קוטר במעגל O']));
    expect(centres()).toHaveLength(3);
  });

  it('decision level: a by-member candidate with NO membership signal binds nothing (no sole-circle fallback)', () => {
    const facts = factsFrom(['AB קוטר']); // ONE unnamed circle — the sole-circle fallback would have bound it
    const candidate = (implied: true | 'by-member'): AnyCommand[] => [
      { type: 'circle', id: 'circle-X', center: 'X', radius: 5, freeRadius: true, ifAbsent: true, implied },
      { type: 'point-on-circle', id: 'Z', circle: 'circle-X' }, // Z is new: no signal
    ];
    expect(impliedCircleBinding(candidate('by-member'), ctxOf(facts))).toBeNull();
    expect(impliedCircleBinding(candidate(true), ctxOf(facts)), 'a reference (`implied: true`) still binds the sole circle').toEqual({ from: expect.any(String), to: 'X' });
  });
});

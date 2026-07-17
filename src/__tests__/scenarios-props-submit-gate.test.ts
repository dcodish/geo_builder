import { describe, it, expect } from 'vitest';
import { parse, droppedNewLabels, droppedGivenNumbers, droppedGivenRelations, droppedGivenVerbs } from '@/parser';
import { replay, useGeoStore, dryRunOutcome, hasDeferrableConstraint } from '@/store/geoStore';
import { humanizeError } from '@/i18n/humanizeError';
import { ctxOf, at, dist } from './scenarios-corpus';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Id } from '@/engine';

/**
 * App.submit-faithful regression — the SCENARIOS above use parse→replay, which does NOT exercise the
 * input gate (droppedNewLabels → dryRunOutcome → commit-or-escalate). A constraint that can't solve at its
 * position dry-run-errors, and the gate used to ESCALATE it to the LLM (dropping it) instead of committing
 * it for deferral — so the operator's "CE⟂AB before the sizes" never even entered the fact list. This test
 * mirrors App.submit exactly (ADR-104) to lock that such a constraint is COMMITTED and later resolved.
 */
describe('reported scenarios — App.submit gate commits a deferrable constraint (ADR-104)', () => {
  it('[q4-commit-deferred-perpendicular] CE⟂AB typed before CD=36/DE=18 commits and resolves through the real submit gate', () => {
    const st = useGeoStore.getState();
    st.clear();
    // Mirror App.submit's deterministic path for each utterance.
    const submit = (utterance: string, llm?: AnyCommand[]) => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      let commands: AnyCommand[] | null = null;
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0 && droppedGivenNumbers(utterance, r.commands).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) commands = r.commands;
      }
      if (!commands) commands = llm ?? null; // LLM second attempt (mocked: pass the canonical commands)
      expect(commands, `step did not commit: ${utterance}`).not.toBeNull();
      const group = `g${utterance}`;
      for (const c of commands!) useGeoStore.getState().execute(c, utterance, group);
    };
    submit('שני מעגלים נחתכים בנקודות A ו B'); // (deterministic two-circles)
    submit('נקודה C על מעגל P');
    submit('המשך CA חותך את מעגל O בנקודה D');
    submit('המשך CB חותך את מעגל O בנקודה E');
    submit('נקודה G על המשך DE');
    submit('CG חותך את מעגל P בנקודה F');
    submit('AF ו BC נחתכים בנקודה H');
    submit('∠GEC = ∠CHA');
    submit('CE⊥AB'); // ← the step that used to escalate-and-drop; now commits for deferral
    submit('CD=36');
    submit('DE=18');
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    for (const [id, s] of Object.entries(fig.status)) expect(s, `status ${id}`).toBe('ok');
    expect(fig.lastError).toBeNull();
    const C = at(fig, 'C'), D = at(fig, 'D'), E = at(fig, 'E'), A = at(fig, 'A'), B = at(fig, 'B');
    expect(dist(C, D)).toBeCloseTo(36, 0);
    expect(dist(D, E)).toBeCloseTo(18, 0);
    const dot = (E.x - C.x) * (B.x - A.x) + (E.y - C.y) * (B.y - A.y);
    expect(Math.abs(dot) / (Math.hypot(E.x - C.x, E.y - C.y) * Math.hypot(B.x - A.x, B.y - A.y))).toBeLessThan(0.02);
    st.clear();
  });

  it('[re-entry-noop-message] re-typing an existing construct is a friendly no-op, not an escalation (ADR-156)', () => {
    const st = useGeoStore.getState();
    st.clear();
    // Mirror App.submit's classification of the deterministic path: commit | noop ("already drawn") | escalate.
    const classify = (utterance: string): { kind: 'commit' | 'noop' | 'escalate'; commands?: AnyCommand[] } => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0 && droppedGivenNumbers(utterance, r.commands).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) return { kind: 'commit', commands: r.commands };
        if (outcome.reason === 'empty') {
          const existing = new Set((ctx.points ?? []).map((p) => p.toUpperCase()));
          const newLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])].filter((l) => !existing.has(l));
          if (newLabels.length === 0) return { kind: 'noop' };
        }
      }
      return { kind: 'escalate' };
    };
    const commit = (u: string) => {
      const res = classify(u);
      expect(res.kind, `first ${u}`).toBe('commit');
      res.commands!.forEach((c) => useGeoStore.getState().execute(c, u, 'g-' + u));
    };
    // re-typing a shape → no-op (not escalate)
    commit('square ABCD');
    expect(classify('square ABCD').kind, 're-typed square is a no-op').toBe('noop');
    // re-inscribing points already on a circle → no-op (no duplicate, no escalate)
    st.clear();
    commit('מרובע ABCD חסום במעגל');
    expect(classify('מרובע ABCD חסום במעגל').kind, 're-inscribe is a no-op').toBe('noop');
    // a genuinely NEW construct still commits (the no-op gate doesn't swallow real work)
    expect(classify('E על AB').kind, 'a new point still commits').toBe('commit');
    st.clear();
  });

  it('[shape-cannot-morph-into-another] a trapezoid cannot be turned into a square/rectangle/rhombus/parallelogram (ADR-157)', () => {
    // PRINCIPLE: a named shape is immutable once drawn — re-declaring its vertices as a different, incompatible
    // shape is a CONTRADICTION and is refused (not silently morphed). We deliberately have no "morph" capability.
    const st = useGeoStore.getState();
    for (const target of ['square ABCD', 'rectangle ABCD', 'rhombus ABCD', 'parallelogram ABCD']) {
      st.clear();
      const base = parse('trapezoid ABCD', ctxOf(useGeoStore.getState().facts));
      expect(base.ok).toBe(true);
      if (base.ok) base.commands.forEach((c) => useGeoStore.getState().execute(c, 'trapezoid ABCD', 'g'));
      const facts = useGeoStore.getState().facts;
      const r = parse(target, ctxOf(facts));
      expect(r.ok, `${target} parses`).toBe(true);
      if (r.ok) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        // refused as a contradiction — NOT produced (no silent morph), and a deferrable constraint must not sneak it in
        expect(outcome.produced, `${target} must NOT reshape the trapezoid`).toBe(false);
        if (!outcome.produced) expect(outcome.reason === 'error' && !hasDeferrableConstraint(r.commands), `${target} is a hard conflict`).toBe(true);
      }
    }
    st.clear();
  });

  it('[contradiction-message] making an existing trapezoid a square reports a CONFLICT, not "produced nothing" (ADR-156)', () => {
    const st = useGeoStore.getState();
    st.clear();
    // Mirror App.submit: a cleanly-parsed command that dry-run ERRORS (non-deferrable) is a contradiction with
    // the figure → a SPECIFIC humanizable reason, NOT an escalation to the generic "produced nothing".
    const classify = (utterance: string): { kind: 'commit' | 'conflict' | 'noop' | 'escalate'; detail?: string } => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0 && droppedGivenNumbers(utterance, r.commands).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) return { kind: 'commit' };
        if (outcome.reason === 'error') return { kind: 'conflict', detail: outcome.detail };
        if (outcome.reason === 'empty') return { kind: 'noop' };
      }
      return { kind: 'escalate' };
    };
    const tr = parse('טרפז ABCD', ctxOf(useGeoStore.getState().facts));
    expect(tr.ok).toBe(true);
    if (tr.ok) tr.commands.forEach((c) => useGeoStore.getState().execute(c, 'טרפז ABCD', 'g1'));
    const res = classify('ריבוע ABCD'); // ask the trapezoid to become a square — impossible with the current data
    expect(res.kind, 'a contradiction, not escalate-to-produced-nothing').toBe('conflict');
    expect(res.detail, 'a specific reason is surfaced (humanized in the UI)').toBeTruthy();
    expect(humanizeError(res.detail!, (k: string) => k), 'the reason maps to a clear error message').not.toBe(res.detail);
    st.clear();
  });

  it('[pending-vs-contradiction] CE⟂AB before sizes applies CLEAN (satisfied, no error — was pending); ∠DAB=37 on a square is a hard contradiction', () => {
    // The Q4 ⟂ entered before the sizes used to DEFER (the ADR-104 pending info state): the early coupled
    // solve never landed. Since ADR-238 the anti-collapse retry gives a failed driven solve a second,
    // differently-shaped search — and this one lands: the ⟂ is satisfied IMMEDIATELY on the still-flexible
    // figure (asserted below to solver precision), strictly better than the amber "waiting for givens".
    // The with-sizes completion is locked separately (`q4-constraints-order-independent`). The invariant
    // this half keeps: a SATISFIABLE early constraint is never a red error — vs the second half's rigid
    // contradiction, which must stay red.
    const q4: AnyCommand[] = [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
      { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
      { type: 'extend-onto-circle', id: 'E', a: 'C', b: 'B', circle: 'circle-O' },
      { type: 'point-on-segment', id: 'G', a: 'D', b: 'E', t: 1.3, extension: true },
      { type: 'line-through', id: 'chord-CG', a: 'C', b: 'G' },
      { type: 'line-circle-intersection', id: 'F', line: 'chord-CG', circle: 'circle-P', avoid: 'C' },
      { type: 'line-line-intersection', id: 'H', a: 'A', b: 'F', c: 'B', d: 'C' },
      { type: 'set-angle-ratio', v1: 'E', a1: 'G', b1: 'C', v2: 'H', a2: 'C', b2: 'A', k: 1 },
      { type: 'set-perpendicular', a: 'C', b: 'E', c: 'A', d: 'B' },
    ] as AnyCommand[];
    const fq = replay(q4.map((cmd, i) => ({ id: 'p' + i, group: 'g' + i, enabled: true, utterance: '', cmd } as Fact)));
    expect(fq.lastError, 'a satisfiable early constraint is never a red error').toBeNull();
    for (const [id, s] of Object.entries(fq.status)) expect(s, `status of ${id}`).toBe('ok');
    expect(fq.pending, 'the ⟂ is satisfied immediately (ADR-238 retry), not deferred').toBe(false);
    const p = (id: Id) => at(fq, id);
    const u = { x: p('E').x - p('C').x, y: p('E').y - p('C').y };
    const v = { x: p('B').x - p('A').x, y: p('B').y - p('A').y };
    const cos = Math.abs((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)));
    expect(cos, 'CE ⟂ AB genuinely holds on the flexible figure (not a false green)').toBeLessThan(1e-4);
    // CONTRADICTION: ∠DAB on a square is structurally 90°, so "= 37" can never hold — a hard error, NOT pending.
    const sq: AnyCommand[] = [
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'B', value: 37 },
    ] as AnyCommand[];
    const fs = replay(sq.map((cmd, i) => ({ id: 's' + i, group: 'g' + i, enabled: true, utterance: '', cmd } as Fact)));
    expect(fs.pending, '∠DAB=37 on a square is NOT pending (rigid contradiction)').toBe(false);
    expect(fs.lastError, 'it surfaces as a hard error').toMatch(/over-constrained/i);
  });

  it('[isosceles-pin-soft-pair] "AB=AC" after "משולש שווה שוקיים" COMMITS (pins the soft pair) — was wrongly "already drawn" (session z4v1zza3)', () => {
    // The isosceles draws with a SOFT default pair (apex A ⇒ |AB|=|AC|) that is NOT reported as forced —
    // "which pair is equal" is genuinely unstated (ADR-052/138). When the student then states `AB=AC`
    // (naming the pair) it happens to MATCH the hidden default, so the geometry doesn't move — and the gate
    // used to read that as "already drawn — nothing to add", swallowing the student's choice. It is genuine
    // new information: it PINS soft → forced. Now it COMMITS, and "show equal length" reports AB=AC.
    const st = useGeoStore.getState();
    st.clear();
    const classify = (utterance: string): { kind: 'commit' | 'noop' | 'escalate'; commands?: AnyCommand[] } => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      if (r.ok && droppedNewLabels(utterance, r.commands, ctx.points ?? []).length === 0 && droppedGivenNumbers(utterance, r.commands).length === 0) {
        const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
        if (outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands))) return { kind: 'commit', commands: r.commands };
        if (outcome.reason === 'empty') {
          const existing = new Set((ctx.points ?? []).map((p) => p.toUpperCase()));
          const newLabels = [...new Set(utterance.match(/[A-Z]\d*/g) ?? [])].filter((l) => !existing.has(l));
          if (newLabels.length === 0) return { kind: 'noop' };
        }
      }
      return { kind: 'escalate' };
    };
    const commit = (u: string) => {
      const res = classify(u);
      expect(res.kind, `commit ${u}`).toBe('commit');
      res.commands!.forEach((c) => useGeoStore.getState().execute(c, u, 'g-' + u));
    };
    // 1. the isosceles draws; the pair is unspecified → "show equal length" reports NOTHING forced.
    commit('משולש ABC שווה שוקיים');
    useGeoStore.getState().viewRelations();
    expect(useGeoStore.getState().relations!.result.equalSegments, 'no forced equality yet (pair unspecified)').toEqual([]);
    // 2. "AB=AC" is the student CHOOSING the pair — it COMMITS (was a "noop"/already-drawn dead-end).
    expect(classify('AB=AC').kind, 'AB=AC pins the soft default → commits').toBe('commit');
    commit('AB=AC');
    // 3. now the equality IS reported (the pin flips soft → forced) and holds geometrically.
    useGeoStore.getState().viewRelations();
    expect(useGeoStore.getState().relations!.result.equalSegments.length, 'AB=AC now reported as forced equal').toBeGreaterThan(0);
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(dist(at(fig, 'A'), at(fig, 'B')), '|AB| = |AC| holds').toBeCloseTo(dist(at(fig, 'A'), at(fig, 'C')), 3);
    st.clear();
  });
});

/**
 * The 2025-bagrut two-circle figure through the FULL App.submit gate set (#54/#99/#100 play-test,
 * ADR-302/303/304 amendment). The scenario corpus replays parse→replay, which skips the honesty gates —
 * and the operator's play-test found exactly there what the tests missed: `droppedNewLabels` read the
 * bound radius letter R in "R > r" as a dropped point ("weak:dropped:R" → needless LLM → not-understood),
 * and `droppedGivenVerbs` read the definite tangent back-reference ("המשיק חותך…", whose lowering
 * REFERENCES line tan-A but contains no `tangent` command) as a dropped משיק verb. This mirrors
 * App.submit's gate order EXACTLY — labels (with the figure's bound measure symbols), numbers,
 * relations, verbs, then dry-run — so every step of the exam figure must COMMIT deterministically,
 * with no step leaking to the LLM.
 */
describe('reported scenarios — the 2025-bagrut figure passes the FULL submit gate set (#54/#99/#100)', () => {
  it('[bagrut-2025-submit-gates] all 11 utterances commit deterministically through every honesty gate', () => {
    const st = useGeoStore.getState();
    st.clear();
    const submit = (utterance: string) => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      expect(r.ok, `parses: ${utterance} (${!r.ok ? r.reason : ''})`).toBe(true);
      if (!r.ok) return;
      // the four honesty gates, in App.submit's order — all must stay silent on a correct lowering
      const symbols = (ctx.radiusSymbols ?? []).map((x) => x.name);
      expect(droppedNewLabels(utterance, r.commands, ctx.points ?? [], symbols), `labels gate: ${utterance}`).toEqual([]);
      expect(droppedGivenNumbers(utterance, r.commands), `numbers gate: ${utterance}`).toEqual([]);
      expect(droppedGivenRelations(utterance, r.commands), `relations gate: ${utterance}`).toEqual([]);
      expect(droppedGivenVerbs(utterance, r.commands), `verbs gate: ${utterance}`).toEqual([]);
      const outcome = dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {});
      const commits = outcome.produced || (outcome.reason === 'error' && hasDeferrableConstraint(r.commands));
      expect(commits, `dry-run commits: ${utterance} (${!outcome.produced ? outcome.reason : ''})`).toBe(true);
      r.commands.forEach((c) => useGeoStore.getState().execute(c, utterance, 'g-' + utterance));
    };
    for (const u of [
      'מעגל P שרדיוסו R',
      'מעגל O שרדיוסו r',
      'R > r',
      'הנקודה O נמצאת על מעגל P',
      'A היא אחת מנקודות החיתוך של מעגל O ומעגל P',
      'דרך הנקודה A העבירו משיק למעגל O',
      'המשיק חותך את מעגל P בנקודה K',
      'משולש KAO',
      'הנקודה E נמצאת על מעגל O בתוך המשולש KAO',
      'המשך הקטע AE חותך את הקטע OK בנקודה M',
      'R=1.5r', // the operator's exact glued form
    ]) {
      submit(u);
    }
    const state = useGeoStore.getState();
    const fig = replay(state.facts, state.seed);
    expect(fig.lastError).toBeNull();
    // the ratio holds and E is on the small circle (the geometric spine; the corpus scenario asserts the rest)
    expect(fig.circles.get('circle-P')!.r / fig.circles.get('circle-O')!.r).toBeCloseTo(1.5, 4);
    st.clear();
  });

  it('[bagrut-2025-second-session] the operator’s SECOND play-test flow commits end-to-end (session yla2d4xo round 2)', () => {
    // The natural flow they actually used: two intersecting circles + after-the-fact radius naming +
    // the ONE-SENTENCE tangent compound + region-then-membership in the OPPOSITE order. Every step
    // must clear all four gates and commit; the true-duplicate re-statement stays a friendly no-op.
    const st = useGeoStore.getState();
    st.clear();
    const gateAndClassify = (utterance: string) => {
      const facts = useGeoStore.getState().facts;
      const ctx = ctxOf(facts);
      const r = parse(utterance, ctx);
      expect(r.ok, `parses: ${utterance} (${!r.ok ? r.reason : ''})`).toBe(true);
      if (!r.ok) return null;
      const symbols = (ctx.radiusSymbols ?? []).map((x) => x.name);
      expect(droppedNewLabels(utterance, r.commands, ctx.points ?? [], symbols), `labels gate: ${utterance}`).toEqual([]);
      expect(droppedGivenNumbers(utterance, r.commands), `numbers gate: ${utterance}`).toEqual([]);
      expect(droppedGivenRelations(utterance, r.commands), `relations gate: ${utterance}`).toEqual([]);
      expect(droppedGivenVerbs(utterance, r.commands), `verbs gate: ${utterance}`).toEqual([]);
      return { commands: r.commands, outcome: dryRunOutcome(facts, r.commands, useGeoStore.getState().seed, {}) };
    };
    const submit = (utterance: string) => {
      const res = gateAndClassify(utterance)!;
      expect(res.outcome.produced, `commits: ${utterance} (${!res.outcome.produced ? res.outcome.reason : ''})`).toBe(true);
      res.commands.forEach((c) => useGeoStore.getState().execute(c, utterance, 'g-' + utterance));
    };
    submit('שני מעגלים נחתכים');
    submit('רדיוס מעגל O הוא r');
    submit('רדיוס מעגל P הוא R');
    submit('R>r');
    submit('דרך A עובר משיק למעגל O שחותך את מעגל P בנקודה K'); // the one-sentence compound (was a gate-caught misparse)
    // ADR-342: a bare positional «O על מעגל P» now creates a FRESH O — the session's intent (the CENTRE
    // rides circle P) is expressed by promoting the centre first via the semantic carve-out.
    submit('רדיוס OA');
    submit('O על מעגל P');
    submit('משולש AKO');
    submit('נקודה E בתוך משולש AKO'); // region FIRST — E a free point seeded inside
    submit('E על מעגל O'); // THEN membership — converts E at its own bearing (c2)
    // the exact duplicate is a truthful no-op, never a commit and never an escalation
    const dup = gateAndClassify('נקודה E בתוך משולש AKO')!;
    expect(dup.outcome.produced).toBe(false);
    expect(!dup.outcome.produced && dup.outcome.reason).toBe('empty');
    const state = useGeoStore.getState();
    const fig = replay(state.facts, state.seed);
    expect(fig.lastError).toBeNull();
    const O = at(fig, 'O'), E = at(fig, 'E'), A = at(fig, 'A');
    expect(dist(O, E), 'E on circle O').toBeCloseTo(dist(O, A), 5);
    st.clear();
  });
});

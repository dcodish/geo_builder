/**
 * #831 (ADR-468) — «זווית A=α»: the SINGLE-VERTEX angle takes a symbol, as its neighbours all do.
 *
 * Prod session `mhcpvsvx` (2026-08-23). The student pushed on this four times in ~60 seconds and then
 * found the working form themselves:
 *
 *   סימון זווית A ע"י אלפא   → scope:ui-command  (guided — correct, this IS an imperative)
 *   סימון זווית A ע"י α      → scope:ui-command  (guided — correct)
 *   זווית A=α                → llm → not-understood        ← the gap
 *   זווית BAD=α              → ✓ measure-angle             ← their own recovery
 *
 * Both halves shipped; only their intersection was missing. `angle` owned the single-vertex lane but
 * required a NUMBER; `measureAngle` owned symbols but required a three-label run — so a symbolic
 * single-vertex angle fell between two rules that had each solved half the problem.
 *
 * This is #772's defect (a value slot that is number-only where its sibling takes both) and it takes
 * #772's fix: the vertex is read ONCE, by `angleArms`, for every value kind. The tests below are
 * therefore mostly about the SHARED reader — a fix that only taught `measureAngle` to count to one
 * would pass the first test and leave the class alive.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';

function ctxOf() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed, st.radiusOverrides);
  return buildParseCtx(d.construction, d.positions);
}
function figure(utterances: string[]) {
  useGeoStore.getState().clear();
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    if (!r.ok) throw new Error(`setup failed on "${u}": ${JSON.stringify(r)}`);
    for (const c of r.commands) useGeoStore.getState().execute(c, u);
  }
  return ctxOf();
}
const kinds = (setup: string[], line: string) => {
  const r = parse(line, figure(setup));
  return r.ok ? r.commands.map((c) => c.type) : r;
};

/** The student's own session prefix, from the prod log. */
const STUDENT = ['טרפז חסום במעגל', 'הצלע AB היא קוטר', 'נקודה O מרכז המעגל'];

describe('#831 — the reported gap', () => {
  it("«זווית A=α» builds, in the student's own session prefix", () => {
    expect(kinds(STUDENT, 'זווית A=α')).toEqual(['measure-angle']);
  });

  it('and context-free on a bare triangle — the issue verified both, so both are locked', () => {
    expect(kinds(['משולש ABC'], 'זווית A=α')).toEqual(['measure-angle']);
  });

  it('it really names THAT angle — the arms come from the vertex\'s two edges', () => {
    const r = parse('זווית A=α', figure(['משולש ABC']));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cmd = r.commands[0] as { type: string; vertex: string; ray1: string; ray2: string; expr: { coef: number; var: string } };
    expect(cmd.vertex).toBe('A');
    expect([cmd.ray1, cmd.ray2].sort()).toEqual(['B', 'C']);
    expect(cmd.expr).toEqual({ coef: 1, var: 'α' });
  });
});

describe('#831 — the neighbours that already worked still do', () => {
  it('the numeric single-vertex form is unchanged', () => {
    expect(kinds(['משולש ABC'], 'זווית A=40')).toEqual(['segment', 'segment', 'set-angle']);
  });

  it('the three-letter symbolic form is unchanged', () => {
    expect(kinds(['משולש ABC'], 'זווית BAC=α')).toEqual(['measure-angle']);
  });

  it('the three-letter numeric form is unchanged', () => {
    expect(kinds(['משולש ABC'], 'זווית ABC=40')).toEqual(['segment', 'segment', 'set-angle']);
  });

  it('the right-angle WORD form is unchanged (#45 / ADR-299)', () => {
    expect(kinds(['משולש ABC'], 'זווית A ישרה')).toEqual(['segment', 'segment', 'set-angle']);
  });

  it('a LOWERCASE single vertex still resolves (#45 / ADR-299)', () => {
    // `b`, not `a`: `labelRun` strips FILLER before reading labels and a lone `a` is the English
    // article, so «זווית a=40» is not-handled — on main as well as here. Pre-existing and unrelated
    // to this fix; noted rather than quietly swept in.
    expect(kinds(['משולש ABC'], 'זווית b=40')).toEqual(['segment', 'segment', 'set-angle']);
  });

  it('a lowercase vertex takes a SYMBOL too — the gap closed on that lane as well', () => {
    expect(kinds(['משולש ABC'], 'זווית b=α')).toEqual(['measure-angle']);
  });
});

describe('#831 — the shared reader, which is where the fix actually lives', () => {
  it('a COEFFICIENT works on the single-vertex form too — «זווית A=2α»', () => {
    const r = parse('זווית A=2α', figure(['משולש ABC']));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.commands[0] as { expr: { coef: number; var: string } }).expr).toEqual({ coef: 2, var: 'α' });
  });

  it('the English mirror works, without a rule of its own', () => {
    expect(kinds(['triangle ABC'], 'angle A = α')).toEqual(['measure-angle']);
  });

  it('an AMBIGUOUS vertex ASKS rather than guessing — in the symbolic lane too', () => {
    // A has three edges once the diagonal is drawn, so "the angle at A" names several. The numeric
    // lane always asked; sharing the reader is what gives the symbolic lane the same honesty
    // instead of an LLM escalation or a silent pick.
    const r = parse('זווית A=α', figure(['ריבוע ABCD', 'אלכסון AC']));
    expect(r).toMatchObject({ ok: false, reason: 'ambiguous-angle', vertex: 'A' });
  });

  it('both value kinds answer the ambiguous vertex the SAME way — one reader, one behaviour', () => {
    const setup = ['ריבוע ABCD', 'אלכסון AC'];
    const sym = parse('זווית A=α', figure(setup));
    const numeric = parse('זווית A=40', figure(setup));
    expect(sym).toEqual(numeric);
  });

  it('a symbol is never mistaken for a second label — the value is removed before the count', () => {
    // The trap the shared reader had to avoid: a Latin-letter symbol («זווית A=x») sitting in the
    // text while labels are counted would read as two labels and silently bail to not-handled.
    expect(kinds(['משולש ABC'], 'זווית A=x')).toEqual(['measure-angle']);
  });
});

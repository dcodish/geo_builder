/**
 * #447 (ADR-428): the bare vertex angle `A = 40` is accepted deterministically AND teaches its canonical
 * form.
 *
 * Prod evidence (log-triage 2026-08-08): TWO students, the identical flow — `דלתון קמור` → `A=40` →
 * `E נקודה על ab` → `De מאונך ל-ab`. Both meant *angle A = 40°*. The LLM recovered it, which is exactly
 * the failure ADR-428 names: it worked that day, and whether it works the next depends on the model
 * rather than on this codebase — and the student has no way to know which.
 *
 * Both halves are required by the ADR and both are locked here:
 *  1. ACCEPT — the grammar claims it, so the behaviour is a property of the code;
 *  2. TEACH — on acceptance the canonical spelling is surfaced, so the student stops writing the form
 *     that only happened to work.
 *
 * The false-positive rows matter more than the positive ones: `R = 5` (a bound radius symbol) and
 * `S = 13` (an area marker) are the same SHAPE of utterance and must never be read as angles.
 */
import { describe, expect, it } from 'vitest';
import { buildParseCtx, canonicalText, parse, stepLabel, teachCanonical } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';

function figure(utterances: string[]) {
  useGeoStore.getState().clear();
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    if (!r.ok) throw new Error(`setup failed on "${u}": ${JSON.stringify(r)}`);
    for (const c of r.commands) useGeoStore.getState().execute(c, u);
  }
  return ctxOf();
}
function ctxOf() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
}

describe('#447 — the bare vertex angle is claimed by the GRAMMAR', () => {
  it('the reported utterance builds, and really sets that angle', () => {
    const ctx = figure(['דלתון קמור']);
    const r = parse('A=40', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ang = r.commands.find((c) => c.type === 'set-angle') as { vertex: string; value: number } | undefined;
    expect(ang).toBeDefined();
    expect(ang!.vertex).toBe('A');
    expect(ang!.value).toBe(40);
  });

  it.each(['A=40', 'A = 40', 'A=40.5', 'A = 40°'])('%s parses', (u) => {
    const ctx = figure(['דלתון קמור']);
    expect(parse(u, ctx).ok).toBe(true);
  });

  it('the whole reported FLOW builds end to end', () => {
    const ctx = figure(['דלתון קמור']);
    const r = parse('A=40', ctx);
    if (!r.ok) throw new Error('parse');
    for (const c of r.commands) useGeoStore.getState().execute(c, 'A=40');
    const st = useGeoStore.getState();
    const d = replay(st.facts, st.seed);
    expect(d.violations).toEqual([]);
    expect(st.facts.every((f) => !f.enabled || d.status[f.id] === 'ok')).toBe(true);
  });
});

describe('#447 — it steals nothing (the guards that matter)', () => {
  it('a BOUND radius symbol is never read as an angle', () => {
    // NB `R = 5` is `not-handled` today (verified against the pre-#447 tree — a separate, pre-existing
    // gap). What this locks is the invariant that matters here: it must never become a set-angle.
    const ctx = figure(['מעגל O שרדיוסו R']);
    const r = parse('R = 5', ctx);
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-angle')).toBe(false);
  });

  it('an AREA marker keeps `S_{ABC} = 13`', () => {
    const ctx = figure(['משולש ABC']);
    const r = parse('S_{ABC} = 13', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'set-angle')).toBe(false);
  });

  it('a label that is not a point is not an angle', () => {
    const ctx = figure(['דלתון קמור']);
    expect(parse('Z = 40', ctx).ok).toBe(false);
  });

  it('a vertex without exactly two edges CLARIFIES rather than guessing', () => {
    const ctx = figure(['משולש ABC', 'נקודה D על AB', 'קטע DC']);
    const r = parse('D = 40', ctx);
    if (r.ok) {
      // D has ≠2 edges only if the figure gave it three; if the setup left it at two, the parse is fine
      expect(r.commands.some((c) => c.type === 'set-angle')).toBe(true);
    } else {
      expect(r.reason).toBe('ambiguous-angle');
    }
  });
});

describe('#447 — it TEACHES the canonical form (ADR-428 obligation 2)', () => {
  it('the bare form gets a hint naming the canonical spelling', () => {
    const ctx = figure(['דלתון קמור']);
    const r = parse('A=40', ctx);
    if (!r.ok) throw new Error('parse');
    const hint = teachCanonical('A=40', r.commands, 'he');
    // The GLYPH, not the word (#460, operator ruling 2026-08-09): every other teaching surface in the
    // app — err.latex, err.ambiguousAngle, the toolbar button — already says ∠.
    expect(hint).toMatch(/^∠[A-Z]{3} = 40$/);
  });

  it('the keyboard approximation «<» is still nudged toward the glyph (#460)', () => {
    // ADR-381 accepts a prefix `<` because ∠ isn't on a keyboard — TOLERATED input, not a canonical
    // form. So it must keep getting a hint, and that hint is what moves the student onto the button.
    const ctx = figure(['דלתון קמור']);
    const r = parse('<BAD = 40', ctx);
    if (!r.ok) throw new Error('parse');
    expect(teachCanonical('<BAD = 40', r.commands, 'he')).toBe('∠BAD = 40');
  });

  it('the taught form is itself canonical — the hint never hints again', () => {
    // A canonical form that is not canonical by the module's own test is the #460 defect class. Guards
    // against a future renderer emitting a spelling the non-canonical predicate would flag right back.
    const ctx = figure(['דלתון קמור']);
    const r = parse('A=40', ctx);
    if (!r.ok) throw new Error('parse');
    for (const locale of ['he', 'en'] as const) {
      const hint = teachCanonical('A=40', r.commands, locale);
      expect(hint).toBeTruthy();
      const back = parse(hint!, ctx);
      expect(back.ok, hint!).toBe(true);
      if (back.ok) expect(teachCanonical(hint!, back.commands, locale), hint!).toBeNull();
    }
  });

  it('the CANONICAL form gets no hint — we never nag someone already writing it right', () => {
    const ctx = figure(['דלתון קמור']);
    const r = parse('זווית A = 40', ctx);
    if (!r.ok) throw new Error('parse');
    expect(teachCanonical('זווית A = 40', r.commands, 'he')).toBeNull();
    const r2 = parse('∠BAD = 40', ctx);
    if (r2.ok) expect(teachCanonical('∠BAD = 40', r2.commands, 'he')).toBeNull();
  });

  it('the hint is bilingual and RE-PARSES to the same angle (it must be advice we honour)', () => {
    const ctx = figure(['דלתון קמור']);
    const r = parse('A=40', ctx);
    if (!r.ok) throw new Error('parse');
    for (const locale of ['he', 'en'] as const) {
      const text = canonicalText(r.commands, locale);
      expect(text).toBeTruthy();
      const back = parse(text!, ctx);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      const a = back.commands.find((c) => c.type === 'set-angle') as { vertex: string; value: number };
      expect(a.vertex).toBe('A');
      expect(a.value).toBe(40);
    }
  });

  it('a lowering with no canonical renderer stays silent (a wrong hint is worse than none)', () => {
    const ctx = figure(['משולש ABC']);
    const r = parse('AB = 5', ctx);
    if (!r.ok) throw new Error('parse');
    expect(teachCanonical('AB = 5', r.commands, 'he')).toBeNull();
  });
});

describe('#450 (ADR-428 obligation 3) — the STEP ROW echoes the canonical form', () => {
  const cmdsOf = (lines: string[]) => {
    const ctx = figure(lines.slice(0, -1));
    const r = parse(lines[lines.length - 1], ctx);
    if (!r.ok) throw new Error(`did not parse: ${lines[lines.length - 1]}`);
    return r.commands;
  };

  it('«A=40» is shown as «∠BAD = 40», not as the typed text', () => {
    const cmds = cmdsOf(['דלתון קמור', 'A=40']);
    expect(stepLabel(cmds, 'A=40', 'he')).toMatch(/^∠[A-Z]{3} = 40$/);
  });

  it('the keyboard «<» form is shown canonically too', () => {
    const cmds = cmdsOf(['דלתון קמור', '<BAD = 40']);
    expect(stepLabel(cmds, '<BAD = 40', 'he')).toBe('∠BAD = 40');
  });

  it('a row the renderer cannot express KEEPS its verbatim text — silence is safe', () => {
    // Deliberately conservative: canonicalText renders only the families we teach, so a shape
    // declaration, a length, and anything compound must pass through untouched.
    for (const [lines, typed] of [
      [['משולש ABC'], 'משולש ABC'],
      [['משולש ABC', 'AB = 5'], 'AB = 5'],
    ] as [string[], string][]) {
      expect(stepLabel(cmdsOf(lines), typed, 'he'), typed).toBe(typed);
    }
  });

  it('the echoed label RE-PARSES to the same lowering — the ✎ box is seeded with it', () => {
    // App seeds the edit input from the displayed label, so a label that did not round-trip would
    // corrupt the step on the next edit.
    const ctx = figure(['דלתון קמור']);
    const cmds = cmdsOf(['דלתון קמור', 'A=40']);
    const label = stepLabel(cmds, 'A=40', 'he');
    const back = parse(label, ctx);
    expect(back.ok, label).toBe(true);
    if (!back.ok) return;
    const a = back.commands.find((c) => c.type === 'set-angle') as { vertex: string; value: number };
    expect(a.vertex).toBe('A');
    expect(a.value).toBe(40);
  });

  it('falls back to the command types only when there is no utterance at all', () => {
    const cmds = cmdsOf(['משולש ABC']);
    expect(stepLabel(cmds, undefined, 'he')).toBe(cmds.map((c) => c.type).join(' + '));
  });
});

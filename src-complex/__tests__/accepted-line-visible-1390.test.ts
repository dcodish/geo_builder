/**
 * #1390 (P1) + #1389 — a line the gate ACCEPTS must leave its subject visible somewhere.
 *
 * «u^5 = 32» was accepted, drew nothing and printed nothing, under «הצורה נקבעת במלואה». The operator
 * ruled (2026-09-24) that the reading is right (ADR-CX-004: `u` is a real parameter; ADR-CX-041: the
 * equation solves it, u = 2) and the defect is only the SILENCE. The fix is the data panel's
 * «פרמטרים» section, fed by `Derived2.params`.
 *
 * ## The class lock
 *
 * The honesty invariant is "everything the student stated is visible". For a GIVEN (a line whose
 * artifacts are constraints, a roots equation or a declaration, with no claim, measure or object row
 * of its own) that means at least one of the numbers or parameters it names appears on a surface: a
 * drawn point, or a parameter row. A line that fails that is exactly this issue's shape, and this net
 * runs it over every catalog specimen and every fixture, so the next silent drop fails the suite
 * instead of waiting for a play.
 *
 * The lock also proves it can fire: the pre-fix state (no parameter rows) is replayed through the same
 * predicate and must flag «u^5 = 32». A predicate that never fires would pass by checking nothing.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { acceptLine, hydrateSession, readAsk } from '../app/submit';
import { parseLineV2 } from '../parser/rules';
import { CATALOG } from '../parser/catalog';
import { isComplexName } from '../parser/exprParse';
import { type Expr, paramsOf, refsOf } from '../model/expr';
import type { Derived2 } from '../replay/derive2';
import { type SavedSession, useComplexStore } from '../store/useComplexStore';

/** The numbers and parameters a GIVEN line names — null when the line is not a pure given. */
function subjectsOf(line: string): { names: Set<string>; params: Set<string>; rootVars: Set<string> } | null {
  const r = parseLineV2(line.trim());
  if (!r.ok) return null;
  const l = r.line;
  // a claim, a measure, an object or a sequence has its own row; a question lives in the ask lane
  if (l.assertions.length || l.measures.length || l.objects.length || l.sequences.length) return null;
  if (l.queries.length || l.ratios.length || l.exprQueries.length || l.selections.length) return null;
  const names = new Set<string>(l.declares);
  const params = new Set<string>();
  const rootVars = new Set<string>();
  const take = (e: Expr) => {
    for (const n of refsOf(e)) names.add(n);
    for (const p of paramsOf(e)) params.add(p);
  };
  for (const c of l.constraints) {
    take(c.lhs);
    take(c.rhs);
  }
  for (const eq of l.roots) {
    take(eq.rhs);
    if (isComplexName(eq.varName)) rootVars.add(eq.varName);
    else params.add(eq.varName);
  }
  for (const f of l.filters) if ('name' in f && typeof f.name === 'string') names.add(f.name);
  return names.size + params.size + rootVars.size > 0 ? { names, params, rootVars } : null;
}

/** Does the figure show at least one of the line's subjects? */
function visible(d: Derived2, s: NonNullable<ReturnType<typeof subjectsOf>>, withParams = true): boolean {
  const drawn = d.points.map((p) => p.name);
  if ([...s.names].some((n) => drawn.includes(n))) return true;
  if ([...s.rootVars].some((v) => drawn.some((p) => new RegExp(`^${v}\\d*$`).test(p)))) return true;
  const params = withParams ? d.params.map((p) => p.name) : [];
  return [...s.params].some((p) => params.includes(p));
}

/** Replay `lines` one by one through the real gate; return every ACCEPTED given that left nothing visible. */
function silentLines(lines: readonly string[], withParams = true): { silent: string[]; checked: number } {
  const kept: string[] = [];
  const silent: string[] = [];
  let seed = 0;
  let checked = 0;
  for (const raw of lines) {
    if (['measure', 'ratio', 'expr'].includes(readAsk(raw).kind)) continue;
    const v = acceptLine(kept, raw, seed);
    if (!v.ok) continue;
    kept.push(raw);
    seed = v.seed;
    const s = subjectsOf(raw);
    if (!s) continue;
    checked++;
    const d = deriveLines(kept, seed, seed);
    if (!d.hasConfiguration) continue; // a refuted figure is reported by the gate, not here
    if (!visible(d, s, withParams)) silent.push(raw);
  }
  return { silent, checked };
}

const fixtures = import.meta.glob('./fixtures/*.complex.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

describe('#1390 — the reported line is visible now', () => {
  it('«u^5 = 32» is accepted and the panel shows u = 2 (exact)', () => {
    expect(acceptLine([], 'u^5 = 32', 0).ok).toBe(true);
    const d = deriveLines(['u^5 = 32']);
    expect(d.params).toEqual([{ name: 'u', value: '2' }]);
  });

  /**
   * Amended by ADR-CX-045 (#1406, operator ruling 2026-09-24: *"u^5=-32 gives u=-2"*). A parameter in an
   * odd power is sign-free, so «u^5 = -32» is ACCEPTED with u = −2; the even power «u^4 = -16» has no
   * real solution and stays refused, as does a second value for a solved u.
   */
  it('«u^5 = -32» is accepted (u = −2); «u^4 = -16» and «u^5 = 32 · u = 3» stay refused', () => {
    expect(acceptLine([], 'u^5 = -32', 0).ok).toBe(true);
    expect(acceptLine([], 'u^4 = -16', 0).ok).toBe(false);
    expect(acceptLine(['u^5 = 32'], 'u = 3', 0).ok).toBe(false);
  });

  it('«u^5 = 32 · z1 = u» draws z₁ at 2, and reads 2 — never «u·cis0°»', () => {
    const d = deriveLines(['u^5 = 32', 'z1 = u']);
    const z1 = d.points.find((p) => p.name === 'z1')!;
    expect(z1.z.re).toBeCloseTo(2, 9);
    expect(z1.z.im).toBeCloseTo(0, 9);
    expect(z1.reading).not.toMatch(/u/);
    expect(z1.readingCart).toBe('z₁ = 2');
  });

  it('«u^5 = w^2» with a non-real w is refused, naming a statement the student wrote', () => {
    const pre = ['z1 = 3+4i', 'z2 = 2cis150', 'w = z1*z2'];
    const v = acceptLine(pre, 'u^5 = w^2', 0);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(pre).toContain(v.error.detail);
  });
});

describe('#1390 class lock — no accepted given is silent', () => {
  beforeEach(() => useComplexStore.getState().resetSession());

  it('the predicate FIRES on the pre-fix state (no parameter rows) — it is not vacuous', () => {
    expect(silentLines(['u^5 = 32'], false).silent).toEqual(['u^5 = 32']);
    expect(silentLines(['u^5 = 32'], true).silent).toEqual([]);
  });

  it('every catalog specimen, alone on a fresh canvas, leaves its subject visible', () => {
    let checked = 0;
    const silent: string[] = [];
    for (const e of CATALOG) {
      for (const line of [e.he, e.en]) {
        const r = silentLines([line]);
        checked += r.checked;
        silent.push(...r.silent);
      }
    }
    expect(silent).toEqual([]);
    expect(checked).toBeGreaterThan(20); // the net actually exercised givens
  });

  for (const [file, text] of Object.entries(fixtures)) {
    it(`fixture ${file.replace('./fixtures/', '')}: every accepted given stays visible`, () => {
      const saved = JSON.parse(text) as SavedSession;
      expect(hydrateSession(saved)).toBe(true);
      expect(silentLines(saved.lines).silent).toEqual([]);
    });
  }
});

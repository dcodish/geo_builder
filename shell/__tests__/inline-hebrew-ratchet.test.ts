/**
 * #2201 phase 2 ([ADR-W-153](../../docs/06w-decisions-workspace.md#adr-w-153)) — THE INLINE-HEBREW RATCHET.
 *
 * A Hebrew sentence written in a `.ts`/`.tsx` file instead of a locale table is text no locale lock, no message
 * search and no refusal-style lock (#1995 stage 5) can see. This test counts, per file, the string literals that
 * carry Hebrew (U+0590–U+05FF) — StringLiteral, NoSubstitutionTemplateLiteral, TemplateExpression and JsxText, read
 * with the TypeScript compiler API, so a comment is never counted — in every tree BOUNDARIES.json declares, outside
 * `__tests__/`, `parser/`, `lexicon/` and `i18n/` (where Hebrew is the grammar or the table itself).
 *
 * The baseline (`fixtures/inline-hebrew-baseline.json`, `{ path: count }`) only tightens:
 *   - a file whose count RISES, or a new file with Hebrew, fails;
 *   - a file whose count DROPS (or that no longer has any) prints a reminder to lower the baseline;
 *   - `UPDATE_BASELINE=1` regenerates it from what is measured (a reviewed diff).
 * No literal is moved by this phase: the ratchet stops growth only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  declaredTrees,
  hebrewLiteralCount,
  lowerTheBaseline,
  parseSource,
  REPO_ROOT,
  sourceFiles,
  UPDATE_BASELINE,
} from './fixtures/ts-literals';

const BASELINE_PATH = 'shell/__tests__/fixtures/inline-hebrew-baseline.json';
/** Directories where Hebrew in code is the grammar or the table itself, not a sentence that escaped one. */
const SKIP = new Set(['__tests__', 'parser', 'lexicon', 'i18n']);

function measure(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of sourceFiles(declaredTrees(), SKIP)) {
    const c = hebrewLiteralCount(parseSource(f));
    if (c > 0) out[f] = c;
  }
  return out;
}

describe('#2201 phase 2 — inline Hebrew in code only shrinks', () => {
  const measured = measure();
  const abs = join(REPO_ROOT, BASELINE_PATH);
  if (UPDATE_BASELINE) writeFileSync(abs, JSON.stringify(measured, null, 1) + '\n');
  const baseline: Record<string, number> = existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : {};

  it('no file gains a Hebrew literal, and no new file carries one', () => {
    const grew = Object.entries(measured)
      .filter(([f, n]) => n > (baseline[f] ?? 0))
      .map(([f, n]) => `${f}: ${baseline[f] ?? 0} → ${n} — move the sentence into the product's locale table (or shell/locales for suite text)`);
    expect(grew).toEqual([]);
  });

  it('a file that shed a literal is reported, so the baseline is lowered', () => {
    const shrank = Object.entries(baseline)
      .filter(([f, n]) => (measured[f] ?? 0) < n)
      .map(([f, n]) => lowerTheBaseline(BASELINE_PATH, `${f} ${n} → ${measured[f] ?? 0}`));
    // A reminder, not a failure: the code got better. The baseline catches up on the next UPDATE_BASELINE run.
    for (const s of shrank) console.warn(s);
    expect(Array.isArray(shrank)).toBe(true);
  });

  it('is non-vacuous: the walker sees the inline text that exists', () => {
    const total = Object.values(measured).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(300);
    expect(Object.keys(measured).some((f) => f.startsWith('src/'))).toBe(true);
    expect(Object.keys(measured).some((f) => f.startsWith('src3d/'))).toBe(true);
  });
});

describe('#2201 phase 2 — the walker counts what it claims (the lock can fail)', () => {
  const count = (src: string, path = 'x.tsx') => hebrewLiteralCount(parseSource(path, src));

  it('counts every literal kind, and never a comment, an import or Latin text', () => {
    expect(count(`const a = 'שלום';`)).toBe(1);
    expect(count('const a = `שלום`;')).toBe(1);
    expect(count('const a = `שלום ${x} עולם`;')).toBe(1); // one template, not three pieces
    expect(count('const a = <b>שלום</b>;')).toBe(1);
    expect(count(`const a = <b title="שלום" />;`)).toBe(1);
    expect(count(`// שלום\n/* עולם */ const a = 'hello';`)).toBe(0);
    expect(count(`import x from './שלום';`)).toBe(0);
  });

  it('a new Hebrew literal in a measured file would fail the growth check', () => {
    const base = { 'src/x.ts': 1 };
    const now = { 'src/x.ts': count(`const a = 'אחת'; const b = 'שתיים';`, 'x.ts') };
    expect(Object.entries(now).filter(([f, n]) => n > (base[f as keyof typeof base] ?? 0))).toHaveLength(1);
  });
});

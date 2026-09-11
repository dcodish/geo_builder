/**
 * #361 ([ADR-501](../../../docs/06-decisions.md#adr-501)): EVERY exported lexicon atom is LOAD-BEARING.
 *
 * The lexicon is a registered chokepoint (docs/17 §3) whose rule says new grammar rules compose from its
 * atoms. The ratchet (`lexical-ratchet.test.ts`) guards the other direction — inline fragments may only
 * shrink — but nothing guarded THIS one: an atom could be exported, documented as "the lesson of ADR-x",
 * and consumed by nothing. Measured 2026-09-01: four such atoms (`PARALLEL_KW`, `MEET_KW`, `BISECT_KW`,
 * `LABEL_RUN`) — vocabulary registered in the honesty layer that no grammar rule parsed. This test makes
 * the class impossible to recur silently: an atom is LIVE when a non-test source file outside the lexicon
 * references it, or when another LIVE atom is composed from it (`HE_SUFFIX` → `heWord` → `ANGLE_KW`…).
 *
 * Read as text on purpose — importing the module would only prove the atoms exist, never that anything
 * reaches them (the ADR-500 lesson: evidence that a string exists is not evidence that anything uses it).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '..', '..');
const LEXICON = join(SRC, 'parser', 'lexicon.ts');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== '__tests__' && e !== 'node_modules') sourceFiles(p, out); continue; }
    if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e) && p !== LEXICON) out.push(p);
  }
  return out;
}

/** `export const NAME` names, with each declaration's own source (to detect composition between atoms). */
function atomsOf(text: string): Map<string, string> {
  const atoms = new Map<string, string>();
  const re = /^export const ([A-Za-z_][A-Za-z0-9_]*)\b[^\n]*(?:\n(?![\s]*$)(?!export )[^\n]*)*/gm;
  // comments stripped from the captured block: a mention in prose must not count as composition
  for (const m of text.matchAll(re)) atoms.set(m[1], m[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''));
  return atoms;
}

/** The live set: externally consumed atoms, closed under "composed into a live atom". */
function liveAtoms(atoms: Map<string, string>, external: string): Set<string> {
  const live = new Set<string>();
  for (const name of atoms.keys()) if (new RegExp(`\\b${name}\\b`).test(external)) live.add(name);
  let grew = true;
  while (grew) {
    grew = false;
    for (const name of atoms.keys()) {
      if (live.has(name)) continue;
      for (const l of live) {
        if (new RegExp(`\\b${name}\\b`).test(atoms.get(l)!.replace(new RegExp(`^export const ${l}\\b`), ''))) { live.add(name); grew = true; break; }
      }
    }
  }
  return live;
}

describe('#361 — every exported lexicon atom is consumed', () => {
  const text = readFileSync(LEXICON, 'utf8');
  const atoms = atomsOf(text);
  const external = sourceFiles(SRC).map((f) => readFileSync(f, 'utf8')).join('\n');

  it('the scan is not vacuous — it sees the atoms and the parser', () => {
    expect(atoms.size).toBeGreaterThanOrEqual(12);
    expect(atoms.has('LABEL')).toBe(true);
    expect(external.length).toBeGreaterThan(100_000);
    expect(external).toContain("from './lexicon'");
  });

  it('no exported atom is dead (measured 2026-09-01: PARALLEL_KW, MEET_KW, BISECT_KW, LABEL_RUN were)', () => {
    const live = liveAtoms(atoms, external);
    const dead = [...atoms.keys()].filter((a) => !live.has(a));
    expect(dead, 'an atom nothing composes from is vocabulary the grammar cannot parse — adopt it or delete it').toEqual([]);
  });

  it('the detector detects — a decorative atom would be reported', () => {
    const withFake = new Map(atoms);
    withFake.set('DECORATIVE_KW', 'export const DECORATIVE_KW = String.raw`x`;');
    const live = liveAtoms(withFake, external);
    expect(live.has('DECORATIVE_KW')).toBe(false);
    expect(live.has('LABEL')).toBe(true);
    // composition counts: an atom used only INSIDE a live atom's declaration is live
    const composed = new Map(withFake);
    composed.set('LABEL', atoms.get('LABEL')! + ' ${DECORATIVE_KW}');
    expect(liveAtoms(composed, external).has('DECORATIVE_KW')).toBe(true);
  });

  it('the four atoms this issue measured are now live or gone', () => {
    const live = liveAtoms(atoms, external);
    for (const a of ['PARALLEL_KW', 'MEET_KW', 'BISECT_KW']) expect(live.has(a), a).toBe(true);
    expect(atoms.has('LABEL_RUN'), 'LABEL_RUN: deleted — no site in the tree ever spelled its shape').toBe(false);
  });
});

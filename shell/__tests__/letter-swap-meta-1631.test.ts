/**
 * The META-lock for the letter-swap checks (#1631, docs/28 §5c rule 5).
 *
 * Every builder's thin lock calls `letterSwapFaults`, so a check that silently stops checking turns them
 * all into tests that prove nothing. This runs the SAME function against deliberately broken builders
 * and asserts each fault is caught — including the two the rulings rest on: a refusal with no holder
 * (the dead end of #238) and a "swap" that deletes a statement (the destructive offer #1013 retired).
 */
import { describe, expect, it } from 'vitest';
import type { LetterRenameResult } from '../frame/letterOffer';
import { letterSwapFaults, type LetterSwapSubject } from './fixtures/letter-swap-rows';

type Bug = 'no-holder' | 'one-way-holder' | 'accepts-taken' | 'swap-deletes' | 'swap-no-op' | 'swap-two-steps' | 'refusal-mutates';

/** A miniature builder: statements are strings of capital letters; the figure's points are their letters. */
function stub(bug?: Bug): LetterSwapSubject {
  let facts: string[] = [];
  const past: string[][] = [];
  const commit = (next: string[]) => {
    past.push(facts);
    facts = next;
  };
  const letters = () => [...new Set(facts.join('').match(/[A-Z]/g) ?? [])];
  const exchange = (s: string, a: string, b: string) => s.replace(new RegExp(`[${a}${b}]`, 'g'), (c) => (c === a ? b : a));
  return {
    a: 'A',
    b: 'D',
    setup: () => {
      facts = ['ABC', 'D'];
      past.length = 0;
    },
    rename: (from, to): LetterRenameResult => {
      if (!letters().includes(to)) return { ok: true };
      if (bug === 'accepts-taken') {
        commit(facts.map((f) => f.split(from).join(to)));
        return { ok: true };
      }
      if (bug === 'refusal-mutates') facts = [...facts, ''];
      const holder = facts.find((f) => f.includes(to));
      const named = bug === 'no-holder' || (bug === 'one-way-holder' && from === 'D') ? null : holder ? { text: holder } : null;
      return { ok: false, reason: 'taken', holder: named };
    },
    swap: (a, b) => {
      if (bug === 'swap-no-op') return { ok: true };
      const next = facts.map((f) => exchange(f, a, b));
      if (bug === 'swap-deletes') commit(next.filter((f) => f !== b && f !== a));
      else if (bug === 'swap-two-steps') {
        commit(next.map((f) => f)); // an extra history entry: one undo no longer restores
        commit(next);
      } else commit(next);
      return { ok: true };
    },
    undo: () => {
      const prev = past.pop();
      if (prev) facts = prev;
    },
    statements: () => [...facts],
    points: () => letters(),
  };
}

describe('#1631 — the shared letter-swap checks really check', () => {
  it('a conforming builder reports no faults', () => {
    expect(letterSwapFaults(stub())).toEqual([]);
  });

  it.each([
    ['no-holder', /named no holder/],
    ['one-way-holder', /rename D→A named no holder/],
    ['accepts-taken', /onto a TAKEN letter was accepted/],
    ['refusal-mutates', /refused rename .* changed the statements/],
    ['swap-deletes', /changed the NUMBER of statements/],
    ['swap-no-op', /changed no statement/],
    ['swap-two-steps', /one undo after swap A↔D did not restore/],
  ] as const)('CATCHES a builder whose bug is %s', (bug, fault) => {
    expect(letterSwapFaults(stub(bug)).join(' | ')).toMatch(fault);
  });
});

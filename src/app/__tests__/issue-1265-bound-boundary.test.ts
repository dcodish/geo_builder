/**
 * #1265 — A STATED BOUND ADMITS THE VALUES ITS OWN INEQUALITY ADMITS.
 *
 * Operator, playing round #1252's T3: *"אורך הקטע BC לפחות 10 - this means at least 10 but when i try to
 * say BC=10 it rejects it"*. Measured: «BC ≥ 10» then «BC = 10» came back
 * `over-constrained: |BC| = 10 cannot hold` — about the value the student's own sentence admits — and so
 * did `BC = 10.1` under `BC > 10`, because the refusal band was 2 % of the stated number.
 *
 * ONE cause with two halves, and the locks below are split the same way:
 *
 *  1. **The strictness was thrown away.** `measureBound` reads `<` vs `<=` and then dropped the answer,
 *     so `≥` was executed as `>` — and the refusal even quoted «|BC| > 10» back at a student who wrote ≥.
 *  2. **The drawing AIM was being used as the acceptance TEST.** ADR-390 aims a free bounded measure a
 *     visible gap inside its region so the figure does not read as an equality — right, and not a
 *     statement about what may HOLD. Acceptance now asks the stated inequality; the aim moved into the
 *     optimizer's cost, where a preference belongs.
 *
 * The rows are computed from the relation, never written out one by one: a lock that re-states "10 ≥ 10"
 * as a literal expectation would stay green through a change that re-broke the rule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

function makeDeps() {
  const calls = { notes: [] as string[], cleared: 0 };
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: { setInputNote: (m) => calls.notes.push(m), setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => calls.cleared++, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  return { deps, calls, notes: () => calls.notes.filter(Boolean) };
}

const figure = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const B = d.positions.get('B')!;
  const C = d.positions.get('C')!;
  return {
    bc: Math.hypot(B.x - C.x, B.y - C.y),
    clean: Object.values(d.status).every((v) => v === 'ok'),
    statuses: Object.values(d.status).join(' · '),
  };
};

/** Build «משולש ABC», then the two given lines, and report what the figure ended up saying. */
const play = async (bound: string, second: string) => {
  useGeoStore.getState().clear();
  await runSubmit('משולש ABC', makeDeps().deps);
  const d1 = makeDeps();
  await runSubmit(bound, d1.deps);
  const d2 = makeDeps();
  await runSubmit(second, d2.deps);
  return { ...figure(), refusedUpFront: d2.calls.cleared === 0, notes: [...d1.notes(), ...d2.notes()] };
};

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

/** The rule itself, in one place: does `value` satisfy the bound the sentence states? */
const admits = (rel: string, bound: number, value: number): boolean =>
  rel === '≥' ? value >= bound : rel === '>' ? value > bound : rel === '≤' ? value <= bound : value < bound;

describe('#1265 — the class: a bound accepts exactly what it admits', () => {
  const RELS = ['≥', '>', '≤', '<'] as const;
  const VALUES = [9, 9.9, 10, 10.1, 11];

  for (const rel of RELS) {
    for (const value of VALUES) {
      const ok = admits(rel, 10, value);
      it(`«BC ${rel} 10» then «BC = ${value}» ${ok ? 'HOLDS' : 'cannot hold'}`, async () => {
        const f = await play(`BC ${rel} 10`, `BC = ${value}`);
        // WAS the line ACCEPTED? — not "is the committed figure clean". Since #1335 (ADR-540) a bound
        // and a value of the same measure that exclude each other are a PROVEN contradiction, so the
        // submit gate refuses the second line at the door and it never becomes a fact, exactly as
        // ADR-417's metric contradiction and ADR-538's angle-sum one already did. #1265's rule is
        // unchanged and this asserts it more precisely: the line lands if and only if the student's
        // own inequality admits its value. (The «BC = 9» · «BC ≥ 10» row below has always read the
        // refusal this way; the two orders now agree.)
        expect(f.refusedUpFront, `${rel} 10 with ${value}: ${f.statuses} | ${f.notes.join(' | ')}`).toBe(!ok);
        expect(f.clean, `${rel} 10 with ${value}: ${f.statuses}`).toBe(true);
        if (ok) expect(f.bc).toBeCloseTo(value, 3); // and the figure actually IS that value
      });
    }
  }
});

describe('#1265 — the operator’s own case, both orders', () => {
  it('«BC ≥ 10» then «BC = 10» builds, and BC really is 10', async () => {
    const f = await play('BC ≥ 10', 'BC = 10');
    expect(f.clean).toBe(true);
    expect(f.bc).toBeCloseTo(10, 4); // a SOLVED length, to the solver’s own precision
  });

  it('«BC = 10» then «BC ≥ 10» is not refused at the input either', async () => {
    const f = await play('BC = 10', 'BC ≥ 10');
    expect(f.refusedUpFront, `the second line was refused: ${f.notes.join(' | ')}`).toBe(false);
    expect(f.clean).toBe(true);
  });
});

describe('#1265 — the DRAWING aim survives (ADR-390)', () => {
  it('a bound alone still settles visibly inside its region', async () => {
    useGeoStore.getState().clear();
    await runSubmit('משולש ABC', makeDeps().deps);
    await runSubmit('BC ≥ 10', makeDeps().deps);
    const f = figure();
    expect(f.clean).toBe(true);
    // not merely ≥ 10 — visibly past it, or the drawing reads as «BC = 10» (the whole point of the margin)
    expect(f.bc).toBeGreaterThan(10.1);
  });

  it('and the measure stays FREE — no value is claimed for it', async () => {
    useGeoStore.getState().clear();
    await runSubmit('משולש ABC', makeDeps().deps);
    await runSubmit('BC ≥ 10', makeDeps().deps);
    const st = useGeoStore.getState();
    expect(st.facts.some((f) => f.cmd.type === 'set-distance')).toBe(false);
  });
});

describe('#1265 — the strictness is read, carried, and quoted', () => {
  it('the parser keeps the relation the student wrote', () => {
    const flag = (line: string) => {
      const r = parse(line, {});
      if (!r.ok) throw new Error(`${line} did not parse`);
      const b = r.commands.find((c) => c.type === 'set-length-bound') as { minStrict?: boolean; maxStrict?: boolean };
      return b;
    };
    expect(flag('BC > 10').minStrict).toBe(true);
    expect(flag('BC ≥ 10').minStrict).toBe(false);
    expect(flag('BC < 10').maxStrict).toBe(true);
    expect(flag('BC ≤ 10').maxStrict).toBe(false);
    // The WORD forms («גדול מ», "greater than") are strict by ABSENCE — the convention every saved
    // figure already relies on — so the flag is left unset rather than written as `true`.
    expect(flag('BC גדול מ-10').minStrict).not.toBe(false);
    expect(flag('BC קטן מ-10').maxStrict).not.toBe(false);
  });

  it('and “strict by absence” means what it says: «גדול מ-10» still excludes 10', async () => {
    const f = await play('BC גדול מ-10', 'BC = 10');
    expect(f.refusedUpFront, f.notes.join(' | ')).toBe(true); // refused at the door since ADR-540
    expect(f.notes.join(' ')).toContain('|BC| = 10');
  });

  it('each END of a two-sided range keeps its own operator', () => {
    const r = parse('10 ≤ BC < 20', {});
    expect(r.ok).toBe(true);
    const b = (r as { commands: Array<{ type: string; minStrict?: boolean; maxStrict?: boolean }> }).commands.find((c) => c.type === 'set-length-bound')!;
    expect(b.minStrict).toBe(false);
    expect(b.maxStrict).toBe(true);
  });

  it('a refusal quotes ≥ when the student wrote ≥ — never a relation they did not use', async () => {
    // the BOUND has to be the one that fails for its own text to appear, so state it second: the
    // submit gate refuses it up front and the note is where the student reads the relation back.
    const f = await play('BC = 9', 'BC ≥ 10');
    expect(f.refusedUpFront, `expected the bound to be refused; notes: ${f.notes.join(' | ')}`).toBe(true);
    expect([...f.notes, f.statuses].join(' ')).toContain('≥');
    expect([...f.notes, f.statuses].join(' ')).not.toMatch(/\|BC\| > 10/);
  });
});

describe('#1265 — angles, the same rule', () => {
  /** «משולש ABC», the bound, then the value — and whether the VALUE was accepted. */
  const playAngle = async (bound: string, value: string) => {
    useGeoStore.getState().clear();
    await runSubmit('משולש ABC', makeDeps().deps);
    await runSubmit(bound, makeDeps().deps);
    const last = makeDeps();
    await runSubmit(value, last.deps);
    return { ...figure(), accepted: last.calls.cleared > 0, notes: last.calls.notes.filter(Boolean) };
  };

  it('«∠ABC ≥ 40» admits 40; «∠ABC > 40» does not', async () => {
    const admitted = await playAngle('∠ABC ≥ 40', '∠ABC = 40');
    expect(admitted.accepted).toBe(true);
    expect(admitted.clean).toBe(true);

    // Excluded ⇒ refused at the door since #1335 (ADR-540), where it used to commit and go red.
    const excluded = await playAngle('∠ABC > 40', '∠ABC = 40');
    expect(excluded.accepted, excluded.notes.join(' | ')).toBe(false);
  });

  it('«זווית קהה» stays STRICT — an obtuse angle is not 90°', async () => {
    const f = await playAngle('זווית ABC קהה', '∠ABC = 90');
    expect(f.accepted, f.notes.join(' | ')).toBe(false);
  });
});

/**
 * THE SEQUENCE GATE'S ROWS, ONCE (#1356) — the docs/28 §5c shape.
 *
 * `shell/` may never import a product tree, so a guard that wants to check *"every builder restores a
 * respelled point run"* cannot call all four itself. The pattern instead: the rows and the checks live
 * here as a pure `faults(subject) → string[]`, each tree has a thin lock that imports ITS OWN function
 * and calls this, and a meta-lock in `shell/` runs the same checks against deliberately broken stubs
 * to prove they catch anything at all.
 *
 * Why this matters more than a per-tree test: 2-D and 3-D carried the same fix as two copies for
 * months, and nothing could have noticed one of them losing it. The defect being guarded is a
 * production P1 (2-D #536) that committed **the negation of a student's given**.
 */

/** The shape every product's gate exposes. */
export type SequenceGate = (utterance: string, lines: string[]) => { lines: string[]; restored: string[] };

export interface SequenceGateOpts {
  /**
   * A label run this product can actually spell, as `{ stated, respelled, labels }`.
   *
   * Products differ in what a label looks like (3-D has primes), so the caller supplies one case in
   * its own alphabet rather than this file guessing — an explicit option, never a silent exclusion.
   */
  run?: { stated: string; respelled: string };
}

const DEFAULT_RUN = { stated: 'ADB', respelled: 'ABD' };

/**
 * Every fault found in `gate`, as human-readable strings. Empty means the product honours the rule.
 *
 * Returning strings rather than asserting keeps this callable from a meta-lock that EXPECTS faults.
 */
export function sequenceGateFaults(gate: SequenceGate, opts: SequenceGateOpts = {}): string[] {
  const { stated, respelled } = opts.run ?? DEFAULT_RUN;
  const out: string[] = [];
  const check = (cond: boolean, msg: string) => { if (!cond) out.push(msg); };

  // 1. THE DEFECT ITSELF: the student stated one order, the model emitted another.
  {
    const r = gate(`the segment ${stated}`, [`line ${respelled}`]);
    check(r.lines[0] === `line ${stated}`, `a respelled run was not restored: got "${r.lines[0]}", want "line ${stated}"`);
    check(r.restored.length === 1, `the restoration was not logged (restored=${JSON.stringify(r.restored)})`);
    check(
      r.restored[0] === `${respelled}→${stated}`,
      `the log entry should read "${respelled}→${stated}", got "${r.restored[0]}"`,
    );
  }

  // 2. A line the model spelled CORRECTLY is untouched, and byte-identical.
  {
    const line = `line ${stated}`;
    const r = gate(`the segment ${stated}`, [line]);
    check(r.lines[0] === line, `a correctly-spelled run was altered: "${r.lines[0]}"`);
    check(r.restored.length === 0, 'a correct line was logged as restored');
  }

  // 3. THE REVERSE IS THE SAME STATEMENT, read from the other end — it must NOT be "restored".
  {
    const reversed = [...stated].reverse().join('');
    const r = gate(`the segment ${stated}`, [`line ${reversed}`]);
    check(r.lines[0] === `line ${reversed}`, `a reversed run was wrongly rewritten to "${r.lines[0]}"`);
    check(r.restored.length === 0, 'a reversal was logged as a restoration');
  }

  // 4. AMBIGUITY REFUSES TO CHOOSE: the student wrote the same labels two inequivalent ways, so no
  //    spelling is the authority and picking one would invent a given.
  {
    const r = gate(`${stated} and ${respelled}`, [`line ${respelled}`]);
    check(r.restored.length === 0, `an ambiguous key was "restored" anyway: ${JSON.stringify(r.restored)}`);
  }

  // 5. A run the student never mentioned is left alone — the gate restores, it does not invent.
  {
    const r = gate('nothing relevant here', [`line ${respelled}`]);
    check(r.lines[0] === `line ${respelled}`, `an unstated run was altered to "${r.lines[0]}"`);
    check(r.restored.length === 0, 'an unstated run was logged as restored');
  }

  // 6. An empty answer is a no-op, not a crash.
  {
    const r = gate(`the segment ${stated}`, []);
    check(r.lines.length === 0 && r.restored.length === 0, 'an empty line list did not pass through cleanly');
  }

  // 7. MULTIPLE LINES: every line is considered, not just the first.
  {
    const r = gate(`the segment ${stated}`, ['unrelated line', `line ${respelled}`]);
    check(r.lines[1] === `line ${stated}`, `a respelled run in a LATER line was missed: "${r.lines[1]}"`);
    check(r.lines[0] === 'unrelated line', 'an unrelated earlier line was altered');
  }

  return out;
}

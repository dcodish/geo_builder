/**
 * A short, non-reversible fingerprint of the figure a complex session is showing (#2241, ADR-W-150).
 *
 * The usage log records an undo or a redo with the fingerprint of the state it landed on, so the
 * `/log-triage` replay (`triageReplayCx.ts`) can find that state among the ones it has seen instead of
 * guessing which history entry was popped. Guessing would be wrong whenever a step the log does not
 * carry (a name typed, a value/letter chip, a question added in the ask box) pushed its own history
 * entry. Those steps never change the three fields hashed here, so they cannot make a match ambiguous.
 *
 * It carries no student text: 32 bits of FNV-1a over the line list, the muted rows and the seed. The
 * lines themselves were logged when they were typed.
 */
export function stateFingerprintCx(lines: readonly string[], disabled: readonly number[], seed: number): string {
  const text = JSON.stringify([lines, [...disabled].sort((a, b) => a - b), seed]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

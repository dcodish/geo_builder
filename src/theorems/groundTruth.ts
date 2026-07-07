/**
 * Parser for `docs/sample questions/theorem-ground-truth.md` — the reviewed 25-question corpus
 * (Q1–Q7 + B1–B23, B5 removed) whose per-question id lists (`expectSurfaced` / `solutionUses` /
 * `mustNotSurface`) encode measured student value (theorem-discovery v2 T1, docs/18 §4).
 *
 * This feeds the OFFLINE fill-order report only (an authoring aid — never a runtime score,
 * operator ruling D3). The list lines are prose ("22 (AB=AC stated → …); bundle 43, 46, 48, 50"),
 * so extraction is best-effort with conservative filters; the report prints per-question ids so
 * a human can eyeball any suspicious pull. The B-corpus test does NOT read this — its assertion
 * lists are authored in code, reviewed against the doc by hand.
 */

export interface GroundTruthQuestion {
  /** Q1…Q7 | B1…B23 (B5 absent — removed by the operator). */
  qid: string;
  title: string;
  expectSurfaced: string[];
  solutionUses: string[];
  mustNotSurface: string[];
}

/**
 * Pull citable theorem ids out of one prose list line. Accepts 1–109, the 200 band, and the
 * Appendix labels A1–A6/B1–B4. Filters the known prose traps: degree values (`90°`), squared
 * values (`64/25` is fine — both are ids? no: see below), ratios and lengths are excluded by
 * requiring standalone tokens NOT adjacent to `°`/`²`/`:`/`.`/letters.
 */
export function extractIds(line: string): string[] {
  const out: string[] = [];
  // Appendix labels first (A2, B3 …) — uppercase letter + single digit, standalone.
  for (const m of line.matchAll(/(?<![A-Za-z0-9_])(A[1-6]|B[1-4])(?![0-9a-z])/g)) {
    // Skip point-label runs like "ABCD" (already excluded by the lookbehind) and figure refs like
    // "S_ABC" (excluded by the `_` in the lookbehind).
    out.push(m[1]);
  }
  // Numeric ids: standalone 1–3 digit tokens, not part of a measurement or ratio.
  for (const m of line.matchAll(/(?<![\dA-Za-z_°²∠])(\d{1,3})(?![\d°²A-Za-z])/g)) {
    const n = Number(m[1]);
    const after = line.slice(m.index! + m[1].length);
    const before = line.slice(0, m.index!);
    // Exclude ratio/measure contexts: "2:1", "1/2 of", "= 90", "R/5", "p106"…
    if (/^\s*:/.test(after) || /:\s*$/.test(before)) continue;
    if (/[=≠<>≈]\s*$/.test(before)) continue;
    if ((n >= 1 && n <= 109) || n === 201) out.push(String(n));
  }
  return [...new Set(out)];
}

const LIST_KEYS = [
  ['expectSurfaced', /^\s*-\s*\*\*expectSurfaced/],
  ['solutionUses', /^\s*-\s*\*\*solutionUses/],
  ['mustNotSurface', /^\s*-\s*\*\*mustNotSurface/],
] as const;

/** Parse the whole ground-truth markdown into per-question id lists. */
export function parseGroundTruth(md: string): GroundTruthQuestion[] {
  const out: GroundTruthQuestion[] = [];
  let cur: GroundTruthQuestion | null = null;
  // Tolerate CRLF: a fresh git checkout on Windows (core.autocrlf) materializes the .md with
  // \r\n, and a trailing \r defeats the `$`-anchored heading match (JS `.` never matches \r).
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+(Q\d+|B\d+)\s+—\s+(.+)$/);
    if (h) {
      cur = { qid: h[1], title: h[2].trim(), expectSurfaced: [], solutionUses: [], mustNotSurface: [] };
      out.push(cur);
      continue;
    }
    if (/^##\s/.test(line) || /^#\s/.test(line)) {
      cur = null; // a removed/struck section (`## ~~B5~~`) or a non-question heading ends the scope
      continue;
    }
    if (!cur) continue;
    for (const [key, re] of LIST_KEYS) {
      // Strip the bold `- **label:**` prefix (the label may carry a parenthetical with degree
      // values — sliced off with it) so only the list body is scanned.
      if (re.test(line)) cur[key] = extractIds(line.slice(line.indexOf(':**') + 3));
    }
  }
  return out;
}

/**
 * THE MODEL STUB — the pure half of the browser harness's /api/parse guard (#1955, ADR-W-127).
 *
 * CLAUDE.md rule 2: only the operator authorises a live Anthropic call. A browser driven by a
 * script has no operator at it, so every `POST …/api/parse` such a browser makes is answered HERE,
 * in the harness, and never reaches the dev proxy:
 *
 *   - by DEFAULT with the proxy's own "not configured" answer (503 `no-api-key`) — the answer every
 *     client already reads as "the deterministic refusal stands", so a pre-play shows exactly what a
 *     keyless server shows;
 *   - or, for a case that deliberately exercises the AI lane, with the canonical lines the SESSION
 *     wrote as the oracle (the play-sheet spec's `llm` map: utterance → lines), answered 200
 *     `{ steps }` exactly as the proxy would, so the lines go through the real client re-parse.
 *
 * No browser here: the decisions are pure so `scripts/__tests__/model-stub.test.ts` can lock them.
 */

/** The proxy's path under any base (`/api/parse`, `/geo-builder/api/parse`, …), query allowed. */
export const PARSE_PATH_RE = /\/api\/parse\/?$/;

/** Does this URL (string or URL) address the model proxy? */
export function isParseUrl(url) {
  try {
    return PARSE_PATH_RE.test(new URL(String(url)).pathname);
  } catch {
    return false;
  }
}

/** The proxy's own keyless answer (`server/parseHandler.ts`: `send(503, { error: 'no-api-key' })`). */
export const NOT_CONFIGURED = Object.freeze({ status: 503, body: Object.freeze({ error: 'no-api-key' }) });

/** One spelling for matching: bidi marks stripped, whitespace collapsed, trimmed. */
export function normUtterance(s) {
  return String(s ?? '')
    .replace(/[⁦-⁩‎‏؜]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate a spec's `llm` map: `{ "<utterance as the client sends it>": ["canonical line", …] }`.
 * Returns problems as strings; an empty list means usable. `at` prefixes each problem.
 */
export function validateModelAnswers(llm, at = 'llm') {
  if (llm === undefined) return [];
  if (!llm || typeof llm !== 'object' || Array.isArray(llm))
    return [`${at}: \`llm\` must be an object mapping an utterance to the canonical lines the oracle answers`];
  const problems = [];
  for (const [k, v] of Object.entries(llm)) {
    if (!normUtterance(k)) problems.push(`${at}: an empty utterance key`);
    if (!Array.isArray(v) || v.length === 0 || !v.every((s) => typeof s === 'string' && s.trim() !== ''))
      problems.push(`${at}: «${k}» must map to a non-empty list of canonical lines`);
  }
  return problems;
}

/**
 * The stub's answer to one intercepted request body. Pure.
 * Returns `{ status, body, utterance, tool, mocked }`; `mocked` names the matched key or is null.
 */
export function modelStubAnswer(postData, answers) {
  let utterance = '';
  let tool = '2d';
  try {
    const j = JSON.parse(String(postData ?? ''));
    utterance = String(j?.utterance ?? '');
    tool = String(j?.tool ?? '') || '2d';
  } catch {
    /* an unreadable body gets the keyless answer like any other */
  }
  const want = normUtterance(utterance);
  for (const [k, lines] of Object.entries(answers ?? {})) {
    if (normUtterance(k) === want && want !== '') {
      return { status: 200, body: { steps: [...lines] }, utterance, tool, mocked: k };
    }
  }
  return { status: NOT_CONFIGURED.status, body: { ...NOT_CONFIGURED.body }, utterance, tool, mocked: null };
}

/**
 * What a run's ledger says is wrong. `leaks` are /api/parse requests that went to the network
 * (never answered by the stub) — a rule-2 breach, always a failure. A declared mock no request
 * used means the case never reached the AI lane it claims to test — a failure too.
 */
export function ledgerProblems(ledger, answers) {
  const problems = [];
  for (const url of ledger?.leaks ?? [])
    problems.push(`LIVE MODEL CALL — ${url} reached the network instead of the stub (CLAUDE.md rule 2)`);
  const used = new Set((ledger?.calls ?? []).map((c) => c.mocked).filter(Boolean));
  for (const k of Object.keys(answers ?? {}))
    if (!used.has(k)) problems.push(`llm: the mocked answer for «${k}» was never asked for — the case did not reach the AI lane`);
  return problems;
}

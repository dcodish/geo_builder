/**
 * run-sequence.mjs — headless verifier for an authored utterance SEQUENCE (#567, ADR-W-015).
 *
 * The verification engine of the `exercise-sequence` agent: given a file of utterances (one per
 * line, Hebrew or English), it replays them through the REAL pipeline and reports, per line,
 * whether the deterministic grammar owns it and what it built — so a "sequence that regenerates
 * the textbook figure" is a MEASURED claim, never a guess.
 *
 * MUST be run with vite-node (it imports the TS parsers/stores):
 *   npx vite-node .claude/skills/exercise-sequence/run-sequence.mjs --app 2d --file seq.txt
 *   npx vite-node .claude/skills/exercise-sequence/run-sequence.mjs --app 3d --file seq.txt
 *
 * File format: one utterance per line; blank lines and `#`-prefixed lines are ignored.
 *
 * NO NEW MIRROR of the submit path (the ADR-346 drift class): the 2-D lane calls the scenario
 * harness's `factsOf`/`replayFacts` — the same parse-with-context + #186/#539 auto-bind +
 * ADR-339 settle + ADR-098 display-seed path every e2e scenario runs — and the final figure is
 * judged by the same `violations` givens-verifier the harness's blanket assertion uses. The 3-D
 * lane is the triage.mjs `session3d` shape: `parse3` → `derive3`, guidance registers first.
 *
 * Verdict vocabulary (per line):
 *   built            — parsed deterministically AND new objects/points materialised (delta shown)
 *   applied          — parsed + committed with no new object, but the figure MOVED (a constraint
 *                      reshaped it) — a real given, landed
 *   no-change        — parsed + committed but nothing moved (re-entry / annotation / a default the
 *                      constraint already matched). Not a failure; judge whether the line is needed.
 *   error-now        — parsed + committed, but its fact status errs at THIS prefix. May legitimately
 *                      clear once later givens pin the figure (the ADR-104 deferral) — judged again
 *                      in the FINAL section; only a final non-ok is a failure.
 *   parse-fail       — the grammar does not own this line (the app would escalate to the LLM).
 *                      The line is DROPPED from the prefix; later verdicts may be affected.
 * Exit code 0 ⇔ every line parsed, every final fact status ok, and the verifier found no
 * violations. Anything else exits 1.
 */
import { readFileSync } from 'node:fs';

// ---- args ----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const app = opt('--app', '2d');
const file = opt('--file', null);
if (!file || (app !== '2d' && app !== '3d')) {
  console.error('usage: npx vite-node .claude/skills/exercise-sequence/run-sequence.mjs -- --app 2d|3d --file <utterances.txt>');
  process.exit(2);
}
const lines = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.replace(/^﻿/, '').trim())
  .filter((s) => s && !s.startsWith('#'));
if (!lines.length) { console.error('no utterances in ' + file); process.exit(2); }

const out = [];
const say = (s) => { out.push(s); };
let failed = false;

// ---- helpers -------------------------------------------------------------
const statusStr = (v) => (typeof v === 'string' ? v : v?.code ?? JSON.stringify(v));
const badStatuses = (status) => Object.entries(status).filter(([, v]) => v !== 'ok' && v !== 'disabled');
/** Did any position shared between the two snapshots move (a constraint reshaped the figure)? */
const moved = (prevPos, pos) => {
  for (const [k, p] of pos) {
    const q = prevPos.get(k);
    if (q && Math.hypot(p.x - q.x, p.y - q.y) + Math.abs((p.z ?? 0) - (q.z ?? 0)) > 1e-9) return true;
  }
  return false;
};

if (app === '2d') {
  // The REAL app path, via the harness — not a re-mirror (see header).
  const { factsOf, replayFacts } = await import('../../../src/__tests__/scenario-pipeline.ts');
  const { parse, buildParseCtx, classifyOutOfScope } = await import('../../../src/parser/index.ts');
  const { replay } = await import('../../../src/store/geoStore.ts');

  const steps = [];         // the surviving (parsing) prefix
  const lineOfGroup = [];   // group index -> source line text (parallel to steps)
  let prevDerived = replay([], 0);
  let anyErrorNow = false;

  for (const u of lines) {
    steps.push(u);
    let facts;
    try {
      facts = factsOf(steps);
    } catch {
      steps.pop();
      // Diagnose with the same context the failed parse saw.
      let reason = 'not-handled';
      try {
        const prevFacts = factsOf(steps);
        const d = replayFacts(prevFacts);
        const r = parse(u, buildParseCtx(d.construction, d.positions));
        if (!r.ok) reason = r.reason;
      } catch { /* keep the generic reason */ }
      const oos = (() => { try { return classifyOutOfScope(u); } catch { return null; } })();
      say(`✗ parse-fail   ${u}`);
      say(`               reason: ${reason}${oos ? ` (scope:${oos.category})` : ''} — dropped from prefix; later verdicts may be affected`);
      failed = true;
      continue;
    }
    lineOfGroup.push(u);
    const d = replayFacts(facts);
    const group = `g${lineOfGroup.length - 1}`;
    const bad = badStatuses(d.status).filter(([id]) => id.startsWith(`${group}.`));
    const newPts = [...d.positions.keys()].filter((k) => !prevDerived.positions.has(k));
    const newObjs = d.construction.objects.length - prevDerived.construction.objects.length;
    const types = [...new Set(facts.filter((f) => f.group === group).map((f) => f.cmd.type))].join(',');
    if (bad.length) {
      say(`⚠ error-now    ${u}`);
      say(`               ${bad.map(([id, v]) => `${id}: ${statusStr(v)}`).join('; ')} (may clear when later givens pin the figure)`);
      anyErrorNow = true;
    } else if (newPts.length || newObjs > 0) {
      say(`✓ built        ${u}`);
      say(`               [${types}] +${newObjs} object(s)${newPts.length ? `, new points: ${newPts.join(' ')}` : ''}`);
    } else if (moved(prevDerived.positions, d.positions)) {
      say(`✓ applied      ${u}`);
      say(`               [${types}] no new object; the figure reshaped to satisfy it`);
    } else {
      say(`○ no-change    ${u}`);
      say(`               [${types}] committed, but nothing moved — re-entry, annotation, or a default that already satisfied it`);
    }
    prevDerived = d;
  }

  // ---- final judgement on the full surviving sequence --------------------
  const facts = factsOf(steps);
  const d = replayFacts(facts);
  say('');
  say('── FINAL ──');
  const bad = badStatuses(d.status);
  if (bad.length) {
    failed = true;
    for (const [id, v] of bad) {
      const g = Number((id.match(/^g(\d+)/) ?? [])[1]);
      say(`✗ final status ${id}: ${statusStr(v)}  ← "${lineOfGroup[g] ?? '?'}"`);
    }
  } else if (anyErrorNow) {
    say('✓ every earlier error-now cleared once later givens landed (deferral)');
  }
  if (d.lastError != null) { failed = true; say(`✗ lastError: ${statusStr(d.lastError)}`); }
  const viol = d.violations ?? [];
  if (viol.length) {
    failed = true;
    for (const v of viol) say(`✗ verifier violation: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  } else {
    say('✓ givens verifier: no violations');
  }
  const pts = [...d.positions.keys()].filter((k) => !k.includes('-'));
  say(`figure: ${d.construction.objects.length} object(s) [${[...new Set(d.construction.objects.map((o) => o.kind))].join(', ')}], points: ${pts.join(' ')}`);
} else {
  // 3-D: parse3 → derive3, guidance registers first (the triage.mjs session3d shape).
  const { parse3 } = await import('../../../src3d/parser/parse3.ts');
  const { classifyGuidance3, upperCasedLabelCandidate3 } = await import('../../../src3d/parser/scope3.ts');
  const { derive3 } = await import('../../../src3d/store/store3.ts');

  let facts = [];
  let prev = derive3([], 0);
  let anyErrorNow = false;
  const lineOfId = {};
  for (const u of lines) {
    const r = parse3(u);
    if (!r.ok) {
      const upper3 = upperCasedLabelCandidate3(u);
      const g = classifyGuidance3(u);
      say(`✗ parse-fail   ${u}`);
      say(`               reason: ${r.reason}${upper3 && parse3(upper3).ok ? ' (scope:lowercase-labels — upper-cased form parses)' : g ? ` (scope:${g.category})` : ''} — dropped from prefix`);
      failed = true;
      continue;
    }
    const id = `f${facts.length}`;
    lineOfId[id] = u;
    const next = [...facts, { id, utterance: u, cmds: r.commands, enabled: true }];
    const d = derive3(next, 0);
    const st = d.status[id];
    const types = [...new Set(r.commands.map((c) => c.type))].join(',');
    if (st && st !== 'ok' && st !== 'disabled') {
      say(`⚠ error-now    ${u}`);
      say(`               ${id}: ${statusStr(st)} (may clear when later givens pin the figure)`);
      anyErrorNow = true;
    } else {
      const newPts = [...d.positions.keys()].filter((k) => !prev.positions.has(k));
      if (newPts.length || d.positions.size !== prev.positions.size) say(`✓ built        ${u}  [${types}]${newPts.length ? ` (new points: ${newPts.join(' ')})` : ''}`);
      else if (moved(prev.positions, d.positions)) say(`✓ applied      ${u}  [${types}] — the figure reshaped to satisfy it`);
      else say(`○ no-change    ${u}  [${types}] committed, but nothing moved`);
    }
    facts = next;
    prev = d;
  }
  const d = derive3(facts, 0);
  say('');
  say('── FINAL ──');
  const bad = badStatuses(d.status);
  if (bad.length) {
    failed = true;
    for (const [id, v] of bad) say(`✗ final status ${id}: ${statusStr(v)}  ← "${lineOfId[id] ?? '?'}"`);
  } else if (anyErrorNow) {
    say('✓ every earlier error-now cleared once later givens landed');
  }
  say(`figure: ${d.positions.size} positioned node(s): ${[...d.positions.keys()].join(' ')}`);
}

console.log(out.join('\n'));
console.log('');
console.log(failed ? 'RESULT: FAIL — the sequence does NOT yet regenerate the figure deterministically' : 'RESULT: OK — every line parses deterministically and the final figure is verifier-clean');
process.exit(failed ? 1 : 0);

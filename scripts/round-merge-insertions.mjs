#!/usr/bin/env node
// Round staging merges (fix-round Step 3): resolve conflicts where BOTH branches only INSERTED lines at the SAME
// point of a file (ADR-log tails, appended describe blocks, fixture-map entries). The result keeps the shared text
// once and both insertions, ours first: base = P + S, ours = P + X + S, theirs = P + Y + S  →  P + X + Y + S.
//
// Why a script: round #2822 resolved such conflicts by concatenating git's conflict halves, and git had already
// counted the shared closing lines («  });\n});») outside the hunk once — two describe blocks lost their closing
// braces. Working from the three stage blobs instead of the marker text makes that impossible.
//
// Usage, inside a merge that stopped on conflicts:   node scripts/round-merge-insertions.mjs [--dry]
// Resolves and `git add`s every unmerged file that is a pure same-point insertion on both sides; lists the rest
// (which need a hand merge) and exits 1 when any remain.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/** Pure: the merged text when both sides only inserted at one shared point; null otherwise. */
export function mergeInsertions(base, ours, theirs) {
  const split = (s) => s.split('\n');
  const b = split(base), o = split(ours), t = split(theirs);
  let p = 0;
  while (p < b.length && p < o.length && p < t.length && b[p] === o[p] && b[p] === t[p]) p++;
  let s = 0;
  while (s < b.length - p && s < o.length - p && s < t.length - p
    && b[b.length - 1 - s] === o[o.length - 1 - s] && b[b.length - 1 - s] === t[t.length - 1 - s]) s++;
  if (p + s !== b.length) return null; // the base itself changed between the shared prefix and suffix: not a pure insertion
  const x = o.slice(p, o.length - s), y = t.slice(p, t.length - s);
  return [...b.slice(0, p), ...x, ...y, ...b.slice(b.length - s)].join('\n');
}

function git(args, opts = {}) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts }); }

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1]?.endsWith('round-merge-insertions.mjs')) {
  const dry = process.argv.includes('--dry');
  const files = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  const left = [];
  for (const f of files) {
    let base, ours, theirs;
    try { base = git(['show', `:1:${f}`]); ours = git(['show', `:2:${f}`]); theirs = git(['show', `:3:${f}`]); }
    catch { left.push(`${f} (not a three-way text conflict)`); continue; }
    const merged = mergeInsertions(base, ours, theirs);
    if (merged === null) { left.push(`${f} (not a same-point insertion on both sides)`); continue; }
    if (!dry) { fs.writeFileSync(f, merged); git(['add', '--', f]); }
    console.log(`${dry ? 'would resolve' : 'resolved'}: ${f}`);
  }
  if (left.length) { console.log('needs a hand merge:\n  ' + left.join('\n  ')); process.exit(1); }
}

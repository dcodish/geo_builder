#!/usr/bin/env node
// Round staging merges (fix-round Step 3): resolve conflicts where the incoming branch only INSERTED one block into
// a file (ADR-log tails, appended describe blocks, fixture-map entries, corpus entries) while our side may have
// changed the file elsewhere (an earlier wave). The block is placed before the shared lines that follow it in the
// base, which our side still carries — so the shared closing lines appear exactly once.
//
// Why a script: round #2822 resolved such conflicts by concatenating git's conflict halves, and git had already
// counted the shared closing lines («  });\n});», «];») outside the hunk once — blocks lost their closers. Working
// from the three versions instead of the marker text makes that impossible.
//
// Usage, inside a merge that stopped on conflicts:   node scripts/round-merge-insertions.mjs [--dry]
// Resolves and `git add`s every unmerged file it can; lists the rest (a hand merge) and exits 1 when any remain.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const lines = (s) => s.split('\n');

/** Pure, strict: both sides only inserted at ONE shared point: base = P+S, ours = P+X+S, theirs = P+Y+S → P+X+Y+S. */
export function mergeInsertions(base, ours, theirs) {
  const b = lines(base), o = lines(ours), t = lines(theirs);
  let p = 0;
  while (p < b.length && p < o.length && p < t.length && b[p] === o[p] && b[p] === t[p]) p++;
  let s = 0;
  while (s < b.length - p && s < o.length - p && s < t.length - p
    && b[b.length - 1 - s] === o[o.length - 1 - s] && b[b.length - 1 - s] === t[t.length - 1 - s]) s++;
  if (p + s !== b.length) return null;
  return [...b.slice(0, p), ...o.slice(p, o.length - s), ...t.slice(p, t.length - s), ...b.slice(b.length - s)].join('\n');
}

/**
 * Pure, general: THEIRS is base plus ONE inserted block Y (base = P+S, theirs = P+Y+S); OURS may differ from base
 * anywhere. Y goes into ours right before ours' last occurrence of the anchor — the first K lines of S (K ≥ 2, or all
 * of S when shorter) — so Y keeps the same lines after it that it had in theirs. Null when theirs is not a single
 * insertion or ours lost the anchor.
 */
export function insertTheirs(base, ours, theirs) {
  const b = lines(base), o = lines(ours), t = lines(theirs);
  let p = 0;
  while (p < b.length && p < t.length && b[p] === t[p]) p++;
  let s = 0;
  while (s < b.length - p && s < t.length - p && b[b.length - 1 - s] === t[t.length - 1 - s]) s++;
  if (p + s !== b.length) return null; // theirs changed base lines, not only inserted
  const y = t.slice(p, t.length - s);
  if (!y.length) return ours;
  const S = b.slice(b.length - s);
  const k = Math.min(S.length, Math.max(2, Math.min(4, S.length)));
  const anchor = S.slice(0, k);
  if (!anchor.length || anchor.every((l) => l.trim() === '')) return null;
  for (let i = o.length - anchor.length; i >= 0; i--) {
    if (anchor.every((l, j) => o[i + j] === l)) return [...o.slice(0, i), ...y, ...o.slice(i)].join('\n');
  }
  return null;
}

function git(args) { return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 }); }

if (process.argv[1]?.replace(/\\/g, '/').endsWith('round-merge-insertions.mjs')) {
  const dry = process.argv.includes('--dry');
  const files = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  const left = [];
  for (const f of files) {
    let base, ours, theirs;
    try { base = git(['show', `:1:${f}`]); ours = git(['show', `:2:${f}`]); theirs = git(['show', `:3:${f}`]); }
    catch { left.push(`${f} (not a three-way text conflict)`); continue; }
    const merged = mergeInsertions(base, ours, theirs) ?? insertTheirs(base, ours, theirs);
    if (merged === null) { left.push(`${f} (the incoming side is not a single inserted block)`); continue; }
    if (f.endsWith('.json')) { try { JSON.parse(merged); } catch { left.push(`${f} (the merge is not valid JSON)`); continue; } }
    if (!dry) { fs.writeFileSync(f, merged); git(['add', '--', f]); }
    console.log(`${dry ? 'would resolve' : 'resolved'}: ${f}`);
  }
  if (left.length) { console.log('needs a hand merge:\n  ' + left.join('\n  ')); process.exit(1); }
}

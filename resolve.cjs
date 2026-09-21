const fs = require('fs');

/**
 * Both sides are APPEND-ONLY additions from the round's own items, so "keep both, in order" is the
 * whole resolution — the ADR log gets 541 then 542/543/544 (numeric = composition order), and the
 * FR-EN-8 / FR-EN-9 lines get every sentence each item added.
 */
function resolve(path, pick) {
  let s = fs.readFileSync(path, 'utf8');
  const re = /^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n/gm;
  let n = 0;
  s = s.replace(re, (_m, ours, theirs) => {
    n++;
    return pick(ours, theirs);
  });
  if (n === 0) throw new Error(`no conflict found in ${path}`);
  fs.writeFileSync(path, s);
  console.log(`${path}: ${n} conflict(s) resolved`);
}

// ---- the ADR log: ours (541) then theirs (542, 543, 544)
resolve('docs/06-decisions.md', (ours, theirs) => `${ours.trimEnd()}\n\n${theirs}`);

// ---- requirements: merge the two versions of FR-EN-8 and FR-EN-9 line by line.
resolve('docs/02-requirements.md', (ours, theirs) => {
  const o = ours.split('\n').filter(Boolean);
  const t = theirs.split('\n').filter(Boolean);
  if (o.length !== t.length) throw new Error(`FR line counts differ: ${o.length} vs ${t.length}`);
  const out = o.map((line, i) => {
    const other = t[i];
    if (line === other) return line;
    // One side is the other plus a trailing sentence (each item appended to the same line).
    const [shortLine, longLine] = line.length < other.length ? [line, other] : [other, line];
    if (!longLine.startsWith(shortLine)) throw new Error(`unexpected divergence on FR line ${i}`);
    const extra = longLine.slice(shortLine.length);
    // `shortLine` is the version WITHOUT this item's sentence; the other side may have added its own
    // sentence to that same base, so splice both tails onto the common base.
    const base = shortLine;
    const otherTail = (line.length < other.length ? line : other).slice(base.length);
    return base + otherTail + extra;
  });
  return out.join('\n') + '\n';
});

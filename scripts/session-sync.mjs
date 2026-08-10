#!/usr/bin/env node
/**
 * Cross-machine session sync — wired to the SessionStart / SessionEnd hooks in
 * `.claude/settings.json`. See CLAUDE.md "Cross-machine setup".
 *
 * The project left Dropbox on 2026-07-23, so **git is the only channel** between the
 * home PC and the work PC. Anything not committed-and-pushed does not exist on the
 * other machine. This script makes the two ends of that rule mechanical:
 *
 *   start  pull origin (ff-only), then report anything that needs a human decision —
 *          dependencies changed by the pull, uncommitted files left from last time,
 *          commits not yet pushed, or auto-memory landing outside the repo.
 *   end    push committed work, so "I forgot to push" can't strand a day's commits
 *          on one machine (CLAUDE.md: commit ⇒ push).
 *
 * Never blocks a session: every failure degrades to one printed line and exit 0.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const repo = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const mode = process.argv[2] === 'end' ? 'end' : 'start'
const out = []

const git = (args) =>
  execSync(`git ${args}`, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const tryGit = (args) => {
  try {
    return git(args)
  } catch {
    return null
  }
}
// Untrimmed variant: `status --porcelain` encodes state in the first two columns, and the
// leading space of an unstaged change (" M path") is significant — trimming shifts the path.
const tryGitRaw = (args) => {
  try {
    return execSync(`git ${args}`, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return null
  }
}
const firstLine = (s) => String(s || '').trim().split('\n')[0]
/**
 * #489 — the first meaningful line of a git failure, not the first line.
 *
 * `git pull` writes its progress banner to STDERR, so `e.stderr` is non-empty on essentially every
 * failure and taking its first line yields `From https://github.com/…` — git's fetch banner, which is
 * not a reason for anything. A real session start printed exactly that while `main` sat 17 commits
 * behind, so the safety net reported nothing actionable in the one case it exists for. The selector's
 * intent (prefer stderr) was right; its first-line assumption was noise by construction.
 *
 * So: drop the transport chatter, then PREFER a line in git's own error vocabulary (`fatal:`, `error:`,
 * `hint:`, "not possible to fast-forward", "would be overwritten"…). Fall back to the first surviving
 * line, then to the raw text — never to nothing, because a warning with no reason is what this fixes.
 */
const gitReason = (e) => {
  const raw = String(e?.stderr || e?.stdout || e?.message || '').trim()
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(?:From |remote:|Receiving |Resolving |Unpacking |Counting |Compressing |Enumerating |\* branch|\s*\d+%)/.test(l))
  return lines.find((l) => /^(?:fatal|error|hint):|not possible to fast-forward|would be overwritten|refusing|cannot lock|Permission denied|Authentication/i.test(l)) ?? lines[0] ?? firstLine(raw) ?? 'no reason reported by git'
}
/** `gh` with a JSON payload, or null for every failure mode there is: `gh` absent, not
 *  authenticated, no network, rate-limited, or output that isn't JSON. Never throws — a session
 *  must start on a box that has never seen the GitHub CLI (#488). The timeout matters: `gh` hits
 *  the network, and a hook that hangs is worse than a hook that reports nothing. */
const ghJson = (args) => {
  try {
    return JSON.parse(
      execSync(`gh ${args}`, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }),
    )
  } catch {
    return null
  }
}

if (tryGit('rev-parse --git-dir') === null) process.exit(0) // not a repo — nothing to sync

const ahead = () => {
  const n = tryGit('rev-list --count @{u}..HEAD') // null when there is no upstream
  return n === null ? 0 : Number(n)
}

if (mode === 'end') {
  if (ahead() > 0) {
    try {
      git('push')
      out.push('↑ pushed committed work to origin')
    } catch (e) {
      out.push(`⚠ push failed — commits are still local only: ${gitReason(e)}`)
    }
  }
} else {
  const before = tryGit('rev-parse HEAD')

  try {
    git('pull --ff-only')
  } catch (e) {
    // Dirty tree, diverged branch, or offline. --ff-only never merges, so nothing is at risk.
    out.push(`⚠ pull skipped: ${gitReason(e)}`)
  }

  const after = tryGit('rev-parse HEAD')
  if (before && after && before !== after) {
    out.push(`↓ pulled ${tryGit(`rev-list --count ${before}..${after}`)} commit(s) — HEAD: ${tryGit('log --oneline -1')}`)
    const changed = (tryGit(`diff --name-only ${before} ${after}`) || '').split('\n')
    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json'))
      out.push('⚠ dependency manifest changed in the pull — run `npm install` before running tests or the dev server')
  }

  const dirty = (tryGitRaw('status --porcelain') || '').split('\n').filter(Boolean)
  if (dirty.length) {
    const names = dirty.slice(0, 3).map((l) => l.slice(3)).join(', ')
    out.push(`● ${dirty.length} uncommitted file(s) from a previous session: ${names}${dirty.length > 3 ? ', …' : ''}`)
  }

  const n = ahead()
  if (n > 0) out.push(`● ${n} commit(s) committed but NOT pushed — they are invisible on the other machine`)

  // auto-memory must land in the repo (.claude/memory/) to travel; the default location is
  // machine-local. If this directory ever appears, the settings key stopped being honored.
  const stray = join(homedir(), '.claude', 'projects', 'c--projects-geo-builder', 'memory')
  if (existsSync(stray))
    out.push(`⚠ auto-memory is being written OUTSIDE the repo (${stray}) — it will NOT travel between machines; move the files into .claude/memory/ and check autoMemoryDirectory`)

  // ── MERGED-ness and DEPLOYED-ness (#488) ────────────────────────────────────────────────────
  // Everything above keys on ONE predicate: committed-and-pushed. That model is true and
  // insufficient — there are two further states where work is finished and still invisible, and
  // both bit on the same day (2026-08-09): PR #471 was built, green and pushed but never merged,
  // and the proxy had not been deployed for two weeks under a run of static-only deploys. The data
  // was always available (`gh pr list`, `git log prod/…..main`); no surface read it (the ADR-352 /
  // ADR-434 shape). Best-effort by contract, like everything else here: a missing or
  // unauthenticated `gh`, an offline box, or a repo with no prod tag prints nothing and exits 0.
  const prs = ghJson('pr list --state open --json number,title,headRefName')
  if (prs?.length)
    out.push(
      `● ${prs.length} open PR(s) awaiting play-and-approve:\n` +
        prs.map((p) => `    #${p.number} ${p.title} (${p.headRefName})`).join('\n'),
    )

  // The newest prod tag vs the trunk. `prod/YYYY-MM-DD[-n]` sorts correctly by creation date
  // (docs/RUNBOOK.md), and the comparison uses origin/main when it resolves — the deploy ships
  // committed trunk state, never a local branch.
  const lastTag = firstLine(tryGit('tag --list prod/* --sort=-creatordate'))
  const trunk = tryGit('rev-parse --verify --quiet origin/main') ? 'origin/main' : 'main'
  if (lastTag) {
    const undeployed = Number(tryGit(`rev-list --count ${lastTag}..${trunk}`) ?? 0)
    if (undeployed > 0) {
      // `server/__tests__` is excluded on purpose: a test-only change there ships nothing, and a
      // "needs a PROXY deploy" line that fires on it teaches the operator to ignore the line.
      const proxy = Number(tryGit(`rev-list --count ${lastTag}..${trunk} -- server ":(exclude)server/__tests__"`) ?? 0)
      out.push(
        `● ${undeployed} commit(s) on ${trunk} not deployed (last: ${lastTag})` +
          (proxy > 0 ? ` — ${proxy} touch server/, so this needs a PROXY deploy (rebuild + restart), not a static push` : ''),
      )
    }
  }
}

if (out.length) console.log(out.join('\n'))

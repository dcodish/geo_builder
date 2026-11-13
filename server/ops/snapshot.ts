/**
 * What the management console reads when a page opens (#2868, ADR-W-208): GitHub's record of the project,
 * fetched through the cached client, plus the repo files the sessions write for it (`ops/*.json`, the play
 * sheets' spot-audit queue, the deploy log).
 *
 * Every part loads independently. A part that fails is named in `errors` and the page shows the rest with
 * that part marked unavailable, never as zero.
 */
import type { GhClient } from './github';

export interface Issue {
  n: number;
  title: string;
  open: boolean;
  labels: string[];
  body: string;
  created: string;
  closed: string | null;
  updated: string;
  /** `completed` / `not_planned` / `duplicate` / null */
  reason: string | null;
  comments: number;
}

export interface Pr {
  n: number;
  title: string;
  body: string;
  branch: string;
  created: string;
  updated: string;
  draft: boolean;
  closes: number[];
}

export interface Commit {
  sha: string;
  subject: string;
  date: string;
}

export interface Live {
  tag: string;
  date: string | null;
  aheadBy: number;
  ahead: Commit[];
}

export interface DeployRow {
  date: string;
  tag: string;
  commit: string;
  apps: string;
  what: string;
}

export interface Snapshot {
  asOf: string;
  open: Issue[];
  /** Every issue updated since the plan began (open or closed) — closes, filings and the plan's states. */
  recent: Issue[];
  /** Closed parked issues (`icebox`). */
  parked: Issue[];
  prs: Pr[];
  commits: Commit[];
  live: Live | null;
  deploys: DeployRow[];
  rounds: Issue[];
  files: {
    plan: unknown;
    units: unknown;
    readiness: unknown;
    directions: unknown;
    spotAudits: unknown;
  };
  errors: string[];
}

export interface RawIssue {
  number: number;
  title: string;
  state: string;
  state_reason?: string | null;
  labels: ({ name: string } | string)[];
  body?: string | null;
  created_at: string;
  closed_at?: string | null;
  updated_at: string;
  pull_request?: unknown;
  comments?: number;
}

export function toIssue(i: RawIssue): Issue {
  return {
    n: i.number,
    title: i.title,
    open: i.state === 'open',
    labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
    body: i.body ?? '',
    created: i.created_at,
    closed: i.closed_at ?? null,
    updated: i.updated_at,
    reason: i.state_reason ?? null,
    comments: i.comments ?? 0,
  };
}

/** `Closes #12`, `Fixes #3, #4` — the issues a PR body says it closes. */
export function closesOf(body: string): number[] {
  const out = new Set<number>();
  for (const m of body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+((?:#\d+[\s,]*(?:and\s+)?)+)/gi))
    for (const k of m[1].matchAll(/#(\d+)/g)) out.add(Number(k[1]));
  return [...out];
}

/** The DEPLOY-LOG table's rows, newest first (the file is append-at-top). */
export function deployRows(md: string, max = 30): DeployRow[] {
  const rows: DeployRow[] = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*`?(prod\/[^`|\s]+)`?\s*\|\s*`?([0-9a-f]{6,40})`?\s*\|([^|]*)\|[^|]*\|(.*)\|\s*$/);
    if (!m) continue;
    rows.push({ date: m[1], tag: m[2], commit: m[3], apps: m[4].trim(), what: m[5].trim() });
    if (rows.length >= max) break;
  }
  return rows;
}

/** Natural order of `prod/YYYY-MM-DD[-n]` tags, newest first. */
export function newestProdTag(names: string[]): string | null {
  const key = (t: string) => {
    const m = t.match(/^prod\/(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/);
    return m ? `${m[1]}#${String(Number(m[2] ?? 1)).padStart(4, '0')}` : '';
  };
  const sorted = names.filter((t) => key(t)).sort((a, b) => key(b).localeCompare(key(a)));
  return sorted[0] ?? null;
}

const json = (text: string | null): unknown => (text == null ? null : JSON.parse(text));

export interface LoadOpts {
  /** Issues updated since this ISO date are read in full (the plan's start). */
  since: string;
  /** Commits on main since this ISO date. */
  commitsSince: string;
  /** The branch the `ops/` files and the play sheets are read from: `main` in production, the PR branch while it is played. */
  ref?: string;
  now?: () => Date;
}

export async function loadSnapshot(gh: GhClient, opts: LoadOpts): Promise<Snapshot> {
  const ref = opts.ref ?? 'main';
  const errors: string[] = [];
  const part = async <T>(name: string, load: () => Promise<T>, empty: T): Promise<T> => {
    try {
      return await load();
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      return empty;
    }
  };
  const issuesOf = (rows: RawIssue[]) => rows.filter((r) => !r.pull_request).map(toIssue);

  const [open, recent, parked, prs, commits, live, deploys, rounds, plan, units, readiness, directions, spotAudits] = await Promise.all([
    part('open issues', async () => issuesOf(await gh.getAll<RawIssue>('issues?state=open', 10)), [] as Issue[]),
    part('recent issues', async () => issuesOf(await gh.getAll<RawIssue>(`issues?state=all&sort=updated&direction=desc&since=${opts.since}`, 15)), [] as Issue[]),
    part('parked issues', async () => issuesOf(await gh.getAll<RawIssue>('issues?state=closed&labels=icebox', 5)), [] as Issue[]),
    part('pull requests', async () => {
      const rows = await gh.getAll<{ number: number; title: string; body: string | null; head: { ref: string }; created_at: string; updated_at: string; draft?: boolean }>('pulls?state=open', 3);
      return rows.map((p): Pr => ({ n: p.number, title: p.title, body: p.body ?? '', branch: p.head.ref, created: p.created_at, updated: p.updated_at, draft: !!p.draft, closes: closesOf(p.body ?? '') }));
    }, [] as Pr[]),
    part('commits', async () => {
      const rows = await gh.getAll<{ sha: string; commit: { message: string; committer: { date: string } } }>(`commits?sha=main&since=${opts.commitsSince}`, 4);
      return rows.map((c): Commit => ({ sha: c.sha, subject: c.commit.message.split('\n')[0], date: c.commit.committer.date }));
    }, [] as Commit[]),
    part('live', async (): Promise<Live | null> => {
      const refs = await gh.get<{ ref: string }[]>('git/matching-refs/tags/prod/');
      const tag = newestProdTag(refs.map((r) => r.ref.replace(/^refs\/tags\//, '')));
      if (!tag) return null;
      const cmp = await gh.get<{ ahead_by: number; base_commit?: { commit: { committer: { date: string } } }; commits: { sha: string; commit: { message: string; committer: { date: string } } }[] }>(`compare/${tag}...main`);
      return {
        tag,
        date: cmp.base_commit?.commit.committer.date ?? null,
        aheadBy: cmp.ahead_by,
        ahead: cmp.commits.map((c) => ({ sha: c.sha, subject: c.commit.message.split('\n')[0], date: c.commit.committer.date })).reverse(),
      };
    }, null),
    part('deploy log', async () => deployRows((await gh.file('docs/DEPLOY-LOG.md')) ?? ''), [] as DeployRow[]),
    part('fix rounds', async () => {
      const r = await gh.get<{ items: RawIssue[] }>(`/search/issues?q=${encodeURIComponent(`repo:${gh.repo} is:issue in:title fix-round`)}&sort=created&order=desc&per_page=20`);
      return r.items.filter((i) => /^fix-round\b/i.test(i.title)).map(toIssue);
    }, [] as Issue[]),
    part('ops/plan.json', async () => json(await gh.file('ops/plan.json', ref)), null),
    part('ops/units.json', async () => json(await gh.file('ops/units.json', ref)), null),
    part('ops/readiness.json', async () => json(await gh.file('ops/readiness.json', ref)), null),
    part('ops/directions.json', async () => json(await gh.file('ops/directions.json', ref)), null),
    part('spot audits', async () => json(await gh.file('scripts/playsheets/spot-audits.json', ref)), null),
  ]);

  return {
    asOf: (opts.now?.() ?? new Date()).toISOString(),
    open,
    recent,
    parked,
    prs,
    commits,
    live,
    deploys,
    rounds,
    files: { plan, units, readiness, directions, spotAudits },
    errors,
  };
}

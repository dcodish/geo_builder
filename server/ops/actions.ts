/**
 * Answering on the page (#2868 step 2, ADR-W-208): a FIXED allow-list of actions, each validated here and
 * turned into the GitHub writes that record it in its permanent home. No pass-through to the GitHub API.
 *
 * Every comment states that it came from the page, with the time. The server never merges, deploys, closes a
 * round or closes an issue as fixed: those stay with a session, which runs the gates.
 *
 * `plan` is pure (form → the writes); `run` performs them. In dry-run mode the page shows the plan instead.
 */
import { recordAudit } from '../../scripts/lib/case-closure.mjs';
import type { GhClient } from './github';

export type Write =
  | { op: 'comment'; issue: number; body: string }
  | { op: 'addLabels'; issue: number; labels: string[] }
  | { op: 'removeLabel'; issue: number; label: string }
  | { op: 'close'; issue: number; reason: 'not_planned' }
  | { op: 'create'; title: string; body: string; labels: string[] }
  | { op: 'editJson'; path: string; message: string; edit: string; args: Record<string, unknown> };

export interface ActionResult {
  ok: boolean;
  /** Hebrew, shown on the page */
  message: string;
  writes: Write[];
}

const PRIORITIES = ['P1', 'P2', 'P3', 'later'];
const BUILDER_LABEL: Record<string, string> = { analytic: 'analytic', '3d': '3d', '2d': '2d', complex: 'complex' };

const stamp = (when: Date) => `_— נכתב בדף הניהול, ${when.toISOString().slice(0, 16).replace('T', ' ')} UTC_`;
const num = (v: string | null) => (v && /^\d{1,6}$/.test(v) ? Number(v) : null);
const clean = (v: string | null, max = 4000) => (v ?? '').replace(/\r/g, '').trim().slice(0, max);
const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');
const fail = (message: string): ActionResult => ({ ok: false, message, writes: [] });

/**
 * The form → the writes. `f` is the POSTed form; `when` the server clock. Returns a refusal (ok:false, no
 * writes) for anything outside the allow-list or missing a field.
 */
export function planAction(f: URLSearchParams, when: Date): ActionResult {
  const action = f.get('action');
  const date = when.toISOString().slice(0, 10);
  const note = clean(f.get('note'));
  switch (action) {
    case 'rule': {
      const issue = num(f.get('issue'));
      const option = clean(f.get('option'), 2).toUpperCase();
      const optionLabel = clean(f.get('optionLabel'), 400);
      if (!issue) return fail('חסר מספר issue.');
      if (!option && !note) return fail('בחרו אפשרות או כתבו פסיקה.');
      const lines = [`## Operator ruling — ${date} (management page)`, ''];
      if (option) lines.push(`**Choice: ${option}**${optionLabel ? ` — ${optionLabel}` : ''}`, '');
      if (note) lines.push(quote(note), '');
      lines.push(stamp(when));
      return {
        ok: true,
        message: `הפסיקה נרשמה ב-#${issue}, והתווית needs-operator הוסרה.`,
        writes: [
          { op: 'comment', issue, body: lines.join('\n') },
          { op: 'removeLabel', issue, label: 'needs-operator' },
        ],
      };
    }
    case 'play': {
      const pr = num(f.get('pr'));
      const verdict = f.get('verdict');
      if (!pr) return fail('חסר מספר PR.');
      if (verdict !== 'pass' && verdict !== 'fail') return fail('בחרו עבר או נכשל.');
      if (verdict === 'fail' && !note) return fail('כשמשהו נכשל, כתבו מה ראיתם.');
      const body = [
        `## Operator play — ${verdict === 'pass' ? 'PASS ✅' : 'FAIL ❌'} (${date}, management page)`,
        '',
        ...(note ? [quote(note), ''] : []),
        stamp(when),
      ].join('\n');
      return { ok: true, message: `התוצאה נרשמה על PR #${pr}.`, writes: [{ op: 'comment', issue: pr, body }] };
    }
    case 'audit': {
      const sheet = clean(f.get('sheet'), 120);
      const id = clean(f.get('id'), 40);
      const verdict = f.get('verdict');
      if (!sheet || !id || !/^[\w.-]+$/.test(sheet) || !/^[\w.-]+$/.test(id)) return fail('חסר מזהה בדיקה.');
      if (verdict !== 'pass' && verdict !== 'fail') return fail('בחרו עבר או נכשל.');
      if (verdict === 'fail' && !note) return fail('כשמשהו נכשל, כתבו מה ראיתם.');
      return {
        ok: true,
        message: `בדיקת המדגם ${sheet}:${id} נרשמה (${verdict === 'pass' ? 'עברה' : 'נכשלה'}).`,
        writes: [{
          op: 'editJson',
          path: 'scripts/playsheets/spot-audits.json',
          message: `spot audit ${sheet}:${id}: ${verdict} (operator, management page)`,
          edit: 'recordAudit',
          args: { sheet, id, pass: verdict === 'pass', date, note: `operator ${date}, management page${note ? `: ${note}` : ''}` },
        }],
      };
    }
    case 'approve': {
      const issue = num(f.get('issue'));
      if (!issue) return fail('חסר מספר issue.');
      const body = [
        `## Plan approved — ${date} (operator, management page)`,
        '',
        'The operator approved this fix plan as written, including its `[proposed]` lines, on the management page. `auto-ok` applied as transcription of that approval (ADR-W-014, ADR-W-117).',
        ...(note ? ['', quote(note)] : []),
        '',
        stamp(when),
      ].join('\n');
      return {
        ok: true,
        message: `התוכנית ב-#${issue} אושרה (auto-ok).`,
        writes: [
          { op: 'comment', issue, body },
          { op: 'addLabels', issue, labels: ['auto-ok'] },
        ],
      };
    }
    case 'priority': {
      const issue = num(f.get('issue'));
      const to = f.get('to') ?? '';
      const from = (f.get('from') ?? '').split(',').filter((p) => PRIORITIES.includes(p));
      if (!issue || !PRIORITIES.includes(to)) return fail('עדיפות לא מוכרת.');
      const body = [`## Priority → ${to} — ${date} (operator, management page)`, '', ...(note ? [quote(note), ''] : []), stamp(when)].join('\n');
      return {
        ok: true,
        message: `העדיפות של #${issue} שונתה ל-${to}.`,
        writes: [
          ...from.filter((p) => p !== to).map((label): Write => ({ op: 'removeLabel', issue, label })),
          { op: 'addLabels', issue, labels: [to] },
          { op: 'comment', issue, body },
        ],
      };
    }
    case 'park': {
      const issue = num(f.get('issue'));
      if (!issue) return fail('חסר מספר issue.');
      if (!note) return fail('כתבו למה זה נדחה (נשמר ב-issue).');
      const body = [`## Parked — ${date} (operator, management page)`, '', quote(note), '', stamp(when)].join('\n');
      return {
        ok: true,
        message: `#${issue} הועבר לקרח (icebox) ונסגר כ-not planned.`,
        writes: [
          { op: 'comment', issue, body },
          { op: 'addLabels', issue, labels: ['icebox'] },
          { op: 'close', issue, reason: 'not_planned' },
        ],
      };
    }
    case 'pull': {
      const issue = num(f.get('issue'));
      const week = num(f.get('week'));
      if (!issue || !week) return fail('חסר issue או שבוע.');
      const by = `operator on the management page${note ? `: ${note}` : ''}`;
      return {
        ok: true,
        message: `#${issue} נמשך לשבוע ${week} בתוכנית.`,
        writes: [
          { op: 'editJson', path: 'ops/plan.json', message: `plan: pull #${issue} into week ${week} (operator, management page)`, edit: 'pull', args: { issue, week, at: date, by } },
          { op: 'comment', issue, body: [`## Pulled into week ${week} — ${date} (operator, management page)`, '', ...(note ? [quote(note), ''] : []), stamp(when)].join('\n') },
        ],
      };
    }
    case 'note': {
      const issue = num(f.get('issue'));
      if (!issue || !note) return fail('חסר issue או טקסט.');
      return { ok: true, message: `ההערה נוספה ל-#${issue}.`, writes: [{ op: 'comment', issue, body: [`## Operator note — ${date} (management page)`, '', quote(note), '', stamp(when)].join('\n') }] };
    }
    case 'file': {
      const builder = f.get('builder') ?? '';
      const line = clean(f.get('line'), 300).replace(/\s+/g, ' ');
      const outcome = clean(f.get('outcome'), 40);
      const sessions = clean(f.get('sessions'), 400);
      const link = clean(f.get('link'), 400);
      if (!BUILDER_LABEL[builder] || !line) return fail('חסר כלי או שורה.');
      const body = [
        `**Reported:** ${date} — filed from the management page: a real user typed this line in the last 7 days and it ${outcome === 'llm-built' ? 'needed the AI' : 'was not understood'}.`,
        '',
        '```',
        line,
        '```',
        '',
        `Sessions: ${sessions || '—'}${link ? ` · [timeline](${link})` : ''}`,
        ...(note ? ['', quote(note)] : []),
        '',
        'Triage, priority and the fix plan stay with a session (docs/22 §2).',
        '',
        stamp(when),
      ].join('\n');
      return { ok: true, message: `נפתח issue על «${line}».`, writes: [{ op: 'create', title: `«${line}» (${builder}, a user's line)`, body, labels: [BUILDER_LABEL[builder], 'reported'] }] };
    }
    default:
      return fail('פעולה לא מוכרת.');
  }
}

// ── the JSON-file edits a commit carries ─────────────────────────────────────

/** Apply one named edit to a repo JSON file's parsed content. Pure. */
export function applyEdit(edit: string, doc: unknown, args: Record<string, unknown>): unknown {
  if (edit === 'recordAudit') {
    const a = args as { sheet: string; id: string; pass: boolean; date: string; note: string };
    return recordAudit(doc, a.sheet, a.id, a.pass, a.date, a.note);
  }
  if (edit === 'pull') {
    const p = doc as { pulled?: unknown[] };
    const a = args as { issue: number; week: number; at: string; by: string };
    return { ...p, pulled: [...(p.pulled ?? []), { at: a.at, by: a.by, issue: a.issue, week: a.week }] };
  }
  throw new Error(`unknown edit ${edit}`);
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** Perform the writes in order. Returns the issue a `create` opened, when there was one. */
export async function runWrites(gh: GhClient, writes: Write[], ref = 'main'): Promise<{ created: number | null }> {
  let created: number | null = null;
  for (const w of writes) {
    switch (w.op) {
      case 'comment':
        await gh.send('POST', `issues/${w.issue}/comments`, { body: w.body });
        break;
      case 'addLabels':
        await gh.send('POST', `issues/${w.issue}/labels`, { labels: w.labels });
        break;
      case 'removeLabel':
        try {
          await gh.send('DELETE', `issues/${w.issue}/labels/${encodeURIComponent(w.label)}`);
        } catch (e) {
          // Already gone: the state the action wanted.
          if (!(e instanceof Error && /\b404\b/.test(e.message))) throw e;
        }
        break;
      case 'close':
        await gh.send('PATCH', `issues/${w.issue}`, { state: 'closed', state_reason: w.reason });
        break;
      case 'create': {
        const r = await gh.send<{ number: number }>('POST', 'issues', { title: w.title, body: w.body, labels: w.labels });
        created = r?.number ?? null;
        break;
      }
      case 'editJson': {
        const cur = await gh.get<{ sha: string; content: string }>(`contents/${w.path}?ref=${encodeURIComponent(ref)}`, true);
        const doc = JSON.parse(Buffer.from(cur.content, 'base64').toString('utf8'));
        const next = applyEdit(w.edit, doc, w.args);
        // The sha pins the write: a file changed since it was read is refused (409), never overwritten.
        await gh.send('PUT', `contents/${w.path}`, { message: w.message, content: b64(JSON.stringify(next, null, 2) + '\n'), sha: cur.sha, branch: ref });
        break;
      }
    }
  }
  return { created };
}

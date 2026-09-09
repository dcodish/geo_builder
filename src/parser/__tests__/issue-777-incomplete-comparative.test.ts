/**
 * #777 — «צלע AD גדולה פי 2»: TWICE WHAT? An incomplete comparative ASKS; it never guesses.
 *
 * Prod, session `9xejwvfv` (log-triage 2026-08-24, operator-approved "fix this"):
 *
 * ```
 * [parser/ok]         מקבילית ABCD
 * [llm/built-nothing] צלע AD גדולה פי 2
 * ```
 *
 * The LLM returned nothing that time. The risk is that it does not: the only way to "handle" this
 * utterance is to INVENT the second operand, and an invented comparand is a given the student never
 * stated — the ADR-052 cardinal sin, committed with a green ✓ and one Enter from the figure.
 *
 * So the destination is a clarification, not an escalation — the same pedagogical spine as the
 * role-side ask (#775): name what is missing, keep the text so the student completes it in place.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../index';

const r = (u: string) => parse(u, {});

describe('#777 — the incomplete comparative asks', () => {
  it('the reported line returns the clarification, not commands and not an escalation', () => {
    const res = r('צלע AD גדולה פי 2');
    expect(res).toMatchObject({ ok: false, reason: 'incomplete-comparative', subject: 'AD', factor: '2' });
  });

  it('its siblings from the same measurement do too', () => {
    for (const u of ['AD גדולה פי 2', 'AD ארוכה פי 2']) {
      expect(r(u), u).toMatchObject({ ok: false, reason: 'incomplete-comparative', subject: 'AD' });
    }
  });

  it('it is NOT `not-handled` — which is what used to send it to the LLM', () => {
    // The whole point: `not-handled` is the escalation seam. Reaching it here would put a paid call in
    // front of the one question the model must not answer.
    expect(r('צלע AD גדולה פי 2')).not.toMatchObject({ reason: 'not-handled' });
  });

  it('the factor is reported verbatim, so the ask can quote it back', () => {
    expect(r('AD גדולה פי 3')).toMatchObject({ factor: '3' });
  });
});

describe('#777 — a COMPLETE comparative is untouched', () => {
  it('«AD גדול פי 2 מ AB» still lowers to set-ratio', () => {
    const res = r('AD גדול פי 2 מ AB');
    expect(res.ok, 'still builds').toBe(true);
    if (!res.ok) return;
    expect(res.commands.map((c) => c.type)).toContain('set-ratio');
  });

  it('the glued and noun-carrying comparand forms too', () => {
    for (const u of ['AD גדול פי 2 מ-AB', 'אורך AC גדול פי 2 מהקטע CO']) {
      const res = r(u);
      expect(res.ok, u).toBe(true);
      if (!res.ok) continue;
      expect(res.commands.map((c) => c.type), u).toContain('set-ratio');
    }
  });

  it('«AB = 2AD» — the equational form — is untouched', () => {
    const res = r('AB = 2AD');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.commands.map((c) => c.type)).toContain('set-ratio');
  });
});

describe('#777 — the ask does not spread', () => {
  it('a plain length is unaffected', () => {
    expect(r('AB = 5').ok, 'a stated length still builds').toBe(true);
  });

  it('a shape declaration is unaffected', () => {
    expect(r('מקבילית ABCD').ok).toBe(true);
  });

  it('an utterance with no factor at all is still not-handled — this rule owns only «פי N»', () => {
    expect(r('צלע AD גדולה')).toMatchObject({ ok: false, reason: 'not-handled' });
  });
});

describe('#777 — i18n', () => {
  it('both languages carry the ask, and it names both slots', async () => {
    const he = (await import('../../i18n/locales/he.json')).default as unknown as { input: Record<string, string> };
    const en = (await import('../../i18n/locales/en.json')).default as unknown as { input: Record<string, string> };
    for (const [lang, j] of [
      ['he', he],
      ['en', en],
    ] as const) {
      const msg = j.input.incompleteComparative;
      expect(msg, `${lang}: the ask exists`).toBeTruthy();
      expect(msg, `${lang}: names the subject`).toContain('{{subject}}');
      expect(msg, `${lang}: quotes the factor back`).toContain('{{factor}}');
    }
  });
});

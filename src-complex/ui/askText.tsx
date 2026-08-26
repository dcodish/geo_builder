/**
 * How an ask-lane question DISPLAYS (#791) — the operator's ruling for the distance form: the
 * student types `d_{z1z2}`, the row shows `d` with the run as a subscript, the way the textbook
 * prints it. Everything else renders through the bidi preview unchanged. Display only — the stored
 * text stays exactly what the student typed (the ADR-W-029 content/display line).
 */
import type { ReactNode } from 'react';
import { prettyName } from '../model/naming';
import { complexBidi } from '../i18n';

const DIST = /^d_\{([^{}]*)\}$/i;

/** Each point atom, subscripted the exam's way: `z1z2` → `z₁z₂`, `AB` stays `AB`. */
const prettyRun = (run: string): string =>
  (run.match(/[A-Za-z]\d*/g) ?? [run]).map(prettyName).join('');

export function AskText({ text }: { readonly text: string }): ReactNode {
  const m = text.trim().match(DIST);
  if (m) {
    return (
      <span dir="ltr">
        d<sub>{prettyRun(m[1])}</sub>
      </span>
    );
  }
  return <>{complexBidi.inputPreview(text) ?? text}</>;
}

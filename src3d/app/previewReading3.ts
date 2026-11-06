/**
 * #1549 (ADR-3D-425) — WILL THE COMMITTED CARD READ THIS LINE AS A VECTOR STATEMENT?
 *
 * Operator, 2026-09-29: the input preview *"should decide from the dry-run parse's command kinds through the same
 * `isVectorFact3` registry, so the preview and the committed card always agree."* «BA=(-3,4,5)» carries no mark, so the
 * text gate (`isVectorMarked3`) showed no strip while its card reads as a vector.
 *
 * It lives here because `render` must not import the parser (#1195): `App3` asks this and hands `inputPreviewNode3` the
 * answer, the way it hands `askEchoNode3` the question's own reading.
 *
 * ONE LINE CANNOT BE ANSWERED BY A PARSE: an unmarked segment equation with two readings («DC=3AB» over existing
 * points). Its card follows the verdict of trying both on the figure (ADR-3D-391 Am. 1), which is a fold per keystroke,
 * so it asserts nothing here and stays unarrowed. `segmentEquationKind3` is the apply's own test for that class, so a
 * definition or a negative multiple, which has only the vector reading, still previews as its card shows.
 *
 * Pure over `(construction, raw)`.
 */
import { ingestTypedText } from '../../shell/bidi';
import { segmentEquationKind3 } from '../engine/apply';
import type { Construction3 } from '../engine/types';
import { parse3 } from '../parser/parse3';
import { isVectorFact3 } from '../render/notation';

export function previewReadsVector3(c: Construction3, raw: string): boolean {
  const parsed = parse3(ingestTypedText(raw));
  if (!parsed.ok) return false;
  return isVectorFact3({ cmds: parsed.commands.filter((cmd) => segmentEquationKind3(c, cmd) !== 'two-readings') });
}

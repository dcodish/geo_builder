/**
 * #2890 ([ADR-830](../../docs/06-decisions.md#adr-830)) — THE MODEL'S ANSWER, JUDGED AND COMMITTED: the part of the
 * submit pipeline that runs after the model call (ADR-240's honesty battery on the second attempt, the dry run, the
 * commit), moved out of `submitPipeline.ts` so that it runs where the solving runs — the geometry worker — as one
 * operation. Its logic is the pipeline's, gate for gate and in the same order; what changed is that a refusal is
 * RETURNED as its message key (the page translates it) and that the logs are the caller's (`logDebug` is captured in
 * a worker). Every comment that explains a gate stayed with the gate.
 */
import {
  buildParseCtx,
  classifyOutOfScope,
  droppedComparison,
  droppedCompoundRelation,
  droppedConstructNoun,
  droppedGivenNumbers,
  droppedGivenRelations,
  droppedGivenVerbs,
  droppedMidsegment,
  droppedNewLabels,
  introducedNewLabels,
  droppedRadiusSymbol,
  droppedRegionSubject,
  droppedWordRelations,
  looksCompound,
  lowercaseLabelFold,
  inscribedCircles,
} from '@/parser';
import { droppedPropertyWords } from '@/parser/propertyWords';
import { mergeWordItems } from '../../shell/llm/honestyCore';
import { circleMembers, isGeoPoint, type AnyCommand } from '@/engine';
import { extensionSideVerdict } from './extensionSide';
import { dryRunOutcome, getFoldFor, primeFoldFor, replay, trialFacts, useGeoStore, type Fact } from '@/store/geoStore';
import { unaccountedSpans } from '@/parser/spanAccounting';
import { unreadItems } from './honestyGates';
import { logDebug } from '@/debug/sessionLog';
import { commitLine, type CreatedNotice2D } from './commitLine';
import type { DecideView } from './decideDeterministic';

/** The model's answer as the pipeline reads it (`llmParse`'s, minus what the judgment does not read). */
export interface ModelAnswer {
  built: { step: string; commands: AnyCommand[] }[];
  dropped: string[];
  restored?: unknown;
}

export interface JudgeInput {
  utterance: string;
  locale: 'he' | 'en';
  /** The model's answer; `null` when it understood nothing. */
  out: ModelAnswer | null;
  /** The line's own naming by use (`nameByUseCommands` of the deterministic verdict's binds). */
  bindCmds: AnyCommand[];
  /** The deterministic parse read the line but built nothing (`producedNothing`), as against out of grammar. */
  weak: boolean;
  /** The view the line was typed against: the parse context of the gates that read it. */
  view: DecideView;
}

export type JudgeOutcome =
  | { kind: 'refuse'; note: { key: string; params?: Record<string, unknown> } }
  | { kind: 'commit'; created: CreatedNotice2D | null; dropped: string[] };

/** Judge the model's answer against the store as it is now, and commit it when it holds. Logs through `logDebug`. */
export function judgeModelAnswer(input: JudgeInput): JudgeOutcome {
  const { utterance, locale, out, bindCmds, weak, view } = input;
  const store = () => useGeoStore.getState();
  const withBinds = (facts: Fact[]): Fact[] => (bindCmds.length ? trialFacts(facts, bindCmds) : facts);
  const parseCtxNow = () => buildParseCtx(view.construction, view.positions);
  const lostNewLabels = (cmds: AnyCommand[]): string[] => {
    const fig = replay(withBinds(store().facts)).construction;
    return droppedNewLabels(
      utterance,
      cmds,
      fig.objects.filter(isGeoPoint).map((o) => o.id),
      fig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])),
    );
  };
  const refuse = (key: string, params?: Record<string, unknown>): JudgeOutcome => ({ kind: 'refuse', note: { key, ...(params ? { params } : {}) } });

  const cur = store();
  const curFacts = withBinds(cur.facts);
  const llmCmds = out ? out.built.flatMap((g) => g.commands) : [];
  // #41 (ADR-290): the decomposition's content is folded before its dry run (in this heap: the fold is primed as the
  // page used to prime the worker's, so the fold memo's budget-visible order is what it was).
  if (out !== null && out.built.length > 0) {
    const trial = trialFacts(curFacts, llmCmds);
    replay(trial, cur.seed);
    const fold = getFoldFor(trial);
    if (fold) primeFoldFor(trial, fold);
  }
  const llmBuilds = out !== null && out.built.length > 0 && dryRunOutcome(curFacts, llmCmds, cur.seed).produced;
  if (!llmBuilds) {
    const scope = classifyOutOfScope(utterance);
    if (scope) {
      logDebug({ kind: 'input', utterance, locale, source: 'scope', result: `scope:${scope.category}` });
      return refuse(scope.messageKey);
    }
    if (looksCompound(utterance)) {
      logDebug({ kind: 'input', utterance, locale, source: 'llm', result: 'not-understood-compound' });
      return refuse('input.tooManyParts');
    }
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: out && out.built.length ? 'built-nothing' : 'not-understood' });
    return refuse(weak ? 'input.producedNothing' : 'suite.refusal.notUnderstood');
  }
  // #779 — the convention nudge holds on the LLM path too (the ADR-240 pattern)
  {
    const fold = lowercaseLabelFold(utterance, llmCmds, parseCtxNow().points ?? []); // #2195
    if (fold) {
      logDebug({ kind: 'input', utterance, locale, source: 'scope', result: 'scope:lowercase-labels', commands: llmCmds });
      return refuse('input.scope.lowercase-labels', { corrected: fold.corrected });
    }
  }
  // HONESTY GATE on the LLM path (ADR-240)
  const llmFig = replay(curFacts).construction;
  const lostVerbs = droppedGivenVerbs(utterance, llmCmds);
  // #1906 (ADR-722 / ADR-W-144): every shape and role word the student typed must survive into the answer
  const lostWords = droppedPropertyWords(
    utterance,
    llmCmds,
    {
      points: llmFig.objects.filter(isGeoPoint).map((o) => o.id),
      polygons: llmFig.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])),
      circles: llmFig.objects.flatMap((o) => (o.kind === 'circle' ? [o.id] : [])),
      circleMembers: circleMembers(llmFig),
      inscribedCircles: inscribedCircles(llmFig),
    },
    { skip: lostVerbs.includes('חוצה/bisect') ? ['angle-bisector', 'bisect'] : [] },
  );
  const stillDropped: string[] = mergeWordItems(
    unreadItems(
      lostNewLabels(llmCmds),
      droppedGivenNumbers(utterance, llmCmds),
      droppedGivenRelations(utterance, llmCmds),
      lostVerbs,
      droppedWordRelations(utterance, llmCmds),
      droppedCompoundRelation(utterance, llmCmds),
      droppedComparison(utterance, llmCmds) ? ['<>'] : [],
      droppedRadiusSymbol(utterance, llmCmds),
      droppedRegionSubject(utterance, llmCmds) ? ['בתוך/מחוץ'] : [],
      droppedMidsegment(utterance, llmCmds) ? ['קטע אמצעים'] : [],
      droppedConstructNoun(utterance, llmCmds),
      unaccountedSpans(utterance, llmCmds, {
        existingPoints: llmFig.objects.filter(isGeoPoint).map((o) => o.id),
        radiusSymbols: llmFig.objects.flatMap((o) => (o.kind === 'circle' && o.radiusSymbol ? [o.radiusSymbol] : [])),
        circleMembers: circleMembers(llmFig),
        polygons: llmFig.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])),
      }).map((x) => x.text),
    ),
    lostWords,
  );
  if (stillDropped.length > 0) {
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: `dropped-labels:${stillDropped.join(',')}`, commands: llmCmds });
    return refuse('input.labelsDropped', { labels: stillDropped.join(', ') });
  }
  // The MIRROR gate (#255, #2228 / ADR-695): what the decomposition ADDED
  const invented = introducedNewLabels(
    utterance,
    out!.built.map((g) => g.step),
    llmFig.objects.filter(isGeoPoint).map((o) => o.id),
    {
      polygons: llmFig.objects.flatMap((o) => (o.kind === 'polygon' ? [o.vertices] : [])),
      circleMembers: circleMembers(llmFig),
      segments: llmFig.objects.flatMap((o) => (o.kind === 'segment' ? [[o.a, o.b]] : [])),
    },
  );
  if (invented.length > 0) {
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: `invented-labels:${invented.join(',')}`, commands: llmCmds });
    return refuse('input.labelsInvented', { labels: invented.join(', ') });
  }
  // #2518 (ADR-784): the impossible-side refusal holds on this lane too
  const wrongSide = extensionSideVerdict(utterance, out!.built.map((g) => g.step).join(' '), llmCmds, parseCtxNow(), curFacts, cur.seed);
  if (wrongSide) {
    logDebug({ kind: 'input', utterance, locale, source: 'llm', result: wrongSide.result, commands: llmCmds });
    return refuse(wrongSide.messageKey, wrongSide.params as Record<string, unknown> | undefined);
  }
  // ONE step row labelled by the student's original utterance; one batch, one undo entry (E4)
  const created = commitLine([...bindCmds, ...llmCmds], llmCmds, utterance);
  logDebug({ kind: 'input', utterance, locale, source: 'llm', built: out!.built.map((g) => g.step), dropped: out!.dropped, commands: llmCmds, ...(out!.restored ? { restored: out!.restored } : {}) });
  return { kind: 'commit', created, dropped: out!.dropped };
}

/** Public surface of the grammar parser (Phase 4). The `utterance → command[]` boundary. */

export { parse, parseRename, parseMerge, parseSwap, parseNameCenter, impliedCircleBinding, impliedPointBinding, droppedNewLabels, droppedGivenNumbers, statedNumberOccurrences, droppedGivenRelations, droppedWordRelations, droppedCompoundRelation, droppedGivenVerbs,
  droppedComparison, droppedRadiusSymbol, introducedNewLabels, droppedRegionSubject, droppedMidsegment, droppedConstructNoun, normalizeUtterance,
  statedLabelTokens, typedLabels, circleWithOtherCentre, doubleCentreNaming, lowercaseLabelFold, latinProseLabels, liftTeachable, definedLabels, lowercaseMeasureLetters, latinAngleLetters, upperCasedLabelCandidate, hebrewLabelCandidate, VERB_GATES, augmentParseCtx, cevianPairReadings } from './parse';
export type { ParseResult, ParseContext, CevianPairSegment } from './parse';
export { buildParseCtx } from './context';
export { incidenceList } from './incidenceList';
export { CLAUSE_CONNECTIVES, CLAUSE_RELATIVES, classifyOutOfScope, foreignGiven, rightAngledAtVertex, looksCompound, looksLikeLatex, splitGuidance, statedNegation, wordRootMagnitude, SHAPE_NOUNS_HE, SHAPE_NOUNS_EN } from './scope';
export type { ScopeCategory, ScopeMatch, RightAngledAtVertex } from './scope';
export { COMMAND_CATALOG, CATEGORY_ORDER, CATEGORY_LABELS } from './catalog';
export type { CommandDoc, Category } from './catalog';
export { canonicalText, teachCanonical, stepLabel } from './canonical';
export { parseValueQuery } from './valueQuery';
export { fractionTeachCandidate } from './fractionTeach';
export type { FractionTeachCandidate } from './fractionTeach';

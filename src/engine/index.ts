/** Public surface of the constructive engine. */

export * from './types';
export * from './geometry';
export * from './solve';
export { applyCommand } from './apply';
export { evaluate, resolveLine, resolveCircle, otherCrossing, bySide, drivenConstraintsOf } from './evaluate';
export type { EvalResult, EvalOk, EvalErr, ResolvedLine, ResolvedCircle } from './evaluate';
export {
  applyStep,
  applyCoupledStep,
  build,
  branchCount,
  circleMembers,
  pointNeighbors,
  parallelEdgePairs,
  commandConflict,
  cyclableBranch,
  cycleAlternative,
  firstCyclableBranch,
  deepEqual,
  maxDelta,
  emptyConstruction,
} from './step';
export type { StepResult, StepOk, StepErr } from './step';
export { applySeed, freeDofs, freeDofCount, reflectableFreePoints, directionHelperFreePoints, reflectAnchors, reflectMaskOf, baseSeedOf, withReflectMask, REFLECT_MAX, REFLECT_STRIDE } from './sample';
export { checkGivens } from './verify';
export { solveBudget, budgetExceeded, withSolveBudget } from './solveBudget';
export type { GivenViolation } from './verify';
export { detectRelations, detectRelationsAcross, figureEdges, convergedSamples, requirementSamples, distinctSamples, isScaffoldId } from './relations';
export type { RelationsResult, SegmentRef, AngleRef, DefiniteAngle, DefiniteLength, DetectOptions } from './relations';
export { findInkCrossings, crossingCommands, crossingCounts, drawnCircles, drawnPointIds, resolveDrawnLines } from './inkCrossings';
export type { Crossing, CrossingRef, ResolvedLineRef, DrawnCircleRef, TrimmedLineRef } from './inkCrossings';
export { detectShapes, detectShapesAcross, classifyShapesFromSamples } from './detectShapes';
export type { ShapeType, DetectedShape, SimilarClass, ShapesResult, ShapeDetectOptions } from './detectShapes';
export { carrierOf, isShapeCarrier, isParamCarrier } from './carriers';
export type { Carrier, CarrierFamily } from './carriers';
export { lower, lowerOne, buildSymTab, measureLabelText, isMeasure } from './lower';
export type { SymTab } from './lower';
export { expandShapeVariant, eqMatchesPair, pinsSoftVariant, VARIANT_COUNT } from './shapeVariants';
export type { VariantShape } from './shapeVariants';
export { expandInscribe, inscribePlacements, inscribeVariantCount } from './inscribe';
export type { InscribeShape, InscribeCmd } from './inscribe';
export { variantCountOf, cyclableVariant, withVariant, variantVertices } from './variants';

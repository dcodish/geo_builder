/** Public surface of the constructive engine. */

export * from './types';
export * from './geometry';
export * from './solve';
export { applyCommand } from './apply';
export { evaluate, resolveLine, resolveCircle, otherCrossing, bySide } from './evaluate';
export type { EvalResult, EvalOk, EvalErr, ResolvedLine, ResolvedCircle } from './evaluate';
export {
  applyStep,
  build,
  branchCount,
  circleMembers,
  pointNeighbors,
  commandConflict,
  cyclableBranch,
  cycleAlternative,
  firstCyclableBranch,
  deepEqual,
  maxDelta,
  emptyConstruction,
} from './step';
export type { StepResult, StepOk, StepErr } from './step';
export { applySeed, freeDofs, freeDofCount } from './sample';
export { checkGivens } from './verify';
export type { GivenViolation } from './verify';
export { detectRelations, detectRelationsAcross, figureEdges } from './relations';
export type { RelationsResult, SegmentRef, AngleRef, DefiniteAngle, DetectOptions } from './relations';
export { detectShapes, detectShapesAcross } from './detectShapes';
export type { ShapeType, DetectedShape, ShapesResult, ShapeDetectOptions } from './detectShapes';
export { carrierOf, isShapeCarrier, isParamCarrier } from './carriers';
export type { Carrier, CarrierFamily } from './carriers';
export { lower, lowerOne, buildSymTab, measureLabelText, isMeasure } from './lower';
export type { SymTab } from './lower';
export { expandShapeVariant, eqMatchesPair, VARIANT_COUNT } from './shapeVariants';
export type { VariantShape } from './shapeVariants';

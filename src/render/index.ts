/** Public surface of the SVG renderer (Phase 2). Swappable layer over the engine. */

export { Figure } from './Figure';
export type { FigureProps } from './Figure';
export { buildScene, scenePositions } from './scene';
export type { Scene, ScenePoint, SceneSegment, ScenePolygon } from './scene';
export { boundsOf, fitTransform } from './transform';
export type { Box, Viewport, Transform } from './transform';

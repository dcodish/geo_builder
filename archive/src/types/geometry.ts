// Core data model for Geo Builder

export interface Point2D {
  x: number;
  y: number;
}

export type PointId = string; // e.g., "A", "B", "C"
export type ElementId = string;

// --- Core geometric elements ---

export interface GeoPoint {
  kind: 'point';
  id: PointId;
  label: string;
  position: Point2D;
  isFree: boolean;
}

export interface GeoSegment {
  kind: 'segment';
  id: ElementId;
  endpoints: [PointId, PointId];
  label?: string;
}

export interface GeoLine {
  kind: 'line';
  id: ElementId;
  through: [PointId, PointId];
  role?: 'height' | 'median' | 'bisector' | 'perpendicular-bisector' | 'midsegment' | 'side';
}

export interface GeoCircle {
  kind: 'circle';
  id: ElementId;
  center: PointId;
  radius: number;
}

export interface GeoAngle {
  kind: 'angle';
  id: ElementId;
  vertex: PointId;
  ray1Point: PointId;
  ray2Point: PointId;
  measure?: number; // degrees
}

export interface GeoPolygon {
  kind: 'polygon';
  id: ElementId;
  vertices: PointId[];
  polygonType?: 'triangle' | 'quadrilateral' | 'general';
  flipped?: boolean;
}

export type GeoElement = GeoPoint | GeoSegment | GeoLine | GeoCircle | GeoAngle | GeoPolygon;

// --- Constraints ---

export type Constraint =
  | { type: 'distance'; points: [PointId, PointId]; value: number }
  | { type: 'angle-measure'; vertex: PointId; ray1: PointId; ray2: PointId; value: number }
  | { type: 'equal-segments'; seg1: [PointId, PointId]; seg2: [PointId, PointId] }
  | { type: 'parallel'; line1: [PointId, PointId]; line2: [PointId, PointId] }
  | { type: 'perpendicular'; line1: [PointId, PointId]; line2: [PointId, PointId] }
  | { type: 'right-angle'; vertex: PointId }
  | { type: 'midpoint'; point: PointId; of: [PointId, PointId] };

// --- Computed / derived properties ---

export type TriangleSubtype =
  | 'right' | 'isosceles' | 'equilateral' | 'scalene'
  | 'acute' | 'obtuse';

export type QuadrilateralSubtype =
  | 'parallelogram' | 'rectangle' | 'rhombus' | 'square'
  | 'trapezoid' | 'isosceles-trapezoid' | 'kite' | 'general';

export interface PolygonClassification {
  base: 'triangle' | 'quadrilateral';
  subtypes: string[];
}

export interface ComputedProperties {
  distances: Map<string, number>;         // "A-B" -> 5
  angleMeasures: Map<string, number>;     // "B-A-C" (vertex first) -> degrees
  polygonClassifications: Map<ElementId, PolygonClassification>;
  parallelPairs: [string, string][];      // pairs of segment keys
  perpendicularPairs: [string, string][];
}

// --- Construction state ---

export interface Construction {
  elements: GeoElement[];
  constraints: Constraint[];
  computed: ComputedProperties;
  steps: ConstructionStep[];
}

export interface ConstructionStep {
  id: string;
  naturalLanguageInput: string;
  commands: GeometryCommand[];
  timestamp: number;
  isError?: boolean;
}

// --- Commands produced by LLM parsing ---

export type GeometryCommand =
  | { action: 'create-polygon'; vertices: string[]; polygonType: 'triangle' | 'quadrilateral' | 'general' }
  | { action: 'set-distance'; point1: string; point2: string; value: number }
  | { action: 'set-angle'; vertex: string; ray1?: string; ray2?: string; value: number }
  | { action: 'set-equal-segments'; seg1: [string, string]; seg2: [string, string] }
  | { action: 'set-parallel'; line1: [string, string]; line2: [string, string] }
  | { action: 'set-perpendicular'; line1: [string, string]; line2: [string, string] }
  | { action: 'set-right-angle'; vertex: string }
  | { action: 'add-special-line'; lineType: 'height' | 'median' | 'bisector' | 'perpendicular-bisector' | 'midsegment'; fromVertex?: string; toSide?: [string, string] }
  | { action: 'flip-polygon'; vertices: string[] }
  | { action: 'clarification'; messageEn: string; messageHe?: string };

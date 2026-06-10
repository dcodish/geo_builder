import type { Point2D } from '@/types/geometry';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function toRad(deg: number): number {
  return deg * DEG2RAD;
}

export function toDeg(rad: number): number {
  return rad * RAD2DEG;
}

export function distance(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function angleBetween(a: Point2D, vertex: Point2D, b: Point2D): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x;
  const v2y = b.y - vertex.y;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  const angle = Math.atan2(Math.abs(cross), dot);
  return toDeg(angle);
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Key for a pair of points, order-independent */
export function segmentKey(a: string, b: string): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Key for an angle at vertex between ray1 and ray2 */
export function angleKey(vertex: string, ray1: string, ray2: string): string {
  const sorted = ray1 < ray2 ? [ray1, ray2] : [ray2, ray1];
  return `${sorted[0]}-${vertex}-${sorted[1]}`;
}

const EPSILON = 1e-9;
export function approxEqual(a: number, b: number, eps = EPSILON): boolean {
  return Math.abs(a - b) < eps;
}

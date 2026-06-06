/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'jsxgraph' {
  export namespace JXG {
    function JSXGraph(): void;
    namespace JSXGraph {
      function initBoard(id: string, options: any): Board;
      function freeBoard(board: Board): void;
    }

    interface Board {
      create(type: string, parents: any[], attributes?: any): GeometryElement;
      removeObject(obj: GeometryElement | string): void;
      update(): void;
      setBoundingBox(bbox: [number, number, number, number], keepAspectRatio?: boolean): void;
      on(event: string, handler: (...args: any[]) => void): void;
      off(event: string, handler?: (...args: any[]) => void): void;
      objects: Record<string, GeometryElement>;
      containerObj: HTMLElement;
      zoomIn(x?: number, y?: number): void;
      zoomOut(x?: number, y?: number): void;
      zoom100(): void;
    }

    interface GeometryElement {
      id: string;
      name: string;
      setAttribute(attrs: any): void;
      moveTo(coords: [number, number], time?: number): void;
      X(): number;
      Y(): number;
      remove(): void;
    }

    type Point = GeometryElement;
    type Line = GeometryElement;
    type Segment = GeometryElement;
    type Circle = GeometryElement;
    type Polygon = GeometryElement;
    type Angle = GeometryElement;
  }

  export default JXG;
}

declare global {
  const JXG: typeof import('jsxgraph').JXG;
}

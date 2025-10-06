import type { Vector2 } from "./types";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const lerpVector = (from: Vector2, to: Vector2, t: number): Vector2 => ({
  x: lerp(from.x, to.x, t),
  y: lerp(from.y, to.y, t),
});

export const cloneVector = (vector: Vector2): Vector2 => ({ x: vector.x, y: vector.y });

export const resolveVector = (base: Vector2, update?: Partial<Vector2> | Vector2): Vector2 => ({
  x: update?.x ?? base.x,
  y: update?.y ?? base.y,
});

export const nearlyEqual = (a: number, b: number, epsilon = 1e-5) => Math.abs(a - b) <= epsilon;

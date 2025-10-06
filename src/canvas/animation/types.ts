import type { EasingFunction } from "./easing";

export type AnimationState = "idle" | "running" | "completed" | "interrupted";

export interface Vector2 {
  x: number;
  y: number;
}

export interface TransformLike {
  position: Vector2;
  rotation: number;
  scale: number;
  opacity: number;
  [key: string]: unknown;
}

export type TransformUpdate = {
  position?: Partial<Vector2> | Vector2;
  rotation?: number;
  scale?: number;
  opacity?: number;
};

export interface AnimationLifecycleCallbacks<TTarget = TransformLike> {
  onStart?: (target: TTarget) => void;
  onUpdate?: (target: TTarget, progress: number) => void;
  onComplete?: (target: TTarget) => void;
  onInterrupt?: (target: TTarget) => void;
}

export interface TweenConfig<TTarget extends TransformLike = TransformLike>
  extends AnimationLifecycleCallbacks<TTarget> {
  to: TransformUpdate;
  from?: TransformUpdate;
  duration: number;
  delay?: number;
  easing?: EasingFunction;
}

export interface DelayConfig {
  duration: number;
}

export interface AnimationClip {
  readonly state: AnimationState;
  readonly progress: number;
  update(deltaTime: number): AnimationState;
  reset(): void;
  interrupt(): void;
  isFinished(): boolean;
}

export type AnimationClipFactory = () => AnimationClip;

export type AnimationId = string;

import { linear, type EasingFunction } from "./easing";
import { clamp, cloneVector, lerp, lerpVector, resolveVector } from "./math";
import type {
  AnimationClip,
  AnimationState,
  TransformLike,
  TransformUpdate,
  TweenConfig,
  Vector2,
} from "./types";

interface Snapshot {
  position: Vector2;
  rotation: number;
  scale: number;
  opacity: number;
}

export class Tween<TTarget extends TransformLike = TransformLike> implements AnimationClip {
  private readonly target: TTarget;
  private readonly easing: EasingFunction;
  private readonly duration: number;
  private readonly delay: number;
  private readonly callbacks: TweenConfig<TTarget>;

  private readonly initial: Snapshot;
  private readonly fromState: Snapshot;
  private readonly toState: Snapshot;

  private elapsed = 0;
  private _progress = 0;
  private _state: AnimationState = "idle";
  private started = false;
  private completed = false;

  constructor(target: TTarget, config: TweenConfig<TTarget>) {
    this.target = target;
    this.callbacks = { ...config };
    this.duration = Math.max(config.duration, 0);
    this.delay = Math.max(config.delay ?? 0, 0);
    this.easing = config.easing ?? linear;

    this.initial = Tween.captureSnapshot(target);
    this.fromState = this.resolveSnapshot(this.initial, config.from);
    this.toState = this.resolveSnapshot(this.fromState, config.to);
  }

  public static captureSnapshot(target: TransformLike): Snapshot {
    return {
      position: cloneVector(target.position),
      rotation: target.rotation,
      scale: target.scale,
      opacity: target.opacity,
    };
  }

  private resolveSnapshot(base: Snapshot, update?: TransformUpdate): Snapshot {
    return {
      position: resolveVector(base.position, update?.position ?? undefined),
      rotation: update?.rotation ?? base.rotation,
      scale: update?.scale ?? base.scale,
      opacity: update?.opacity ?? base.opacity,
    };
  }

  private applySnapshot(snapshot: Snapshot) {
    const target = this.target;
    target.position.x = snapshot.position.x;
    target.position.y = snapshot.position.y;
    target.rotation = snapshot.rotation;
    target.scale = snapshot.scale;
    target.opacity = snapshot.opacity;
  }

  private applyInterpolated(progress: number) {
    const eased = clamp(progress, 0, 1);
    const easedValue = this.easing(eased);
    const position = lerpVector(this.fromState.position, this.toState.position, easedValue);
    this.target.position.x = position.x;
    this.target.position.y = position.y;
    this.target.rotation = lerp(this.fromState.rotation, this.toState.rotation, easedValue);
    this.target.scale = lerp(this.fromState.scale, this.toState.scale, easedValue);
    this.target.opacity = lerp(this.fromState.opacity, this.toState.opacity, easedValue);
    this.callbacks.onUpdate?.(this.target, easedValue);
  }

  get state(): AnimationState {
    return this._state;
  }

  get progress(): number {
    return this._progress;
  }

  public update(deltaTime: number): AnimationState {
    if (this.completed) {
      return this._state;
    }

    if (this._state === "idle") {
      this._state = "running";
      this.applySnapshot(this.fromState);
      this.callbacks.onStart?.(this.target);
      this.started = this.delay <= 0;
    }

    this.elapsed += Math.max(deltaTime, 0);

    if (!this.started) {
      if (this.elapsed >= this.delay) {
        this.started = true;
      } else {
        this._progress = 0;
        return this._state;
      }
    }

    const effectiveTime = this.elapsed - this.delay;

    if (this.duration === 0) {
      this.applySnapshot(this.toState);
      this._progress = 1;
      this._state = "completed";
      this.completed = true;
      this.callbacks.onUpdate?.(this.target, 1);
      this.callbacks.onComplete?.(this.target);
      return this._state;
    }

    this._progress = clamp(effectiveTime / this.duration, 0, 1);
    this.applyInterpolated(this._progress);

    if (this._progress >= 1) {
      this.applySnapshot(this.toState);
      this._state = "completed";
      this.completed = true;
      this.callbacks.onComplete?.(this.target);
    }

    return this._state;
  }

  public reset() {
    this.elapsed = 0;
    this._progress = 0;
    this._state = "idle";
    this.started = false;
    this.completed = false;
    this.applySnapshot(this.initial);
  }

  public interrupt() {
    if (this.completed || this._state === "interrupted") {
      return;
    }
    this._state = "interrupted";
    this.completed = true;
    this.callbacks.onInterrupt?.(this.target);
  }

  public isFinished() {
    return this.completed;
  }
}

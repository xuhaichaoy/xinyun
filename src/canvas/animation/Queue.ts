import { clamp } from "./math";
import { Delay } from "./Delay";
import { Parallel, Sequence } from "./Composite";
import { Tween } from "./Tween";
import type {
  AnimationClip,
  AnimationState,
  TransformLike,
  TweenConfig,
} from "./types";

export class AnimationQueue<TTarget extends TransformLike = TransformLike> {
  private readonly target: TTarget;
  private readonly clips: AnimationClip[] = [];
  private index = 0;
  private _state: AnimationState = "idle";
  private _progress = 0;
  private scheduleListener: (() => void) | null = null;

  constructor(target: TTarget) {
    this.target = target;
  }

  public setScheduleListener(listener: (() => void) | null) {
    this.scheduleListener = listener;
  }

  public getTarget(): TTarget {
    return this.target;
  }

  get state(): AnimationState {
    if (this.index < this.clips.length && this._state === "completed") {
      return "running";
    }
    return this._state;
  }

  get progress(): number {
    return this._progress;
  }

  get size(): number {
    return this.clips.length;
  }

  public tween(config: TweenConfig<TTarget>) {
    return this.enqueue(new Tween(this.target, config));
  }

  public tweenParallel(configs: TweenConfig<TTarget>[]) {
    const tweens = configs.map((cfg) => new Tween(this.target, cfg));
    return this.enqueue(new Parallel(tweens));
  }

  public wait(duration: number) {
    return this.enqueue(new Delay(duration));
  }

  public enqueue(clip: AnimationClip) {
    this.clips.push(clip);
    this.scheduleListener?.();
    return this;
  }

  public enqueueSequence(clips: AnimationClip[]) {
    return this.enqueue(new Sequence(clips));
  }

  public enqueueParallel(clips: AnimationClip[]) {
    return this.enqueue(new Parallel(clips));
  }

  public clear() {
    this.clips.length = 0;
    this.index = 0;
    this._state = "idle";
    this._progress = 0;
    this.scheduleListener?.();
  }

  public update(deltaTime: number): AnimationState {
    if (this.clips.length === 0) {
      this._state = "completed";
      this._progress = 1;
      return this._state;
    }

    if (this.index >= this.clips.length) {
      this._state = "completed";
      this._progress = 1;
      return this._state;
    }

    if (this._state === "idle" || this._state === "completed") {
      this._state = "running";
    }

    let remainingDelta = Math.max(deltaTime, 0);

    while (this.index < this.clips.length) {
      const current = this.clips[this.index];
      const state = current.update(remainingDelta);
      remainingDelta = 0;

      if (state === "completed") {
        this.index += 1;
        continue;
      }

      if (state === "interrupted") {
        this._state = "interrupted";
      }

      break;
    }

    if (this.index >= this.clips.length) {
      this._state = "completed";
      this._progress = 1;
    } else {
      this._progress = this.computeProgress();
    }

    return this._state;
  }

  public reset() {
    this.clips.forEach((clip) => clip.reset());
    this.index = 0;
    this._state = this.clips.length === 0 ? "completed" : "idle";
    this._progress = this._state === "completed" ? 1 : 0;
  }

  public interrupt() {
    if (this._state === "completed" || this._state === "interrupted") {
      return;
    }
    const current = this.clips[this.index];
    current?.interrupt();
    this._state = "interrupted";
  }

  public isFinished() {
    return this._state === "completed";
  }

  private computeProgress() {
    if (this.clips.length === 0) {
      return 1;
    }
    const completedCount = Math.min(this.index, this.clips.length);
    const current = this.clips[Math.min(this.index, this.clips.length - 1)];
    const currentProgress = current ? current.progress : 0;
    return clamp((completedCount + currentProgress) / this.clips.length, 0, 1);
  }
}

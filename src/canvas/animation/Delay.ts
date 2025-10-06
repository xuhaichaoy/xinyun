import { clamp } from "./math";
import type { AnimationClip, AnimationState } from "./types";

export class Delay implements AnimationClip {
  private readonly duration: number;
  private elapsed = 0;
  private _progress = 0;
  private _state: AnimationState = "idle";

  constructor(duration: number) {
    this.duration = Math.max(duration, 0);
  }

  get state(): AnimationState {
    return this._state;
  }

  get progress(): number {
    return this._progress;
  }

  update(deltaTime: number): AnimationState {
    if (this._state === "completed" || this._state === "interrupted") {
      return this._state;
    }

    if (this._state === "idle") {
      this._state = "running";
    }

    this.elapsed += Math.max(deltaTime, 0);

    if (this.duration === 0) {
      this._progress = 1;
      this._state = "completed";
      return this._state;
    }

    this._progress = clamp(this.elapsed / this.duration, 0, 1);

    if (this.elapsed >= this.duration) {
      this._state = "completed";
    }

    return this._state;
  }

  reset() {
    this.elapsed = 0;
    this._progress = 0;
    this._state = "idle";
  }

  interrupt() {
    if (this._state === "completed" || this._state === "interrupted") {
      return;
    }
    this._state = "interrupted";
  }

  isFinished() {
    return this._state === "completed";
  }
}

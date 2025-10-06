import { clamp } from "./math";
import type { AnimationClip, AnimationState } from "./types";

export class Sequence implements AnimationClip {
  private readonly clips: AnimationClip[];
  private index = 0;
  private _state: AnimationState = "idle";
  private _progress = 0;

  constructor(clips: AnimationClip[]) {
    this.clips = clips;
    if (clips.length === 0) {
      this._state = "completed";
      this._progress = 1;
    }
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

  reset() {
    this.clips.forEach((clip) => clip.reset());
    this.index = 0;
    this._state = this.clips.length === 0 ? "completed" : "idle";
    this._progress = this._state === "completed" ? 1 : 0;
  }

  interrupt() {
    if (this._state === "completed" || this._state === "interrupted") {
      return;
    }
    const current = this.clips[this.index];
    current?.interrupt();
    this._state = "interrupted";
  }

  isFinished() {
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

export class Parallel implements AnimationClip {
  private readonly clips: AnimationClip[];
  private _state: AnimationState = "idle";
  private _progress = 0;

  constructor(clips: AnimationClip[]) {
    this.clips = clips;
    if (clips.length === 0) {
      this._state = "completed";
      this._progress = 1;
    }
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

    let allCompleted = true;
    let anyInterrupted = false;

    for (const clip of this.clips) {
      if (clip.state === "completed") {
        continue;
      }

      if (clip.state === "interrupted") {
        anyInterrupted = true;
        continue;
      }

      const state = clip.update(deltaTime);

      if (state === "interrupted") {
        anyInterrupted = true;
      } else if (state !== "completed") {
        allCompleted = false;
      }
    }

    this._progress = this.computeProgress();

    if (anyInterrupted) {
      this._state = "interrupted";
    } else if (allCompleted) {
      this._state = "completed";
    }

    return this._state;
  }

  reset() {
    this.clips.forEach((clip) => clip.reset());
    this._state = this.clips.length === 0 ? "completed" : "idle";
    this._progress = this._state === "completed" ? 1 : 0;
  }

  interrupt() {
    if (this._state === "completed" || this._state === "interrupted") {
      return;
    }
    this.clips.forEach((clip) => clip.interrupt());
    this._state = "interrupted";
  }

  isFinished() {
    return this._state === "completed";
  }

  private computeProgress() {
    if (this.clips.length === 0) {
      return 1;
    }
    const sum = this.clips.reduce((acc, clip) => acc + clip.progress, 0);
    return clamp(sum / this.clips.length, 0, 1);
  }
}

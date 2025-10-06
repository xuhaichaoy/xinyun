import { AnimationQueue } from "./Queue";
import type { AnimationClip, AnimationId, AnimationState, TransformLike, TweenConfig } from "./types";

export interface QueueOptions {
  id?: AnimationId;
  autoRemove?: boolean;
  resolveOnInterrupt?: boolean;
  onComplete?: () => void;
  onInterrupt?: (reason?: unknown) => void;
}

type QueueStatus = "pending" | "completed" | "interrupted";

interface NormalizedQueueOptions {
  autoRemove: boolean;
  resolveOnInterrupt: boolean;
  onComplete?: () => void;
  onInterrupt?: (reason?: unknown) => void;
}

interface ManagedQueue<TTarget extends TransformLike> {
  id: AnimationId;
  queue: AnimationQueue<TTarget>;
  options: NormalizedQueueOptions;
  status: QueueStatus;
  finished: Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

const DEFAULT_OPTIONS: NormalizedQueueOptions = {
  autoRemove: true,
  resolveOnInterrupt: false,
};

const defaultInterruptReason = () => new Error("Animation interrupted");

export class AnimationSystem {
  private readonly queues = new Map<AnimationId, ManagedQueue<any>>();
  private idCounter = 0;

  public update(deltaTime: number) {
    const completed: ManagedQueue<any>[] = [];
    const interrupted: Array<{ entry: ManagedQueue<any>; reason: unknown }> = [];

    for (const entry of this.queues.values()) {
      const state = entry.queue.update(deltaTime);
      if (state === "completed" && entry.status !== "completed") {
        completed.push(entry);
      } else if (state === "interrupted" && entry.status !== "interrupted") {
        interrupted.push({ entry, reason: defaultInterruptReason() });
      }
    }

    completed.forEach((entry) => this.handleCompletion(entry));
    interrupted.forEach(({ entry, reason }) => this.handleInterruption(entry, reason));
  }

  public createQueue<TTarget extends TransformLike>(
    target: TTarget,
    options: QueueOptions = {}
  ): AnimationQueueHandle<TTarget> {
    const { id: providedId, ...rest } = options;
    const id = providedId ?? this.generateId();
    const normalized = this.normalizeOptions(rest);

    const queue = new AnimationQueue<TTarget>(target);
    const entry = this.createManagedQueue(id, queue, normalized);

    queue.setScheduleListener(() => {
      if (entry.status !== "pending") {
        this.prepareForReuse(entry, true);
      }
    });

    this.queues.set(id, entry as ManagedQueue<any>);
    return new AnimationQueueHandle(this, entry);
  }

  public play<TTarget extends TransformLike>(
    target: TTarget,
    builder: (timeline: AnimationQueueHandle<TTarget>) => void,
    options: QueueOptions = {}
  ) {
    const handle = this.createQueue(target, options);
    builder(handle);
    return handle;
  }

  public interrupt(id: AnimationId, reason: unknown = defaultInterruptReason()) {
    const entry = this.queues.get(id);
    if (!entry || entry.status === "interrupted") return;
    entry.queue.interrupt();
    this.handleInterruption(entry, reason);
  }

  public reset(id: AnimationId) {
    const entry = this.queues.get(id);
    if (!entry) return;
    if (entry.status === "pending") {
      entry.reject(new Error("Animation reset"));
    }
    entry.queue.reset();
    this.prepareForReuse(entry, true);
  }

  public destroy(id: AnimationId) {
    const entry = this.queues.get(id);
    if (!entry) return;
    if (entry.status === "pending") {
      entry.reject(new Error("Animation destroyed"));
    }
    entry.queue.clear();
    this.queues.delete(id);
  }

  public clear() {
    const entries = Array.from(this.queues.values());
    entries.forEach((entry) => {
      if (entry.status === "pending") {
        entry.reject(new Error("Animation system cleared"));
      }
      entry.queue.clear();
    });
    this.queues.clear();
  }

  public hasActiveAnimations() {
    for (const entry of this.queues.values()) {
      if (entry.queue.state === "running") {
        return true;
      }
    }
    return false;
  }

  public getQueue<TTarget extends TransformLike>(id: AnimationId) {
    const entry = this.queues.get(id) as ManagedQueue<TTarget> | undefined;
    return entry?.queue ?? null;
  }

  private createManagedQueue<TTarget extends TransformLike>(
    id: AnimationId,
    queue: AnimationQueue<TTarget>,
    options: NormalizedQueueOptions
  ): ManagedQueue<TTarget> {
    const entry: ManagedQueue<TTarget> = {
      id,
      queue,
      options,
      status: "pending",
      finished: Promise.resolve(),
      resolve: () => {},
      reject: () => {},
    };
    this.prepareForReuse(entry, true);
    return entry;
  }

  private normalizeOptions(options: Omit<QueueOptions, "id"> = {}): NormalizedQueueOptions {
    return {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  private prepareForReuse(entry: ManagedQueue<any>, resetStatus: boolean) {
    if (resetStatus) {
      entry.status = "pending";
    }
    entry.finished = new Promise<void>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
  }

  private handleCompletion(entry: ManagedQueue<any>) {
    if (entry.status === "completed") return;
    entry.status = "completed";
    entry.options.onComplete?.();
    entry.resolve();
    if (entry.options.autoRemove) {
      this.queues.delete(entry.id);
    }
  }

  private handleInterruption(entry: ManagedQueue<any>, reason: unknown) {
    if (entry.status === "interrupted") return;
    entry.status = "interrupted";
    entry.options.onInterrupt?.(reason);
    if (entry.options.resolveOnInterrupt) {
      entry.resolve();
    } else {
      entry.reject(reason ?? defaultInterruptReason());
    }
    if (entry.options.autoRemove) {
      this.queues.delete(entry.id);
    }
  }

  private generateId(): AnimationId {
    this.idCounter += 1;
    return `anim-${this.idCounter}`;
  }
}

export class AnimationQueueHandle<TTarget extends TransformLike> {
  constructor(
    private readonly system: AnimationSystem,
    private readonly entry: ManagedQueue<TTarget>
  ) {}

  get id() {
    return this.entry.id;
  }

  get state(): AnimationState {
    return this.entry.queue.state;
  }

  get progress() {
    return this.entry.queue.progress;
  }

  get target(): TTarget {
    return this.entry.queue.getTarget();
  }

  get finished(): Promise<void> {
    return this.entry.finished;
  }

  public tween(config: TweenConfig<TTarget>) {
    this.entry.queue.tween(config);
    return this;
  }

  public tweenParallel(configs: TweenConfig<TTarget>[]) {
    this.entry.queue.tweenParallel(configs);
    return this;
  }

  public wait(duration: number) {
    this.entry.queue.wait(duration);
    return this;
  }

  public enqueue(clip: AnimationClip) {
    this.entry.queue.enqueue(clip);
    return this;
  }

  public enqueueSequence(clips: AnimationClip[]) {
    this.entry.queue.enqueueSequence(clips);
    return this;
  }

  public enqueueParallel(clips: AnimationClip[]) {
    this.entry.queue.enqueueParallel(clips);
    return this;
  }

  public interrupt(reason?: unknown) {
    this.system.interrupt(this.entry.id, reason);
    return this;
  }

  public reset() {
    this.system.reset(this.entry.id);
    return this;
  }

  public clear() {
    const wasPending = this.entry.status === "pending";
    this.entry.queue.clear();
    if (wasPending) {
      this.system.reset(this.entry.id);
    }
    return this;
  }

  public destroy() {
    this.system.destroy(this.entry.id);
  }

  public isFinished() {
    return this.entry.queue.isFinished();
  }
}

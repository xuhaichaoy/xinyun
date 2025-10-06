import type { LayerName, SceneGraph } from "../Scene";

interface Vector2 {
  x: number;
  y: number;
}

const DEFAULT_LAYER: LayerName = "fx";

export interface ShakeOptions {
  intensity: number;
  duration: number;
  frequency?: number;
  decay?: number;
}

export interface ScreenFlashOptions {
  color?: string;
  duration?: number;
  layer?: LayerName;
}

export class ScreenEffects {
  private shakeTime = 0;
  private shakeDuration = 0;
  private shakeIntensity = 0;
  private shakeFrequency = 25;
  private shakeDecay = 0.9;
  private shakeOffset: Vector2 = { x: 0, y: 0 };
  private shakeSeed = Math.random() * 10;

  private flashTime = 0;
  private flashDuration = 0.2;
  private flashOpacity = 0;
  private flashColor = "rgba(248,250,252,0.45)";
  private flashLayer: LayerName = DEFAULT_LAYER;

  public triggerShake(options: ShakeOptions) {
    this.shakeIntensity = Math.max(options.intensity, this.shakeIntensity);
    this.shakeDuration = Math.max(options.duration, this.shakeDuration);
    this.shakeFrequency = options.frequency ?? this.shakeFrequency;
    this.shakeDecay = options.decay ?? 0.85;
    this.shakeTime = 0;
    this.shakeSeed = Math.random() * 10;
  }

  public triggerFlash(options: ScreenFlashOptions = {}) {
    this.flashColor = options.color ?? this.flashColor;
    this.flashDuration = options.duration ?? 0.25;
    this.flashLayer = options.layer ?? DEFAULT_LAYER;
    this.flashTime = 0;
    this.flashOpacity = 1;
  }

  public update(deltaTime: number) {
    this.updateShake(deltaTime);
    this.updateFlash(deltaTime);
  }

  public applyScreenTransform(ctx: CanvasRenderingContext2D) {
    ctx.translate(this.shakeOffset.x, this.shakeOffset.y);
  }

  public queueFlash(scene: SceneGraph) {
    if (this.flashOpacity <= 0) {
      return false;
    }

    const color = this.flashColor;
    const opacity = this.flashOpacity;
    scene.queue(this.flashLayer, (ctx) => {
      const { width, height } = ctx.canvas;
      const globalAlpha = ctx.globalAlpha;
      ctx.save();
      ctx.globalAlpha = opacity * globalAlpha;
      ctx.fillStyle = color;
      ctx.fillRect(-width, -height, width * 2, height * 2);
      ctx.restore();
    });
    return true;
  }

  public getShakeOffset(): Vector2 {
    return { ...this.shakeOffset };
  }

  public isActive() {
    return this.shakeTime < this.shakeDuration || this.flashOpacity > 0;
  }

  private updateShake(deltaTime: number) {
    if (this.shakeTime >= this.shakeDuration) {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
      return;
    }

    this.shakeTime += deltaTime;
    const progress = Math.min(this.shakeTime / Math.max(this.shakeDuration, 0.0001), 1);
    const damping = Math.pow(1 - progress, this.shakeDecay * 1.5);
    const t = (this.shakeSeed + this.shakeTime) * this.shakeFrequency;
    this.shakeOffset.x = (noise1D(t) * 2 - 1) * this.shakeIntensity * damping;
    this.shakeOffset.y = (noise1D(t + 7.53) * 2 - 1) * this.shakeIntensity * damping;
  }

  private updateFlash(deltaTime: number) {
    if (this.flashOpacity <= 0) {
      return;
    }

    this.flashTime += deltaTime;
    const progress = Math.min(this.flashTime / Math.max(this.flashDuration, 0.0001), 1);
    this.flashOpacity = 1 - progress;
    if (this.flashOpacity <= 0.01) {
      this.flashOpacity = 0;
    }
  }
}

// Simple pseudo-random generator for smooth-ish noise.
const noise1D = (x: number) => {
  const n = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return n - Math.floor(n);
};

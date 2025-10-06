import { Camera2D } from "./Camera2D";
import {
  SceneGraph,
  type LayerName,
  type RenderCommand,
  type RenderCommandOptions,
  type QueuedRenderCommand,
  type Rect,
} from "./Scene";
import { AnimationSystem } from "./animation/AnimationSystem";
import { EffectComposer, type EffectComposerOptions } from "./fx/EffectComposer";
import { gameEventBus } from "@/events/GameEvents";
import type { GameEventMap } from "@/events/GameEvents";
import { attachRendererMonitor } from "@/utils/performance";

export interface RendererMetrics {
  fps: number;
  frameTime: number;
  lastTimestamp: number;
}

export interface RendererOptions {
  autoStart?: boolean;
  useWebGL?: boolean;
  maxFPS?: number;
  layers?: LayerName[];
  camera?: Camera2D;
  debug?: boolean;
  animationSystem?: AnimationSystem;
  effects?: EffectComposer;
  effectOptions?: Omit<EffectComposerOptions, "animationSystem">;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly camera: Camera2D;
  readonly scene: SceneGraph;
  readonly animations: AnimationSystem;
  readonly effects: EffectComposer;

  private ctx2d: CanvasRenderingContext2D | null = null;
  private gl: WebGLRenderingContext | null = null;
  private animationFrame = 0;
  private running = false;
  private lastTimestamp = 0;
  private targetFrameTime: number | null;
  private metrics: RendererMetrics = { fps: 0, frameTime: 0, lastTimestamp: performance.now() };
  private highDPIScale = 1;
  private debug = false;
  private ownsAnimationSystem = false;
  private ownsEffectComposer = false;
  private needsRender = true;
  private dirtyRegions: Rect[] = [];
  private fullDirty = true;
  private debugShowCommandBounds = false;
  private debugShowDirtyRects = false;
  private debugShowPerformance = false;
  private debugDirtySnapshot: Rect[] = [];
  private debugMonitorCleanup: (() => void) | null = null;
  private debugSubscriptions: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    this.canvas = canvas;
    this.scene = new SceneGraph(options.layers);
    this.camera = options.camera ?? new Camera2D();
    this.targetFrameTime = options.maxFPS ? 1000 / options.maxFPS : null;
    this.debug = options.debug ?? false;

    if (options.animationSystem) {
      this.animations = options.animationSystem;
      this.ownsAnimationSystem = false;
    } else {
      this.animations = new AnimationSystem();
      this.ownsAnimationSystem = true;
    }

    if (options.effects) {
      this.effects = options.effects;
      this.ownsEffectComposer = false;
    } else {
      this.effects = new EffectComposer({
        animationSystem: this.animations,
        ...(options.effectOptions ?? {}),
      });
      this.ownsEffectComposer = true;
    }

    this.scene.setQueueListener(this.handleSceneQueue);

    if (import.meta.env.DEV) {
      this.debugMonitorCleanup = attachRendererMonitor(this);
      this.debugSubscriptions.push(
        gameEventBus.on("debug:canvasConfig", (config) => {
          this.handleDebugConfig(config);
        })
      );
    }

    this.initializeContext(options.useWebGL ?? false);
    this.handleResize();

    if (options.autoStart ?? true) {
      this.start();
    }
  }

  private initializeContext(useWebGL: boolean) {
    if (useWebGL) {
      this.gl = this.canvas.getContext("webgl", { antialias: true });
      if (!this.gl && this.debug) {
        console.warn("[Renderer] WebGL unavailable, falling back to 2D context");
      }
    }

    if (!this.gl) {
      this.ctx2d = this.canvas.getContext("2d", { alpha: false });
      if (!this.ctx2d) {
        throw new Error("Unable to acquire CanvasRenderingContext2D");
      }
      this.ctx2d.imageSmoothingEnabled = true;
    }
  }

  public start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.animationFrame = requestAnimationFrame(this.renderLoop);
    window.addEventListener("resize", this.handleResize);
  }

  public stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.handleResize);
  }

  public dispose() {
    this.stop();
    this.scene.clear();
    if (this.ownsAnimationSystem) {
      this.animations.clear();
    }
    if (this.ownsEffectComposer) {
      // Allow object pools to release references.
      this.effects.particles.update(0);
    }
    this.debugMonitorCleanup?.();
    this.debugMonitorCleanup = null;
    this.debugSubscriptions.forEach((unsubscribe) => unsubscribe());
    this.debugSubscriptions = [];
    this.debugDirtySnapshot = [];
    this.ctx2d = null;
    this.gl = null;
  }

  public queue(layer: LayerName, command: RenderCommand, options: RenderCommandOptions = {}) {
    this.scene.queue(layer, command, options);
  }

  public clear() {
    this.scene.clear();
    this.markDirty(null);
  }

  public resize(width: number, height: number) {
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.handleResize();
  }

  public getMetrics(): RendererMetrics {
    return { ...this.metrics };
  }

  public getAnimationSystem() {
    return this.animations;
  }

  public getEffectComposer() {
    return this.effects;
  }

  public invalidate(region?: Rect) {
    const normalized = region ? { ...region } : null;
    this.markDirty(normalized);
  }

  private renderLoop = (time: number) => {
    if (!this.running) {
      return;
    }

    const delta = time - this.lastTimestamp;
    const hasActiveAnimations = this.animations.hasActiveAnimations();
    const hasActiveEffects = this.effects.hasActiveEffects();
    const hasPendingCommands = this.scene.hasCommands();
    const shouldRenderFrame =
      this.needsRender || hasActiveAnimations || hasActiveEffects || hasPendingCommands;

    if (!shouldRenderFrame) {
      this.lastTimestamp = time;
      this.animationFrame = requestAnimationFrame(this.renderLoop);
      return;
    }

    const throttled = this.targetFrameTime != null && delta < this.targetFrameTime;
    if (!throttled) {
      const deltaMs = delta > 0 ? delta : 16.67;
      this.renderFrame(deltaMs / 1000);
      this.metrics.frameTime = deltaMs;
      this.metrics.fps = 1000 / deltaMs;
      this.lastTimestamp = time;
      this.metrics.lastTimestamp = time;
    }

    this.animationFrame = requestAnimationFrame(this.renderLoop);
  };

  private renderFrame(deltaTime: number) {
    this.handleResize();
    this.animations.update(deltaTime);
    const effectsTriggered = this.effects.update(deltaTime, this.scene);
    if (effectsTriggered) {
      this.markDirty(null);
    }
    if (this.ctx2d) {
      this.render2D(deltaTime, this.ctx2d);
    } else if (this.gl) {
      this.renderWebGL(deltaTime, this.gl);
    }
    this.scene.clear();

    const hasActiveAnimations = this.animations.hasActiveAnimations();
    const hasActiveEffects = this.effects.hasActiveEffects();
    const hasPendingCommands = this.scene.hasCommands();
    this.needsRender = hasPendingCommands || hasActiveAnimations || hasActiveEffects;
  }

  private render2D(deltaTime: number, ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.clearFrame(ctx);
    ctx.setTransform(this.highDPIScale, 0, 0, this.highDPIScale, 0, 0);

    const commandBoundsToDraw: Rect[] = [];
    const layers = this.scene.getLayers();
    for (const layer of layers) {
      if (!layer.visible || layer.commands.length === 0) continue;
      ctx.save();
      if (layer.name !== "ui") {
        this.camera.applyTransform(ctx);
        this.effects.applyScreenTransform(ctx);
      }
      for (const command of layer.commands) {
        command.run(ctx, this.camera, deltaTime);
        if (this.debugShowCommandBounds && command.bounds) {
          commandBoundsToDraw.push(command.bounds);
        }
      }
      ctx.restore();
    }

    this.drawDebugOverlays(ctx, this.debugDirtySnapshot, commandBoundsToDraw);
    ctx.restore();
  }

  private clearFrame(ctx: CanvasRenderingContext2D) {
    const scale = this.highDPIScale;

    if (this.fullDirty || this.dirtyRegions.length === 0) {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.debugDirtySnapshot = [
        {
          x: 0,
          y: 0,
          width: this.canvas.width / scale,
          height: this.canvas.height / scale,
        },
      ];
    } else {
      this.debugDirtySnapshot = this.dirtyRegions.map((region) => ({ ...region }));
      for (const region of this.dirtyRegions) {
        ctx.clearRect(region.x * scale, region.y * scale, region.width * scale, region.height * scale);
      }
    }

    this.dirtyRegions.length = 0;
    this.fullDirty = false;
  }

  private drawDebugOverlays(ctx: CanvasRenderingContext2D, dirtyRects: Rect[], commandBounds: Rect[]) {
    if (!import.meta.env.DEV) {
      return;
    }
    if (!this.debugShowDirtyRects && !this.debugShowCommandBounds && !this.debugShowPerformance) {
      return;
    }

    ctx.save();
    ctx.lineWidth = 1 / this.highDPIScale;

    if (this.debugShowDirtyRects) {
      ctx.strokeStyle = "rgba(250,204,21,0.85)";
      ctx.setLineDash([4, 4]);
      for (const rect of dirtyRects) {
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
      ctx.setLineDash([]);
    }

    if (this.debugShowCommandBounds) {
      ctx.strokeStyle = "rgba(96,165,250,0.85)";
      for (const rect of commandBounds) {
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    }

    if (this.debugShowPerformance) {
      ctx.fillStyle = "rgba(15,23,42,0.85)";
      ctx.fillRect(12, 12, 180, 56);
      ctx.fillStyle = "#f8fafc";
      ctx.font = `600 12px 'Roboto', 'Segoe UI', sans-serif`;
      ctx.fillText(`FPS: ${this.metrics.fps.toFixed(1)}`, 20, 30);
      ctx.fillText(`Frame: ${this.metrics.frameTime.toFixed(2)} ms`, 20, 46);
    }

    ctx.restore();
  }

  private renderWebGL(deltaTime: number, gl: WebGLRenderingContext) {
    const { width, height } = this.canvas;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // For brevity, WebGL batch rendering is not fully implemented.
    // This placeholder keeps API parity and allows future WebGL shaders.
    if (this.debug) {
      console.warn("[Renderer] WebGL rendering pipeline not implemented");
    }
  }

  private handleResize = () => {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.highDPIScale = dpr;
      this.camera.updateViewport(width / dpr, height / dpr);
      this.effects.setViewport(width / dpr, height / dpr);
      this.markDirty(null);
    }
  };

  private markDirty(region: Rect | null) {
    this.needsRender = true;
    if (region == null) {
      if (!this.fullDirty) {
        this.fullDirty = true;
        this.dirtyRegions.length = 0;
      }
      return;
    }

    if (this.fullDirty) {
      return;
    }

    this.dirtyRegions.push(region);
    if (this.dirtyRegions.length > 64) {
      this.fullDirty = true;
      this.dirtyRegions.length = 0;
    }
  }

  private normalizeBounds(region: Rect | null, layer: LayerName): Rect | null {
    if (!region) {
      return null;
    }
    if (layer === "ui") {
      return { ...region };
    }
    const topLeft = this.camera.worldToScreen({ x: region.x, y: region.y });
    const bottomRight = this.camera.worldToScreen({
      x: region.x + region.width,
      y: region.y + region.height,
    });
    return {
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      width: Math.abs(bottomRight.x - topLeft.x),
      height: Math.abs(bottomRight.y - topLeft.y),
    };
  }

  private handleSceneQueue = (
    layer: LayerName,
    command: QueuedRenderCommand,
    options?: RenderCommandOptions
  ) => {
    const bounds = options?.bounds ?? command.bounds ?? null;
    const normalized = this.normalizeBounds(bounds, layer);
    command.bounds = normalized;
    this.markDirty(normalized);
  };

  private handleDebugConfig(config: GameEventMap["debug:canvasConfig"]) {
    this.debugShowCommandBounds = Boolean(config.showBounds);
    this.debugShowDirtyRects = Boolean(config.showDirtyRects);
    this.debugShowPerformance = Boolean(config.showPerformance);
    this.needsRender = true;
    if (this.debugShowCommandBounds || this.debugShowDirtyRects || this.debugShowPerformance) {
      this.markDirty(null);
    }
  }
}

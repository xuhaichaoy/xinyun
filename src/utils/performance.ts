import { gameEventBus } from "@/events/GameEvents";
import type { Renderer } from "@/canvas";

interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface RendererMonitorOptions {
  sampleRateMs?: number;
  emitMemory?: boolean;
}

export function attachRendererMonitor(renderer: Renderer, options: RendererMonitorOptions = {}) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const { sampleRateMs = 1000, emitMemory = true } = options;

  const sample = () => {
    const metrics = renderer.getMetrics();
    gameEventBus.emit("performance:frame", {
      fps: metrics.fps,
      frameTime: metrics.frameTime,
      timestamp: performance.now(),
    });

    if (emitMemory && (performance as Performance & { memory?: MemoryInfo }).memory) {
      const memory = (performance as Performance & { memory?: MemoryInfo }).memory;
      if (memory) {
        gameEventBus.emit("performance:memory", {
          used: memory.usedJSHeapSize,
          total: memory.totalJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          timestamp: performance.now(),
        });
      }
    }
  };

  const handle = window.setInterval(sample, sampleRateMs);
  sample();

  return () => {
    window.clearInterval(handle);
  };
}

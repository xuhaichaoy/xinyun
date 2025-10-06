import type { GameState } from "@/types/domain";
import { gameEventBus, type GameEventBus } from "@/events/GameEvents";
import type { Renderer } from "./Renderer";

export interface GameCanvasBridgeOptions {
  bus?: GameEventBus;
  overlayLayer?: string;
}

export class GameCanvasBridge {
  private readonly renderer: Renderer;
  private readonly bus: GameEventBus;
  private readonly overlayLayer: string;
  private unsubscribers: Array<() => void> = [];
  private lastState: GameState | null = null;
  private dirty = false;

  constructor(renderer: Renderer, options: GameCanvasBridgeOptions = {}) {
    this.renderer = renderer;
    this.bus = options.bus ?? gameEventBus;
    this.overlayLayer = options.overlayLayer ?? "ui";
    this.bind();
  }

  public dispose() {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
  }

  private bind() {
    this.unsubscribers.push(
      this.bus.on("state:updated", ({ state }) => {
        this.lastState = state;
        this.invalidate("state:updated");
      })
    );
    this.unsubscribers.push(
      this.bus.on("canvas:invalidate", ({ state }) => {
        if (state) {
          this.lastState = state;
        }
        this.invalidate("canvas:invalidate");
      })
    );
  }

  private invalidate(_reason: string) {
    if (this.dirty) {
      return;
    }
    this.dirty = true;
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        this.dirty = false;
        this.flushOverlay();
      });
    } else {
      setTimeout(() => {
        this.dirty = false;
        this.flushOverlay();
      }, 16);
    }
  }

  private flushOverlay() {
    if (!this.lastState) {
      return;
    }
    const snapshot = this.lastState;
    const bounds = { x: 12, y: 12, width: 180, height: 68 };
    this.renderer.queue(this.overlayLayer, (ctx) => {
      ctx.save();
      ctx.fillStyle = "rgba(15,23,42,0.75)";
      ctx.fillRect(12, 12, 180, 68);
      ctx.fillStyle = "#bfdbfe";
      ctx.font = "600 14px 'Roboto', sans-serif";
      ctx.fillText(`回合：${snapshot.turn}`, 24, 32);
      ctx.fillText(`阶段：${snapshot.phase}`, 24, 52);
      ctx.fillText(`当前玩家：${snapshot.current_player}`, 24, 72);
      ctx.restore();
    }, { bounds });
  }
}

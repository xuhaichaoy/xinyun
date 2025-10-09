import type {
  AttackAction,
  GameEvent,
  GameState,
  PlayCardAction,
  RuleResolution,
} from "@/types/domain";
import type { AiDecision, AiMoveResponse } from "@/types/domain";
import type { GameStateError } from "@/hooks/useGameState";
import { EventBus, type EventBusEntry, type EventMap } from "./EventBus";

export type GameStateUpdateMode = "replace" | "incremental";

export type CanvasInteractionEvent =
  | { type: "playCard"; action: PlayCardAction }
  | { type: "attack"; action: AttackAction }
  | { type: "endTurn" }
  | { type: "startTurn"; playerId: number }
  | { type: "inspectCard"; cardId: number }
  | { type: "custom"; name: string; payload?: unknown };

export interface GameEventMap extends EventMap {
  "wasm:request": { action: string; attempt: number; metadata?: unknown };
  "wasm:response": {
    action: string;
    attempts: number;
    duration: number;
    metadata?: unknown;
    resultSummary?: unknown;
  };
  "wasm:error": { action: string; attempts: number; error: Error; metadata?: unknown };
  "wasm:stateSnapshot": { state: GameState };
  "service:disposed": { reason?: string };
  "state:initialized": { state: GameState | null };
  "state:updated": { state: GameState; resolution: RuleResolution; mode: GameStateUpdateMode };
  "state:eventsAppended": { events: GameEvent[]; total: number };
  "state:eventsCleared": { total: number };
  "state:rollback": { state: GameState | null };
  "state:updateModeChanged": { mode: GameStateUpdateMode };
  "state:error": { error: GameStateError };
  "ai:decision": { decision: AiDecision; playerId: number };
  "ai:applied": { response: AiMoveResponse; playerId: number };
  "canvas:invalidate": { reason: string; state: GameState | null };
  "canvas:interaction": CanvasInteractionEvent;
  "canvas:actionResult": {
    type: CanvasInteractionEvent["type"];
    success: boolean;
    error?: GameStateError;
  };
  "debug:log": {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    context?: Record<string, unknown>;
    timestamp: number;
    source?: string;
  };
  "performance:frame": { fps: number; frameTime: number; timestamp: number };
  "performance:memory": {
    used: number;
    total: number;
    limit?: number;
    timestamp: number;
  };
  "debug:canvasConfig": {
    showBounds?: boolean;
    showDirtyRects?: boolean;
    showPerformance?: boolean;
  };
}

export type GameEventBus = EventBus<GameEventMap>;
export type GameEventEntry<TKey extends keyof GameEventMap = keyof GameEventMap> = EventBusEntry<
  GameEventMap,
  TKey
>;

export const gameEventBus: GameEventBus = new EventBus<GameEventMap>({
  name: "GameEventBus",
  historyLimit: 300,
  debug: false,
});

export const getEventSummary = <TKey extends keyof GameEventMap>(entry: GameEventEntry<TKey>) => {
  const { event, payload } = entry;
  switch (event) {
    case "wasm:request": {
      const data = payload as GameEventMap["wasm:request"];
      return `${data.action}#${data.attempt}`;
    }
    case "wasm:response": {
      const data = payload as GameEventMap["wasm:response"];
      return `${data.action} ✔ (${data.duration.toFixed(2)}ms)`;
    }
    case "wasm:error": {
      const data = payload as GameEventMap["wasm:error"];
      return `${data.action} ✖ ${data.error.message}`;
    }
    case "state:updated": {
      const data = payload as GameEventMap["state:updated"];
      return `State updated (${data.mode})`;
    }
    case "canvas:invalidate": {
      const data = payload as GameEventMap["canvas:invalidate"];
      return `Canvas invalidate: ${data.reason}`;
    }
    case "canvas:interaction": {
      const data = payload as GameEventMap["canvas:interaction"];
      return `Canvas -> ${data.type}`;
    }
    case "state:eventsAppended": {
      const data = payload as GameEventMap["state:eventsAppended"];
      return `Appended ${data.events.length} events`;
    }
    case "state:eventsCleared":
      return "Events cleared";
    case "debug:log": {
      const data = payload as GameEventMap["debug:log"];
      return `${data.level.toUpperCase()}: ${data.message}`;
    }
    case "performance:frame": {
      const data = payload as GameEventMap["performance:frame"];
      return `FPS ${data.fps.toFixed(1)}, frame ${data.frameTime.toFixed(2)}ms`;
    }
    case "performance:memory": {
      const data = payload as GameEventMap["performance:memory"];
      return `Memory ${(data.used / 1048576).toFixed(1)}MB`;
    }
    case "debug:canvasConfig": {
      const data = payload as GameEventMap["debug:canvasConfig"];
      const tags = [
        data.showBounds ? "bounds" : null,
        data.showDirtyRects ? "dirty" : null,
        data.showPerformance ? "fps" : null,
      ].filter(Boolean);
      return `Canvas debug ${tags.length ? tags.join(",") : "off"}`;
    }
    default:
      return String(event);
  }
};

export const summarizeResolution = (resolution: RuleResolution) => ({
  events: resolution.events.length,
  victory: resolution.victory ?? null,
  turn: resolution.state.turn,
  currentPlayer: resolution.state.current_player,
});

export const summarizeState = (state: GameState) => ({
  turn: state.turn,
  phase: state.phase,
  current: state.current_player,
  version: state.version ?? 0,
  players: state.players.map((player) => ({
    id: player.id,
    health: player.health,
    mana: player.mana,
    maxMana: player.max_mana,
    hand: player.hand?.length ?? 0,
    board: player.board?.length ?? 0,
  })),
});

export function logDebug(message: string, context?: Record<string, unknown>) {
  gameEventBus.emit("debug:log", {
    level: "debug",
    message,
    context,
    timestamp: Date.now(),
  });
}

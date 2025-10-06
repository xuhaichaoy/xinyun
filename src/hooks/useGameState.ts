import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  AiDecision,
  AiMoveResponse,
  GameEvent,
  GameState,
  PlayCardAction,
  AttackAction,
  MulliganAction,
  RuleResolution
} from "@/types/domain";
import type { ApplyAiOptions, GameEngineService, ThinkAiOptions } from "@/wasm/GameEngineService";
import { gameEventBus, type CanvasInteractionEvent } from "@/events/GameEvents";

const clone = <T,>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

type UpdateMode = "replace" | "incremental";

export interface UseGameStateOptions {
  service: GameEngineService | null;
  updateMode?: UpdateMode;
  historyLimit?: number;
}

export interface UseGameStateResult {
  state: GameState | null;
  events: GameEvent[];
  loading: boolean;
  error: Error | null;
  isMutating: boolean;
  updateMode: UpdateMode;
  setUpdateMode: (mode: UpdateMode) => void;
  reload: () => Promise<void>;
  clearEvents: () => void;
  rollback: () => GameState | null;
  playCard: (action: PlayCardAction) => Promise<RuleResolution>;
  mulligan: (action: MulliganAction) => Promise<RuleResolution>;
  attack: (action: AttackAction) => Promise<RuleResolution>;
  startTurn: (playerId: number) => Promise<RuleResolution>;
  endTurn: () => Promise<RuleResolution>;
  advancePhase: () => Promise<RuleResolution>;
  applyAiMove: (playerId: number, options?: ApplyAiOptions) => Promise<AiMoveResponse>;
  thinkAi: (playerId: number, options?: ThinkAiOptions) => Promise<AiDecision>;
  computeAiMove: (state: GameState, playerId: number, options?: ApplyAiOptions) => Promise<AiDecision>;
}

const shallowEqualCard = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const cardA = a as Record<string, unknown>;
  const cardB = b as Record<string, unknown>;
  return (
    cardA.id === cardB.id &&
    cardA.cost === cardB.cost &&
    cardA.attack === cardB.attack &&
    cardA.health === cardB.health &&
    cardA.card_type === cardB.card_type &&
    cardA.effects === cardB.effects
  );
};

const shallowEqualPlayer = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  const playerA = a as Record<string, unknown>;
  const playerB = b as Record<string, unknown>;
  return (
    playerA.id === playerB.id &&
    playerA.health === playerB.health &&
    playerA.armor === playerB.armor &&
    playerA.mana === playerB.mana &&
    playerA.hand === playerB.hand &&
    playerA.board === playerB.board &&
    playerA.deck === playerB.deck
  );
};

const reconcileState = (prev: GameState | null, next: GameState, mode: UpdateMode): GameState => {
  if (!prev || mode === "replace") {
    return next;
  }

  const reconciledPlayers = next.players.map((player, index) => {
    const prevPlayer = prev.players[index];
    if (!prevPlayer || prevPlayer.id !== player.id) {
      return player;
    }

    if (shallowEqualPlayer(prevPlayer, player)) {
      return prevPlayer;
    }

    const hand = reconcileCardArray(prevPlayer.hand, player.hand);
    const board = reconcileCardArray(prevPlayer.board, player.board);
    const deck = reconcileCardArray(prevPlayer.deck, player.deck);

    if (
      hand === player.hand &&
      board === player.board &&
      deck === player.deck &&
      prevPlayer.health === player.health &&
      prevPlayer.armor === player.armor &&
      prevPlayer.mana === player.mana
    ) {
      return prevPlayer;
    }

    return {
      ...player,
      hand,
      board,
      deck,
    };
  });

  const playersChanged = reconciledPlayers.some((player, index) => player !== next.players[index]);
  if (!playersChanged && prev.turn === next.turn && prev.phase === next.phase && prev.current_player === next.current_player && prev.outcome === next.outcome) {
    return prev;
  }

  return {
    ...next,
    players: reconciledPlayers,
  };
};

const reconcileCardArray = (prev: unknown, next: unknown): unknown => {
  if (prev === next || !Array.isArray(prev) || !Array.isArray(next)) {
    return next;
  }

  if (prev.length !== next.length) {
    return next;
  }

  const result = next.map((card, index) => {
    const prevCard = prev[index];
    return shallowEqualCard(prevCard, card) ? prevCard : card;
  });

  const unchanged = result.every((card, index) => card === prev[index]);
  return unchanged ? prev : result;
};

const normalizeError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("GameEngine operation failed");
};

export function useGameState(options: UseGameStateOptions): UseGameStateResult {
  const { service, historyLimit = 10 } = options;
  const bus = gameEventBus;
  const [updateModeState, setUpdateModeState] = useState<UpdateMode>(options.updateMode ?? "replace");
  const [state, setState] = useState<GameState | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [isMutating, setIsMutating] = useState<boolean>(false);

  const historyRef = useRef<GameState[]>([]);
  const stateRef = useRef<GameState | null>(null);

  const updateMode = updateModeState;

  const setUpdateMode = useCallback(
    (mode: UpdateMode) => {
      setUpdateModeState(mode);
      bus.emit("state:updateModeChanged", { mode });
    },
    [bus]
  );

  useEffect(() => {
    setUpdateMode(options.updateMode ?? "replace");
  }, [options.updateMode]);

  useEffect(() => {
    if (!service) {
      setState(null);
      stateRef.current = null;
      setLoading(false);
      bus.emit("state:initialized", { state: null });
      bus.emit("canvas:invalidate", { reason: "service:detached", state: null });
      return;
    }
    try {
      const current = service.getState();
      setState(current);
      stateRef.current = current;
      setLoading(false);
      setError(null);
      bus.emit("state:initialized", { state: current });
      bus.emit("canvas:invalidate", { reason: "service:attached", state: current });
    } catch (err) {
      setError(normalizeError(err));
      setLoading(false);
    }
  }, [bus, service]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const pushHistory = useCallback(
    (snapshot: GameState) => {
      const cloneSnapshot = historyLimit > 0 ? clone(snapshot) : snapshot;
      if (historyLimit <= 0) {
        historyRef.current = [cloneSnapshot];
        return;
      }
      historyRef.current.push(cloneSnapshot);
      if (historyRef.current.length > historyLimit) {
        historyRef.current.shift();
      }
    },
    [historyLimit]
  );

  const applyResolution = useCallback(
    (resolution: RuleResolution) => {
      let nextState: GameState | null = null;
      setState((prev) => {
        const next = reconcileState(prev, resolution.state, updateMode);
        stateRef.current = next;
        nextState = next;
        return next;
      });
      if (resolution.events.length > 0) {
        setEvents((prevEvents) => {
          const merged = [...prevEvents, ...resolution.events];
          bus.emit("state:eventsAppended", { events: resolution.events, total: merged.length });
          return merged;
        });
      }
      if (nextState) {
        bus.emit("state:updated", { state: nextState, resolution, mode: updateMode });
        bus.emit("canvas:invalidate", { reason: "state:updated", state: nextState });
      }
      return resolution;
    },
    [bus, updateMode]
  );

  const rollback = useCallback((): GameState | null => {
    const history = historyRef.current;
    const previous = history.pop();
    if (!previous) {
      return null;
    }
    setState(() => {
      stateRef.current = previous;
      return previous;
    });
    bus.emit("state:rollback", { state: previous });
    bus.emit("canvas:invalidate", { reason: "state:rollback", state: previous });
    return previous;
  }, [bus]);

  const runResolution = useCallback(
    async (label: string, operation: () => Promise<RuleResolution>): Promise<RuleResolution> => {
      if (!service) {
        throw new Error("GameEngineService is not available");
      }
      const snapshot = stateRef.current;
      if (snapshot) {
        pushHistory(snapshot);
      }
      setIsMutating(true);
      try {
        const resolution = await operation();
        applyResolution(resolution);
        return resolution;
      } catch (err) {
        if (snapshot) {
          historyRef.current.pop();
          setState(() => {
            stateRef.current = snapshot;
            return snapshot;
          });
        }
        const normalized = normalizeError(err);
        setError(normalized);
        bus.emit("state:error", { error: normalized });
        throw normalized;
      } finally {
        setIsMutating(false);
      }
    },
    [applyResolution, bus, pushHistory, service]
  );

  const playCard = useCallback(
    (action: PlayCardAction) => runResolution("play_card", () => service!.playCard(action)),
    [runResolution, service]
  );

  const mulligan = useCallback(
    (action: MulliganAction) => runResolution("mulligan", () => service!.mulligan(action)),
    [runResolution, service]
  );

  const attack = useCallback(
    (action: AttackAction) => runResolution("attack", () => service!.attack(action)),
    [runResolution, service]
  );

  const startTurn = useCallback(
    (playerId: number) => runResolution("start_turn", () => service!.startTurn(playerId)),
    [runResolution, service]
  );

  const endTurn = useCallback(
    () => runResolution("end_turn", () => service!.endTurn()),
    [runResolution, service]
  );

  const advancePhase = useCallback(
    () => runResolution("advance_phase", () => service!.advancePhase()),
    [runResolution, service]
  );

  const applyAiMove = useCallback(
    async (playerId: number, opts: ApplyAiOptions = {}) => {
      if (!service) {
        throw new Error("GameEngineService is not available");
      }
      const snapshot = stateRef.current;
      if (snapshot) {
        pushHistory(snapshot);
      }
      setIsMutating(true);
      try {
        const response = await service.applyAiMove(playerId, opts);
        if (response.applied) {
          applyResolution(response.applied);
        }
        return response;
      } catch (err) {
        if (snapshot) {
          historyRef.current.pop();
          setState(() => {
            stateRef.current = snapshot;
            return snapshot;
          });
        }
        const normalized = normalizeError(err);
        setError(normalized);
        bus.emit("state:error", { error: normalized });
        throw normalized;
      } finally {
        setIsMutating(false);
      }
    },
    [applyResolution, bus, pushHistory, service]
  );

  const thinkAi = useCallback(
    (playerId: number, opts: ThinkAiOptions = {}) => {
      if (!service) {
        return Promise.reject(new Error("GameEngineService is not available"));
      }
      return service.thinkAi(playerId, opts).catch((error) => {
        const normalized = normalizeError(error);
        setError(normalized);
        bus.emit("state:error", { error: normalized });
        throw normalized;
      });
    },
    [bus, service]
  );

  const computeAiMove = useCallback(
    (currentState: GameState, playerId: number, opts: ApplyAiOptions = {}) => {
      if (!service) {
        return Promise.reject(new Error("GameEngineService is not available"));
      }
      return service.computeAiMove(currentState, playerId, opts).catch((error) => {
        const normalized = normalizeError(error);
        setError(normalized);
        bus.emit("state:error", { error: normalized });
        throw normalized;
      });
    },
    [bus, service]
  );

  useEffect(() => {
    if (!service) {
      return;
    }
    const unsubscribe = bus.on("canvas:interaction", (interaction) => {
      const handleResult = (success: boolean, error?: Error) => {
        bus.emit("canvas:actionResult", {
          type: interaction.type,
          success,
          error,
        });
      };

      switch (interaction.type) {
        case "playCard":
          void playCard(interaction.action)
            .then(() => handleResult(true))
            .catch((err) => handleResult(false, normalizeError(err)));
          break;
        case "attack":
          void attack(interaction.action)
            .then(() => handleResult(true))
            .catch((err) => handleResult(false, normalizeError(err)));
          break;
        case "endTurn":
          void endTurn()
            .then(() => handleResult(true))
            .catch((err) => handleResult(false, normalizeError(err)));
          break;
        case "startTurn":
          void startTurn(interaction.playerId)
            .then(() => handleResult(true))
            .catch((err) => handleResult(false, normalizeError(err)));
          break;
        default:
          handleResult(false, new Error(`Unhandled interaction: ${interaction.type}`));
          break;
      }
    });
    return unsubscribe;
  }, [attack, bus, endTurn, playCard, service, startTurn]);

  const reload = useCallback(async () => {
    if (!service) {
      setState(null);
      stateRef.current = null;
      setLoading(false);
      bus.emit("state:initialized", { state: null });
      bus.emit("canvas:invalidate", { reason: "state:cleared", state: null });
      return;
    }
    setLoading(true);
    try {
      const next = service.getState();
      setState(next);
      stateRef.current = next;
      setError(null);
      bus.emit("state:initialized", { state: next });
      bus.emit("canvas:invalidate", { reason: "state:reloaded", state: next });
    } catch (err) {
      const normalized = normalizeError(err);
      setError(normalized);
      bus.emit("state:error", { error: normalized });
    } finally {
      setLoading(false);
    }
  }, [bus, service]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    bus.emit("state:eventsCleared", { total: 0 });
    bus.emit("canvas:invalidate", { reason: "events:cleared", state: stateRef.current });
  }, [bus]);

  return useMemo(
    () => ({
      state,
      events,
      loading,
      error,
      isMutating,
      updateMode,
      setUpdateMode,
      reload,
      clearEvents,
      rollback,
      playCard,
      mulligan,
      attack,
      startTurn,
      endTurn,
      advancePhase,
      applyAiMove,
      thinkAi,
      computeAiMove,
    }),
    [
      state,
      events,
      loading,
      error,
      isMutating,
      updateMode,
      setUpdateMode,
      reload,
      clearEvents,
      rollback,
      playCard,
      mulligan,
      attack,
      startTurn,
      endTurn,
      advancePhase,
      applyAiMove,
      thinkAi,
      computeAiMove,
    ]
  );
}

import type {
  AiDecision,
  AiDifficulty,
  AiStrategy,
  AttackAction,
  Card,
  DiscardCardAction,
  EffectContext,
  GameState,
  MulliganAction,
  PlayCardAction,
  RuleResolution,
  VictoryState
} from "@/types/domain";

type WasmModule = typeof import("../../rust-core/pkg/wasm_game.js");

const GLOBAL_CACHE_KEY = "__WASM_GAME_MODULE_CACHE__";

let wasmModulePromise: Promise<WasmModule> | null = null;
let wasmResponsePromise: Promise<Response> | null = null;
const aiDecisionCache = new Map<string, AiDecision>();
const MAX_AI_CACHE = 24;

const getGlobalCache = (): Promise<WasmModule> | null => {
  if (typeof globalThis === "undefined") return null;
  return (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] as Promise<WasmModule> | null;
};

const setGlobalCache = (promise: Promise<WasmModule> | null) => {
  if (typeof globalThis === "undefined") return;
  if (promise) {
    (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY] = promise;
  } else {
    delete (globalThis as Record<string, unknown>)[GLOBAL_CACHE_KEY];
  }
};

const fetchWasmResponse = async () => {
  const url = new URL("../../rust-core/pkg/wasm_game_bg.wasm", import.meta.url);
  return fetch(url);
};

const getWasmResponse = async (): Promise<Response> => {
  if (!wasmResponsePromise) {
    wasmResponsePromise = fetchWasmResponse();
  }
  const response = await wasmResponsePromise;
  return response.clone();
};

export async function initGameCore() {
  if (!wasmModulePromise) {
    wasmModulePromise = getGlobalCache();
  }

  if (!wasmModulePromise) {
    wasmModulePromise = import("../../rust-core/pkg/wasm_game.js").then(async (module) => {
      try {
        const response = await getWasmResponse();
        await module.default(response);
      } catch (error) {
        console.warn("[wasm] streaming init failed, falling back", error);
        await module.default();
      }
      return module;
    });
    setGlobalCache(wasmModulePromise);
  }

  return wasmModulePromise;
}

export function prefetchGameCore() {
  if (wasmModulePromise || getGlobalCache()) {
    return;
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => {
      void initGameCore();
    });
  } else {
    setTimeout(() => {
      void initGameCore();
    }, 0);
  }
}

export function clearWasmCache() {
  wasmModulePromise = null;
  wasmResponsePromise = null;
  setGlobalCache(null);
}

export async function createGameState(): Promise<GameState> {
  const wasm = await initGameCore();
  return wasm.createGameState();
}

export async function cloneGameState<T extends GameState>(state: T): Promise<GameState> {
  const wasm = await initGameCore();
  return wasm.cloneGameState(state);
}

export async function applyCardEffects(
  state: GameState,
  card: Card,
  context: EffectContext
): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.applyCardEffects(state, card, context);
}

export async function playCard(
  state: GameState,
  action: PlayCardAction
): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.playCard(state, action);
}

export async function mulligan(
  state: GameState,
  action: MulliganAction
): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.mulligan(state, action);
}

export async function attack(
  state: GameState,
  action: AttackAction
): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.attack(state, action);
}

export async function resolvePendingDiscard(
  state: GameState,
  action: DiscardCardAction
): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.resolvePendingDiscard(state, action);
}

export async function startTurn(state: GameState, playerId: number): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.startTurn(state, playerId);
}

export async function endTurn(state: GameState): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.endTurn(state);
}

export async function advancePhase(state: GameState): Promise<RuleResolution> {
  const wasm = await initGameCore();
  return wasm.advancePhase(state);
}

export async function checkVictory(state: GameState): Promise<VictoryState | null> {
  const wasm = await initGameCore();
  return wasm.checkVictory(state);
}

export async function validateState(state: GameState): Promise<void> {
  const wasm = await initGameCore();
  return wasm.validateState(state);
}

export async function computeAiMove(
  state: GameState,
  playerId: number,
  difficulty: AiDifficulty = "normal",
  strategy?: AiStrategy
): Promise<AiDecision> {
  const cacheKey = createAiCacheKey(state, playerId, difficulty, strategy);
  if (aiDecisionCache.has(cacheKey)) {
    const cached = aiDecisionCache.get(cacheKey)!;
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(cached);
    }
    return JSON.parse(JSON.stringify(cached));
  }
  const wasm = await initGameCore();
  const decision = await wasm.computeAiMove(state, playerId, difficulty, strategy);
  aiDecisionCache.set(cacheKey, decision);
  if (aiDecisionCache.size > MAX_AI_CACHE) {
    const firstKey = aiDecisionCache.keys().next().value;
    if (firstKey) {
      aiDecisionCache.delete(firstKey);
    }
  }
  return decision;
}

const createAiCacheKey = (
  state: GameState,
  playerId: number,
  difficulty: AiDifficulty,
  strategy?: AiStrategy
) => {
  const summary = {
    turn: state.turn,
    current: state.current_player,
    phase: state.phase,
    players: state.players.map((player) => ({
      id: player.id,
      health: player.health,
      armor: player.armor,
      mana: player.mana,
      maxMana: player.max_mana,
      hand: player.hand?.map((card) => card.id) ?? [],
      board: player.board?.map((card) => ({ id: card.id, health: card.health, attack: card.attack })) ?? [],
    })),
  };
  return `${playerId}:${difficulty}:${strategy ?? "auto"}:${JSON.stringify(summary)}`;
};

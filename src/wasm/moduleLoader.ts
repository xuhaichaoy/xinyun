import type {
  AiDecision,
  AiDifficulty,
  AiStrategy,
  AttackAction,
  Card,
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

export async function initGameCore() {
  if (!wasmModulePromise) {
    wasmModulePromise = getGlobalCache();
  }

  if (!wasmModulePromise) {
    wasmModulePromise = import("../../rust-core/pkg/wasm_game.js").then(async (module) => {
      await module.default();
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
  const wasm = await initGameCore();
  return wasm.computeAiMove(state, playerId, difficulty, strategy);
}

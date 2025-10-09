import type {
  AiDecision,
  AiDifficulty,
  AiMoveResponse,
  AiStrategy,
  AttackAction,
  DiscardCardAction,
  GameState,
  MulliganAction,
  PlayCardAction,
  RuleResolution,
} from "@/types/domain";
import type { GameEventBus } from "@/events/GameEvents";
import { summarizeResolution, summarizeState } from "@/events/GameEvents";
import { initGameCore, clearWasmCache } from "./moduleLoader";

type WasmModule = Awaited<ReturnType<typeof initGameCore>>;
type WasmGameEngine = InstanceType<WasmModule["GameEngine"]> & { free?: () => void };

export interface GameEngineServiceOptions {
  initialState?: GameState;
  initialStateJson?: string;
  maxRetries?: number;
  retryDelay?: number;
  debugKey?: string | false;
  logger?: Pick<Console, "error" | "warn" | "info" | "debug">;
  eventBus?: GameEventBus;
  retainModuleInstance?: boolean;
  aiDelays?: Partial<Record<AiDifficulty, number>>;
}

export interface ApplyAiOptions {
  difficulty?: AiDifficulty;
  strategy?: AiStrategy;
}

export interface ThinkAiOptions extends ApplyAiOptions {
  delayMs?: number;
}

const DEFAULT_RETRY_DELAY = 300;
const DEFAULT_DEBUG_KEY = "__WASM_GAME_ENGINE__";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (error && typeof error === "object") {
    if ("message" in error) {
      return new Error(String((error as { message: unknown }).message));
    }
    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error(String(error));
    }
  }
  return new Error("Unknown WASM error");
}

function parseJson<T>(json: string, context: string): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    throw new Error(`[GameEngineService] Failed to parse ${context}: ${(error as Error).message}`);
  }
}

export class GameEngineService {
  private readonly module: WasmModule;
  private engine: WasmGameEngine;
  private readonly options: Required<Pick<GameEngineServiceOptions, "maxRetries" | "retryDelay">> &
    Partial<Omit<GameEngineServiceOptions, "maxRetries" | "retryDelay">>;
  private disposed = false;
  private readonly eventBus?: GameEventBus;
  private readonly aiDelays: Record<AiDifficulty, number>;

  private constructor(module: WasmModule, engine: WasmGameEngine, options: GameEngineServiceOptions) {
    const {
      maxRetries = 2,
      retryDelay = DEFAULT_RETRY_DELAY,
      logger = console,
      debugKey = DEFAULT_DEBUG_KEY,
      ...rest
    } = options;

    this.module = module;
    this.engine = engine;
    this.options = { maxRetries, retryDelay, logger, debugKey, ...rest };
    const defaultDelays: Record<AiDifficulty, number> = {
      easy: 0,
      normal: 200,
      hard: 500,
      expert: 800,
    };
    this.aiDelays = {
      ...defaultDelays,
      ...(options.aiDelays ?? {}),
    } as Record<AiDifficulty, number>;
    this.eventBus = options.eventBus;
    this.attachDevtools();
    this.emitStateInitialized();
  }

  public static async create(options: GameEngineServiceOptions = {}): Promise<GameEngineService> {
    const { initialState, initialStateJson } = options;
    const maxRetries = options.maxRetries ?? 2;
    const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        const module = await initGameCore();
        const json = initialStateJson ?? (initialState ? JSON.stringify(initialState) : null);
        const engine = new module.GameEngine(json);
        return new GameEngineService(module, engine, options);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          break;
        }
        await sleep(retryDelay * (attempt + 1));
        attempt += 1;
      }
    }

    throw toError(lastError);
  }

  public dispose() {
    if (this.disposed) {
      return;
    }
    if (typeof this.engine.free === "function") {
      try {
        this.engine.free();
      } catch (error) {
        this.options.logger?.warn?.("[GameEngineService] Failed to free engine", error);
      }
    }
    this.detachDevtools();
    this.eventBus?.emit("service:disposed", {});
    // @ts-expect-error ensure GC
    this.engine = undefined;
    this.disposed = true;

    if (this.options.retainModuleInstance === false) {
      clearWasmCache();
    }
  }

  public getState(): GameState {
    this.assertNotDisposed();
    const json = this.engine.state_json();
    const state = parseJson<GameState>(json, "state_json");
    this.eventBus?.emit("wasm:stateSnapshot", { state });
    return state;
  }

  public setState(state: GameState): void {
    this.assertNotDisposed();
    const json = JSON.stringify(state);
    this.engine.set_state_json(json);
    this.eventBus?.emit("wasm:stateSnapshot", { state });
  }

  public async playCard(action: PlayCardAction): Promise<RuleResolution> {
    return this.withRetry(() => {
      const json = this.engine.play_card_json(JSON.stringify(action));
      return parseJson<RuleResolution>(json, "play_card");
    }, "play_card", { action });
  }

  public async mulligan(action: MulliganAction): Promise<RuleResolution> {
    const payload = {
      ...action,
      replacements: action.replacements ?? [],
    };
    return this.withRetry(() => {
      const json = this.engine.mulligan_json(JSON.stringify(payload));
      return parseJson<RuleResolution>(json, "mulligan");
    }, "mulligan", { action: payload });
  }

  public async attack(action: AttackAction): Promise<RuleResolution> {
    return this.withRetry(() => {
      const json = this.engine.attack_json(JSON.stringify(action));
      return parseJson<RuleResolution>(json, "attack");
    }, "attack", { action });
  }

  public async resolvePendingDiscard(action: DiscardCardAction): Promise<RuleResolution> {
    return this.withRetry(() => {
      const json = this.engine.resolve_discard_json(JSON.stringify(action));
      return parseJson<RuleResolution>(json, "resolve_pending_discard");
    }, "resolve_pending_discard", { action });
  }

  public async startTurn(playerId: number): Promise<RuleResolution> {
    return this.withRetry(() => {
      const json = this.engine.start_turn(playerId);
      return parseJson<RuleResolution>(json, "start_turn");
    }, "start_turn", { playerId });
  }

  public async endTurn(): Promise<RuleResolution> {
    return this.withRetry(() => {
      const json = this.engine.end_turn();
      return parseJson<RuleResolution>(json, "end_turn");
    }, "end_turn");
  }

  public async advancePhase(): Promise<RuleResolution> {
    return this.withRetry(() => {
      const json = this.engine.advance_phase();
      return parseJson<RuleResolution>(json, "advance_phase");
    }, "advance_phase");
  }

  public async applyAiMove(playerId: number, options: ApplyAiOptions = {}): Promise<AiMoveResponse> {
    const response = await this.withRetry(() => {
      const json = this.engine.apply_ai_move(playerId, options.difficulty, options.strategy);
      return parseJson<AiMoveResponse>(json, "apply_ai_move");
    }, "apply_ai_move", { playerId, options });
    this.eventBus?.emit("ai:applied", { response, playerId });
    return response;
  }

  public async thinkAi(playerId: number, options: ThinkAiOptions = {}): Promise<AiDecision> {
    const difficulty = options.difficulty ?? "normal";
    const delay = options.delayMs ?? this.aiDelays[difficulty];
    const decision = await this.withRetry(async () => {
      const json = await this.engine.think_ai(playerId, difficulty, options.strategy, delay);
      return parseJson<AiDecision>(json, "think_ai");
    }, "think_ai_async", { playerId, difficulty, delay });
    this.eventBus?.emit("ai:decision", { decision, playerId });
    return decision;
  }

  public async computeAiMove(
    state: GameState,
    playerId: number,
    options: ApplyAiOptions = {}
  ): Promise<AiDecision> {
    return this.withRetry(() => {
      return this.module.computeAiMove(state, playerId, options.difficulty, options.strategy);
    }, "compute_ai_move", { playerId, options });
  }

  private async withRetry<T>(
    operation: () => Promise<T> | T,
    label: string,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    this.assertNotDisposed();
    const { maxRetries, retryDelay } = this.options;
    let attempt = 0;
    let lastError: Error | null = null;
    const start = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

    while (attempt <= maxRetries) {
      this.eventBus?.emit("wasm:request", { action: label, attempt: attempt + 1, metadata });
      try {
        const result = await Promise.resolve(operation());
        this.logDebug(`${label} succeeded on attempt ${attempt + 1}`);
        const duration =
          (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - start;
        this.eventBus?.emit("wasm:response", {
          action: label,
          attempts: attempt + 1,
          duration,
          metadata,
          resultSummary: this.summarizeResult(result),
        });
        return result;
      } catch (error) {
        lastError = toError(error);
        this.options.logger?.error?.(
          `[GameEngineService] ${label} failed (attempt ${attempt + 1}/${maxRetries + 1})`,
          lastError
        );
        this.eventBus?.emit("wasm:error", {
          action: label,
          attempts: attempt + 1,
          error: lastError,
          metadata,
        });
        if (attempt === maxRetries) {
          break;
        }
        await sleep(retryDelay * (attempt + 1));
        attempt += 1;
      }
    }

    throw lastError ?? new Error(`[GameEngineService] ${label} failed`);
  }

  private attachDevtools() {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
      return;
    }
    const key = this.options.debugKey;
    if (!key) {
      return;
    }
    (window as unknown as Record<string, unknown>)[key] = this;
    this.options.logger?.info?.(`[GameEngineService] Attached to window.${key}`);
  }

  private detachDevtools() {
    if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
      return;
    }
    const key = this.options.debugKey;
    if (!key) {
      return;
    }
    const target = window as unknown as Record<string, unknown>;
    if (target[key] === this) {
      delete target[key];
    }
  }

  private summarizeResult<T>(result: T) {
    if (!result || typeof result !== "object") {
      return result;
    }
    if (isRuleResolution(result)) {
      return summarizeResolution(result);
    }
    if (isGameState(result)) {
      return summarizeState(result);
    }
    return result;
  }

  private emitStateInitialized() {
    try {
      const state = this.getState();
      this.eventBus?.emit("state:initialized", { state });
    } catch {
      this.eventBus?.emit("state:initialized", { state: null });
    }
  }

  private logDebug(message: string) {
    if (process.env.NODE_ENV !== "production") {
      this.options.logger?.debug?.(`[GameEngineService] ${message}`);
    }
  }

  private assertNotDisposed() {
    if (this.disposed) {
      throw new Error("GameEngineService has been disposed");
    }
  }
}

function isRuleResolution(value: unknown): value is RuleResolution {
  return Boolean(
    value &&
      typeof value === "object" &&
      "state" in (value as Record<string, unknown>) &&
      "events" in (value as Record<string, unknown>)
  );
}

function isGameState(value: unknown): value is GameState {
  return Boolean(value && typeof value === "object" && "turn" in (value as Record<string, unknown>));
}

/// <reference types="vite/client" />

import type {
  AiDecision,
  AiDifficulty,
  AiStrategy,
  AttackAction,
  Card,
  EffectContext,
  GameEvent,
  GameState,
  MulliganAction,
  PlayCardAction,
  RuleResolution,
  VictoryState
} from "@/types/domain";

declare module "../../rust-core/pkg/wasm_game.js" {
  export default function init(input?: RequestInfo | URL): Promise<void>;
  export function greet(name: string): string;
  export function createGameState(): GameState;
  export function cloneGameState(state: GameState): GameState;
  export function applyCardEffects(
    state: GameState,
    card: Card,
    context: EffectContext
  ): RuleResolution;
  export function playCard(state: GameState, action: PlayCardAction): RuleResolution;
  export function mulligan(state: GameState, action: MulliganAction): RuleResolution;
  export function attack(state: GameState, action: AttackAction): RuleResolution;
  export function startTurn(state: GameState, playerId: number): RuleResolution;
  export function endTurn(state: GameState): RuleResolution;
  export function advancePhase(state: GameState): RuleResolution;
  export function checkVictory(state: GameState): VictoryState | null;
  export function validateState(state: GameState): void;
  export function computeAiMove(
    state: GameState,
    playerId: number,
    difficulty?: AiDifficulty,
    strategy?: AiStrategy
  ): AiDecision;
  export class GameEngine {
    constructor(initialStateJson?: string | null);
    state_json(): string;
    set_state_json(json: string): void;
    play_card_json(actionJson: string): string;
    mulligan_json(actionJson: string): string;
    attack_json(actionJson: string): string;
    start_turn(playerId: number): string;
    end_turn(): string;
    advance_phase(): string;
    apply_ai_move(
      playerId: number,
      difficulty?: AiDifficulty,
      strategy?: AiStrategy
    ): string;
    think_ai(
      playerId: number,
      difficulty?: AiDifficulty,
      strategy?: AiStrategy,
      delayMs?: number
    ): Promise<string>;
  }
}

declare module "*.wasm" {
  const wasmUrl: string;
  export default wasmUrl;
}

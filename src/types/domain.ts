export type CardId = number;
export type PlayerId = number;
export type CardType = "Unit" | "Spell";

export type EffectTrigger =
  | "OnPlay"
  | "OnDeath"
  | "OnTurnStart"
  | "OnTurnEnd"
  | "OnAttack"
  | "Passive";

export type EffectTarget =
  | { type: "ContextTarget" }
  | { type: "SourcePlayer" }
  | { type: "TargetPlayer" }
  | { type: "OpponentOfSource" };

export type EffectCondition =
  | {
      type: "PlayerHealthBelow";
      target: EffectTarget;
      threshold: number;
    }
  | {
      type: "PlayerManaAtLeast";
      target: EffectTarget;
      amount: number;
    }
  | {
      type: "BoardCountAtLeast";
      target: EffectTarget;
      min: number;
    }
  | { type: "Any"; conditions: EffectCondition[] }
  | { type: "All"; conditions: EffectCondition[] };

export type EffectKind =
  | { type: "DirectDamage"; amount: number; target: EffectTarget }
  | { type: "Heal"; amount: number; target: EffectTarget }
  | { type: "DrawCard"; count: number; target: EffectTarget }
  | { type: "Composite"; effects: EffectKind[] }
  | { type: "Conditional"; condition: EffectCondition; effect: EffectKind };

export type VictoryReason =
  | { type: "HealthDepleted"; loser: PlayerId }
  | { type: "DeckOut"; loser: PlayerId }
  | { type: "Special"; reason: string };

export interface VictoryState {
  winner: PlayerId;
  reason: VictoryReason;
}

export interface CardEffect {
  id: number;
  description: string;
  trigger: EffectTrigger;
  priority: number;
  kind: EffectKind;
  condition?: EffectCondition;
}

export interface Card {
  id: CardId;
  name: string;
  cost: number;
  attack: number;
  health: number;
  card_type: CardType;
  exhausted?: boolean;
  effects?: CardEffect[];
}

export interface EffectContext {
  trigger: EffectTrigger;
  source_player: PlayerId;
  source_card?: CardId;
  target_player?: PlayerId;
  target_card?: CardId;
  current_player: PlayerId;
}

export interface PlayCardAction {
  player_id: PlayerId;
  card_id: CardId;
  target_player?: PlayerId;
  target_card?: CardId;
}

export interface AttackAction {
  attacker_owner: PlayerId;
  attacker_id: CardId;
  defender_owner: PlayerId;
  defender_card?: CardId;
}

export interface MulliganAction {
  player_id: PlayerId;
  replacements?: CardId[];
}

export interface Player {
  id: PlayerId;
  health: number;
  armor: number;
  mana: number;
  max_mana: number;
  hand?: Card[];
  board?: Card[];
  deck?: Card[];
}

export interface PendingDiscard {
  id: number;
  player_id: PlayerId;
  drawn_card: Card;
}

export type GamePhase = "Mulligan" | "Main" | "Combat" | "End";

export type GameEvent =
  | { type: "CardDrawn"; player_id: PlayerId; card_id: CardId }
  | {
      type: "CardPlayed";
      player_id: PlayerId;
      card_id: CardId;
      target_id?: CardId | null;
    }
  | {
      type: "AttackDeclared";
      attacker_owner: PlayerId;
      attacker_id: CardId;
      defender_owner: PlayerId;
      defender_id?: CardId | null;
    }
  | {
      type: "DamageResolved";
      source_player: PlayerId;
      source_card?: CardId;
      target_player: PlayerId;
      target_card?: CardId;
      amount: number;
    }
  | {
      type: "CardHealed";
      player_id: PlayerId;
      card_id?: CardId;
      amount: number;
    }
  | { type: "CardDestroyed"; player_id: PlayerId; card: Card }
  | { type: "CardBurned"; player_id: PlayerId; card: Card }
  | {
      type: "DiscardPending";
      player_id: PlayerId;
      pending_id: number;
      card: Card;
    }
  | { type: "CardDiscarded"; player_id: PlayerId; card: Card }
  | { type: "MulliganApplied"; player_id: PlayerId; replaced: CardId[] }
  | { type: "TurnEnded"; player_id: PlayerId }
  | { type: "GameWon"; winner: PlayerId; reason: VictoryReason };

export interface GameState {
  players: Player[];
  current_player: PlayerId;
  turn: number;
  phase: GamePhase;
  max_hand_size?: number;
  max_board_size?: number;
  mulligan_completed?: PlayerId[];
  pending_discards?: PendingDiscard[];
  event_log?: GameEvent[];
  outcome?: VictoryState;
  version?: number;
  next_pending_discard_id?: number;
}

export interface RuleResolution {
  state: GameState;
  events: GameEvent[];
  victory?: VictoryState | null;
}

export type IntegrityError =
  | { type: "InvalidPlayerIndex"; player_id: PlayerId }
  | { type: "DuplicateCardId"; card_id: CardId }
  | { type: "NegativeHealth"; player_id: PlayerId; value: number }
  | { type: "ManaOutOfRange"; player_id: PlayerId; value: number };

export type RuleError =
  | { type: "GameFinished" }
  | { type: "NotPlayerTurn" }
  | { type: "PlayerNotFound"; player_id: PlayerId }
  | { type: "InvalidPhase"; expected: GamePhase; actual: GamePhase }
  | { type: "CardNotFound"; card_id: CardId }
  | { type: "InvalidTarget" }
  | { type: "InsufficientMana"; required: number; available: number }
  | { type: "CardTypeMismatch"; expected: CardType; actual: CardType }
  | { type: "UnitExhausted"; card_id: CardId }
  | { type: "InvalidAttackTarget" }
  | { type: "AttackerNotFound"; card_id: CardId }
  | { type: "ZeroAttackUnit"; card_id: CardId }
  | { type: "BoardFull" }
  | { type: "MulliganPhaseOnly" }
  | { type: "MulliganAlreadyCompleted"; player_id: PlayerId }
  | { type: "PendingDiscardNotFound"; player_id: PlayerId; pending_id: number }
  | { type: "IntegrityViolation"; error: IntegrityError };

export type GameAction =
  | { type: "PlayCard"; action: PlayCardAction }
  | { type: "Mulligan"; action: MulliganAction }
  | { type: "Attack"; action: AttackAction }
  | { type: "AdvancePhase" }
  | { type: "EndTurn" };

export type AiDifficulty = "easy" | "normal" | "hard" | "expert";

export type AiStrategy =
  | "aggressive"
  | "control"
  | "combo"
  | "random"
  | "adaptive";

export interface AiDecision {
  action?: GameAction | null;
  evaluation: number;
  depth_reached: number;
  nodes: number;
  timed_out: boolean;
  duration_ms: number;
  resolution?: RuleResolution | null;
  strategy: AiStrategy;
}

export interface AiMoveResponse {
  decision: AiDecision;
  applied?: RuleResolution | null;
}

export type ControlScheme = "touch" | "keyboard" | "auto";

export interface GameSettings {
  soundEnabled: boolean;
  volume: number; // 0 - 1 range
  graphicsQuality: "low" | "medium" | "high";
  aiDifficulty: AiDifficulty;
  controlScheme: ControlScheme;
}

export interface PlayerProgress {
  unlockedLevels: number[];
  achievements: string[];
  lastCompletedLevel?: number;
  playTimeSeconds: number;
}

export interface SaveSlot {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  progress: PlayerProgress;
  settings: GameSettings;
}

export interface BackupEntry {
  id: string;
  slotId: string;
  createdAt: string;
  note?: string;
  data: SaveSlot;
}

export interface SaveState {
  version: number;
  activeSlotId: string | null;
  slots: SaveSlot[];
  backups: BackupEntry[];
}

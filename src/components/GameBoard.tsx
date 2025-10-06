import { memo, useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { CSSProperties } from "react";

import type { Card, GameEvent, GamePhase } from "@/types/domain";
import type { UseGameStateResult } from "@/hooks/useGameState";

import { ActionPanel } from "./ActionPanel";
import { GameLog } from "./GameLog";
import { EventDebugger } from "./EventDebugger";
import { CardSummary } from "./CardSummary";
import type { ScenarioGuide } from "@/data/scenarios";
import {
  getCardDefinition,
  type CardDefinition,
  type CardTargetSide,
} from "@/data/cards";

const BOARD_SLOT_COUNT = 7;
type StagePlayer = NonNullable<UseGameStateResult["state"]>["players"][number];

interface GameBoardProps {
  gameStateHook: UseGameStateResult;
  scenarioGuide?: ScenarioGuide & {
    name: string;
    summary: string;
    keyCardDetails: CardDefinition[];
  };
}

export const GameBoard = ({ gameStateHook, scenarioGuide }: GameBoardProps) => {
  const {
    state,
    events,
    startTurn,
    endTurn,
    updateMode,
    setUpdateMode,
    isMutating,
    error,
    clearEvents,
    reload,
    playCard,
    mulligan,
    attack,
    advancePhase,
  } = gameStateHook;

  const [player, opponent] = useMemo(() => {
    const currentPlayers = state?.players ?? [];
    return [currentPlayers[0], currentPlayers[1]];
  }, [state?.players]);

  const handSize = useMemo(() => player?.hand?.length ?? 0, [player]);
  const opponentHandSize = useMemo(
    () => opponent?.hand?.length ?? 0,
    [opponent]
  );
  const isPlayerTurn = useMemo(
    () => (state && player ? state.current_player === player.id : false),
    [player, state]
  );

  const isMulliganPhase = state?.phase === "Mulligan";
  const playerHasCompletedMulligan = useMemo(() => {
    if (!state || !player) {
      return false;
    }
    return (state.mulligan_completed ?? []).includes(player.id);
  }, [player, state]);

  const opponentHasCompletedMulligan = useMemo(() => {
    if (!state || !opponent) {
      return false;
    }
    return (state.mulligan_completed ?? []).includes(opponent.id);
  }, [opponent, state]);

  const ensurePhase = useCallback(
    async (targetPhase: GamePhase) => {
      if (!state || state.phase === targetPhase) {
        return;
      }

      // 如果游戏已经结束，不要尝试推进阶段
      if (state.outcome) {
        return;
      }

      const visited = new Set<GamePhase>();
      let currentPhase = state.phase;
      while (currentPhase !== targetPhase) {
        if (visited.has(currentPhase)) {
          throw new Error("无法进入目标阶段");
        }
        visited.add(currentPhase);
        try {
          const resolution = await advancePhase();
          currentPhase = resolution.state.phase;
        } catch (err) {
          // 如果游戏结束，停止推进阶段
          if (err instanceof Error && err.message.includes("GameFinished")) {
            return;
          }
          throw err;
        }
      }
    },
    [advancePhase, state]
  );

  const [showSettings, setShowSettings] = useState(false);
  const [mulliganSelection, setMulliganSelection] = useState<Set<number>>(
    new Set()
  );
  const [selectedAttacker, setSelectedAttacker] = useState<Card | null>(null);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(
    null
  );
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(
    null
  );

  const toggleSettings = useCallback(
    () => setShowSettings((prev) => !prev),
    []
  );

  const resetSelections = useCallback(() => {
    setSelectedAttacker(null);
  }, []);

  // 移除复杂的requestStartTurn逻辑，让endTurn直接处理回合转换

  useEffect(() => {
    if (!isMulliganPhase) {
      setMulliganSelection(new Set());
      return;
    }
    if (playerHasCompletedMulligan && !opponentHasCompletedMulligan) {
      setInteractionMessage("等待对手完成调度…");
    }
  }, [
    isMulliganPhase,
    opponentHasCompletedMulligan,
    playerHasCompletedMulligan,
  ]);

  useEffect(() => {
    if (isMulliganPhase && playerHasCompletedMulligan) {
      setMulliganSelection(new Set());
    }
  }, [isMulliganPhase, playerHasCompletedMulligan]);

  useEffect(() => {
    if (!isMulliganPhase || playerHasCompletedMulligan) {
      return;
    }
    setInteractionMessage((prev) =>
      prev && !prev.includes("等待") ? prev : "选择想要替换的起手牌并确认"
    );
  }, [isMulliganPhase, playerHasCompletedMulligan]);

  const handleEndTurn = useCallback(async () => {
    if (!player || !opponent || !state) {
      return;
    }
    if (isMulliganPhase && !playerHasCompletedMulligan) {
      setInteractionMessage("调度阶段无法结束回合");
      return;
    }
    try {
      await ensurePhase("End");
      await endTurn(); // endTurn现在会直接处理回合转换
      setInteractionMessage("等待对手行动…");
    } catch (err) {
      setInteractionMessage(err instanceof Error ? err.message : String(err));
    }
  }, [
    ensurePhase,
    endTurn,
    isMulliganPhase,
    player,
    playerHasCompletedMulligan,
    opponent,
    state,
  ]);

  useEffect(() => {
    if (!isPlayerTurn) {
      resetSelections();
    }
  }, [isPlayerTurn, resetSelections]);

  // 移除复杂的回合管理effect，现在由endTurn直接处理

  const computeTargetOptions = useCallback(
    (
      side: CardTargetSide,
      playerEntity: StagePlayer,
      opponentEntity: StagePlayer
    ): TargetOptionsResult => {
      const selections: TargetSelection[] = [];
      const pushHero = (owner: StagePlayer, label: string) => {
        selections.push({ type: "hero", ownerId: owner.id, label });
      };

      if (side === "none") {
        return {
          requiresSelection: false,
          selections: [],
          autoSelection: undefined,
        };
      }

      if (side === "ally" || side === "self") {
        pushHero(playerEntity, "己方英雄");
        playerEntity.board?.forEach((card) => {
          selections.push({
            type: "card",
            ownerId: playerEntity.id,
            card,
            label: card.name,
          });
        });
      }

      if (side === "enemy") {
        pushHero(opponentEntity, "敌方英雄");
        opponentEntity.board?.forEach((card) => {
          selections.push({
            type: "card",
            ownerId: opponentEntity.id,
            card,
            label: card.name,
          });
        });
      }

      if (side === "any") {
        pushHero(opponentEntity, "敌方英雄");
        opponentEntity.board?.forEach((card) => {
          selections.push({
            type: "card",
            ownerId: opponentEntity.id,
            card,
            label: card.name,
          });
        });
        pushHero(playerEntity, "己方英雄");
        playerEntity.board?.forEach((card) => {
          selections.push({
            type: "card",
            ownerId: playerEntity.id,
            card,
            label: card.name,
          });
        });
      }

      const auto = selections.length === 1 ? selections[0] : undefined;
      return {
        requiresSelection: selections.length > 1,
        selections,
        autoSelection: auto,
      };
    },
    []
  );

  const buildPlayPayload = useCallback(
    (
      card: Card,
      playerId: number,
      opponentId: number,
      targetPlayer?: number,
      targetCard?: number
    ) => {
      return {
        player_id: playerId,
        card_id: card.id,
        target_player: targetPlayer,
        target_card: targetCard,
      };
    },
    []
  );

  const handlePlayCard = useCallback(
    (card: Card) => {
      if (!player || !opponent || !isPlayerTurn || isMutating) {
        return;
      }
      resetSelections();
      if (isMulliganPhase && !playerHasCompletedMulligan) {
        setInteractionMessage("请先完成调度阶段");
        return;
      }
      if (player.mana < card.cost) {
        setInteractionMessage(`法力不足，当前 ${player.mana}/${card.cost}`);
        return;
      }
      const definition = getCardDefinition(card.id);
      const targetSide: CardTargetSide =
        card.card_type === "Spell" ? definition?.target ?? "enemy" : "none";
      const options = computeTargetOptions(
        targetSide,
        player as StagePlayer,
        opponent as StagePlayer
      );
      if (options.requiresSelection) {
        setPendingTarget({ card, targetSide, options: options.selections });
        setInteractionMessage("请选择目标");
        return;
      }
      const selection = options.autoSelection;
      const targetPlayer = selection?.ownerId;
      const targetCardId = selection?.card?.id;
      const executePlay = async () => {
        try {
          await ensurePhase("Main");
          setInteractionMessage(null);
          await playCard(
            buildPlayPayload(
              card,
              player.id,
              opponent.id,
              targetPlayer,
              targetCardId
            )
          );
          setInteractionMessage(`已出牌：${card.name}`);
        } catch (err) {
          let message = err instanceof Error ? err.message : String(err);

          // 处理特定的游戏规则错误
          if (message.includes("InsufficientMana")) {
            message = `法力不足，需要 ${card.cost} 点法力`;
          } else if (message.includes("InvalidPhase")) {
            message = "当前阶段不允许出牌";
          } else if (message.includes("NotPlayerTurn")) {
            message = "现在不是你的回合";
          } else if (message.includes("BoardFull")) {
            message = "战场已满，无法召唤更多随从";
          } else if (message.includes("CardNotFound")) {
            message = "卡牌不存在或已被移除";
          }

          setInteractionMessage(message);
        }
      };

      void executePlay();
    },
    [
      computeTargetOptions,
      ensurePhase,
      playCard,
      isMutating,
      isMulliganPhase,
      playerHasCompletedMulligan,
      isPlayerTurn,
      opponent,
      player,
      resetSelections,
    ]
  );

  const applyMulligan = useCallback(
    async (replacements: number[]) => {
      if (
        !player ||
        !isMulliganPhase ||
        playerHasCompletedMulligan ||
        isMutating
      ) {
        return;
      }
      try {
        setInteractionMessage(
          replacements.length > 0 ? "重新发牌中…" : "保留全部手牌"
        );
        await mulligan({ player_id: player.id, replacements });
        setMulliganSelection(new Set());
        if (replacements.length > 0) {
          setInteractionMessage("已替换所选手牌");
        } else {
          setInteractionMessage("保留全部手牌");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        let display = message;
        if (message.includes("MulliganAlreadyCompleted")) {
          display = "本方调度已完成";
        } else if (message.includes("MulliganPhaseOnly")) {
          display = "该操作仅允许在调度阶段执行";
        }
        setInteractionMessage(display);
      }
    },
    [isMulliganPhase, isMutating, mulligan, player, playerHasCompletedMulligan]
  );

  const handleConfirmMulligan = useCallback(() => {
    void applyMulligan(Array.from(mulliganSelection));
  }, [applyMulligan, mulliganSelection]);

  const handleSkipMulligan = useCallback(() => {
    void applyMulligan([]);
  }, [applyMulligan]);

  const handleToggleMulliganCard = useCallback(
    (card: Card) => {
      if (!isMulliganPhase || playerHasCompletedMulligan || isMutating) {
        return;
      }
      setMulliganSelection((prev) => {
        const next = new Set(prev);
        if (next.has(card.id)) {
          next.delete(card.id);
        } else {
          next.add(card.id);
        }
        return next;
      });
    },
    [isMulliganPhase, isMutating, playerHasCompletedMulligan]
  );

  const handleSelectAttacker = useCallback(
    (card: Card) => {
      if (!player || !isPlayerTurn || isMutating || isMulliganPhase) {
        return;
      }
      if (card.exhausted) {
        setInteractionMessage(`${card.name} 已经攻击过了`);
        return;
      }
      setInteractionMessage(null);
      setSelectedAttacker((prev) =>
        prev && prev.id === card.id ? null : card
      );
    },
    [isMutating, isMulliganPhase, isPlayerTurn, player]
  );

  const handleAttackTarget = useCallback(
    (target: { ownerId: number; card?: Card } | null) => {
      if (
        !player ||
        !opponent ||
        !selectedAttacker ||
        !isPlayerTurn ||
        isMulliganPhase ||
        isMutating
      ) {
        return;
      }
      if (!target) {
        return;
      }

      const executeAttack = async () => {
        if (selectedAttacker.exhausted) {
          setInteractionMessage(`${selectedAttacker.name} 已经攻击过了`);
          resetSelections();
          return;
        }

        try {
          await ensurePhase("Combat");
          setInteractionMessage(null);
          await attack({
            attacker_owner: player.id,
            attacker_id: selectedAttacker.id,
            defender_owner: target.ownerId,
            defender_card: target.card?.id,
          });
          setInteractionMessage(
            target.card ? `攻击目标卡牌 #${target.card.id}` : "攻击敌方英雄"
          );
          resetSelections();
        } catch (err) {
          let message = err instanceof Error ? err.message : String(err);

          // 处理特定的游戏规则错误
          if (message.includes("UnitExhausted")) {
            message = `${selectedAttacker.name} 已经攻击过了，无法再次攻击`;
            resetSelections();
          } else if (message.includes("InvalidPhase")) {
            message = "当前阶段不允许攻击";
          } else if (message.includes("NotPlayerTurn")) {
            message = "现在不是你的回合";
          }

          setInteractionMessage(message);
        }
      };

      void executeAttack();
    },
    [
      advancePhase,
      attack,
      isMutating,
      isMulliganPhase,
      isPlayerTurn,
      opponent,
      player,
      resetSelections,
      selectedAttacker,
    ]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        void handleEndTurn();
      } else if (event.key === "Escape") {
        event.preventDefault();
        toggleSettings();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleEndTurn, toggleSettings]);

  if (!state || !player || !opponent) {
    return (
      <div className="game-app">
        <p>正在初始化游戏状态…</p>
      </div>
    );
  }

  const playerBoard = player.board ?? [];
  const opponentBoard = opponent.board ?? [];
  const playerHand = player.hand ?? [];
  const canInteract = !isMulliganPhase || playerHasCompletedMulligan;

  return (
    <div className="game-app">
      <section className="game-board" role="application" aria-label="卡牌对战">
        <div className="battle-layout">
          <aside className="battle-layout__sidebar battle-layout__sidebar--left">
            <QuickStats
              turn={state.turn}
              phase={state.phase}
              events={events}
              guide={scenarioGuide}
            />
            {scenarioGuide && <ScenarioGuidePanel guide={scenarioGuide} />}
            {import.meta.env.DEV && <EventDebugger limit={12} />}
          </aside>

          <div className="battle-layout__main">
            <MatchSummary
              player={player}
              opponent={opponent}
              turn={state.turn}
              phase={state.phase}
              currentPlayerId={state.current_player}
              handSize={handSize}
              opponentHandSize={opponentHandSize}
            />
            <Stage
              player={player}
              opponent={opponent}
              isPlayerTurn={isPlayerTurn}
              selectedAttacker={selectedAttacker}
              playerBoard={playerBoard}
              opponentBoard={opponentBoard}
              interactionMessage={interactionMessage}
              error={error}
              events={events}
              isMutating={isMutating}
              guide={scenarioGuide}
              phase={state.phase}
              canInteract={canInteract}
              isMulliganPhase={isMulliganPhase}
              playerHasCompletedMulligan={playerHasCompletedMulligan}
              opponentHasCompletedMulligan={opponentHasCompletedMulligan}
              mulliganSelectionCount={mulliganSelection.size}
              onSelectAttacker={handleSelectAttacker}
              onAttackTarget={handleAttackTarget}
              onAttackHero={() => handleAttackTarget({ ownerId: opponent.id })}
            />
            <HandZone
              cards={playerHand}
              disabled={!isPlayerTurn || isMutating || !canInteract}
              onPlayCard={handlePlayCard}
              playerMana={player.mana}
            />
          </div>

          <aside className="battle-layout__sidebar battle-layout__sidebar--right">
            <div className="sidebar-panel sidebar-panel--actions">
              <ActionPanel
                onEndTurn={handleEndTurn}
                onSettings={toggleSettings}
                disabled={isMutating || !canInteract}
              />
            </div>
            <div className="sidebar-panel">
              <GameLog events={events} />
            </div>
          </aside>
        </div>
      </section>

      {showSettings && (
        <SettingsOverlay
          onClose={() => setShowSettings(false)}
          updateMode={updateMode}
          setUpdateMode={setUpdateMode}
          clearEvents={clearEvents}
          reload={reload}
        />
      )}
      {pendingTarget && (
        <TargetOverlay
          request={pendingTarget}
          onClose={() => setPendingTarget(null)}
          onSelect={(selection) => {
            if (!player || !opponent) {
              setPendingTarget(null);
              return;
            }
            const payload = buildPlayPayload(
              pendingTarget.card,
              player?.id ?? 0,
              opponent?.id ?? 1,
              selection.ownerId,
              selection.card?.id
            );
            void ensurePhase("Main")
              .then(() => playCard(payload))
              .then(() => {
                setInteractionMessage(
                  `已对 ${selection.label} 使用 ${pendingTarget.card.name}`
                );
                setPendingTarget(null);
              })
              .catch((err) => {
                let message = err instanceof Error ? err.message : String(err);

                // 处理特定的游戏规则错误
                if (message.includes("InsufficientMana")) {
                  message = `法力不足，需要 ${pendingTarget.card.cost} 点法力`;
                } else if (message.includes("InvalidPhase")) {
                  message = "当前阶段不允许出牌";
                } else if (message.includes("NotPlayerTurn")) {
                  message = "现在不是你的回合";
                } else if (message.includes("CardNotFound")) {
                  message = "卡牌不存在或已被移除";
                } else if (message.includes("InvalidTarget")) {
                  message = "无效的目标选择";
                }

                setInteractionMessage(message);
                setPendingTarget(null);
              });
          }}
        />
      )}
      {isMulliganPhase && !playerHasCompletedMulligan && (
        <MulliganOverlay
          cards={playerHand}
          selection={mulliganSelection}
          onToggle={handleToggleMulliganCard}
          onConfirm={handleConfirmMulligan}
          onSkip={handleSkipMulligan}
          maxHandSize={state.max_hand_size ?? 10}
          disabled={isMutating}
        />
      )}
    </div>
  );
};

interface PendingTarget {
  card: Card;
  targetSide: CardTargetSide;
  options: TargetSelection[];
}

interface TargetSelection {
  type: "hero" | "card";
  ownerId: number;
  card?: Card;
  label: string;
}

interface TargetOptionsResult {
  requiresSelection: boolean;
  selections: TargetSelection[];
  autoSelection?: TargetSelection;
}

interface TargetOverlayProps {
  request: PendingTarget;
  onSelect: (selection: TargetSelection) => void;
  onClose: () => void;
}

const TargetOverlay = ({ request, onSelect, onClose }: TargetOverlayProps) => {
  const definition = getCardDefinition(request.card.id);
  return (
    <div className="target-overlay" role="dialog" aria-modal="true">
      <div className="target-overlay__panel">
        <header>
          <h3>选择目标</h3>
          <p>{request.card.name}</p>
          {definition?.ability && <small>{definition.ability}</small>}
        </header>
        <div className="target-overlay__options">
          {request.options.map((option, index) => (
            <button
              key={`${option.ownerId}-${option.card?.id ?? index}`}
              type="button"
              className="target-overlay__option"
              onClick={() => onSelect(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <footer>
          <button
            type="button"
            className="target-overlay__cancel"
            onClick={onClose}
          >
            取消
          </button>
        </footer>
      </div>
    </div>
  );
};

interface MulliganOverlayProps {
  cards: Card[];
  selection: Set<number>;
  onToggle: (card: Card) => void;
  onConfirm: () => void;
  onSkip: () => void;
  maxHandSize: number;
  disabled: boolean;
}

const MulliganOverlay = ({
  cards,
  selection,
  onToggle,
  onConfirm,
  onSkip,
  maxHandSize,
  disabled,
}: MulliganOverlayProps) => {
  return (
    <div className="mulligan-overlay" role="dialog" aria-modal="true">
      <div className="mulligan-overlay__panel">
        <header className="mulligan-overlay__header">
          <h3>调度起手</h3>
          <p>选择想要替换的手牌（当前最多 {maxHandSize} 张）。</p>
        </header>
        <div className="mulligan-overlay__cards">
          {cards.map((card) => (
            <CardSummary
              key={card.id}
              card={card}
              variant="hand"
              selected={selection.has(card.id)}
              disabled={disabled}
              onClick={() => !disabled && onToggle(card)}
              playerMana={99}
            />
          ))}
        </div>
        <p className="mulligan-overlay__note">已选择 {selection.size} 张</p>
        <footer className="mulligan-overlay__actions">
          <button
            type="button"
            className="mulligan-overlay__button mulligan-overlay__button--primary"
            onClick={onConfirm}
            disabled={disabled}
          >
            确认换牌
          </button>
          <button
            type="button"
            className="mulligan-overlay__button"
            onClick={onSkip}
            disabled={disabled}
          >
            保留全部
          </button>
        </footer>
      </div>
    </div>
  );
};

interface MatchSummaryProps {
  player: NonNullable<UseGameStateResult["state"]>["players"][number];
  opponent: NonNullable<UseGameStateResult["state"]>["players"][number];
  turn: number;
  phase: GamePhase;
  currentPlayerId: number;
  handSize: number;
  opponentHandSize: number;
}

const MatchSummary = ({
  player,
  opponent,
  turn,
  phase,
  currentPlayerId,
  handSize,
  opponentHandSize,
}: MatchSummaryProps) => (
  <div className="match-summary" aria-label="对战概况">
    <MatchSummaryPlayer
      player={opponent}
      label="对手"
      active={currentPlayerId === opponent.id}
      handSize={opponentHandSize}
    />
    <div className="match-summary__state">
      <span>回合 {turn}</span>
      <span>阶段 {phase}</span>
    </div>
    <MatchSummaryPlayer
      player={player}
      label="你"
      active={currentPlayerId === player.id}
      handSize={handSize}
    />
  </div>
);

interface MatchSummaryPlayerProps {
  player: NonNullable<UseGameStateResult["state"]>["players"][number];
  label: string;
  active: boolean;
  handSize: number;
}

const MatchSummaryPlayer = ({
  player,
  label,
  active,
  handSize,
}: MatchSummaryPlayerProps) => (
  <div className="match-summary__player" data-active={active}>
    <span className="match-summary__label">
      {label} #{player.id}
    </span>
    <span>❤ {player.health}</span>
    <span>🛡 {player.armor}</span>
    <span>🔷 {player.mana}</span>
    <span>🂠 {player.deck?.length ?? 0}</span>
    <span>🂡 {handSize}</span>
  </div>
);

interface StageProps {
  player: NonNullable<UseGameStateResult["state"]>["players"][number];
  opponent: NonNullable<UseGameStateResult["state"]>["players"][number];
  isPlayerTurn: boolean;
  selectedAttacker: Card | null;
  playerBoard: Card[];
  opponentBoard: Card[];
  interactionMessage: string | null;
  error: Error | null;
  events: GameEvent[];
  isMutating: boolean;
  phase: GamePhase;
  canInteract: boolean;
  isMulliganPhase: boolean;
  playerHasCompletedMulligan: boolean;
  opponentHasCompletedMulligan: boolean;
  mulliganSelectionCount: number;
  guide?: ScenarioGuide & {
    keyCardDetails: CardDefinition[];
    name: string;
    summary: string;
  };
  onSelectAttacker: (card: Card) => void;
  onAttackTarget: (target: { ownerId: number; card?: Card } | null) => void;
  onAttackHero: () => void;
}

const Stage = memo((props: StageProps) => {
  const {
    player,
    opponent,
    isPlayerTurn,
    selectedAttacker,
    playerBoard,
    opponentBoard,
    interactionMessage,
    error,
    events,
    isMutating,
    phase,
    canInteract,
    isMulliganPhase,
    playerHasCompletedMulligan,
    opponentHasCompletedMulligan,
    mulliganSelectionCount,
    onSelectAttacker,
    onAttackTarget,
    onAttackHero,
    guide,
  } = props;

  return (
    <div className="stage" aria-label="战场">
      <div className="stage__board stage__board--top">
        <HeroBadge player={opponent} position="top" active={!isPlayerTurn} />
        <BoardLane
          cards={opponentBoard}
          ownerId={opponent.id}
          variant="opponent"
          disabled={
            !selectedAttacker || isMutating || !isPlayerTurn || !canInteract
          }
          onCardClick={(card) => onAttackTarget({ ownerId: opponent.id, card })}
        />
      </div>

      <ActionBanner
        selectedAttacker={selectedAttacker}
        interactionMessage={interactionMessage}
        error={error}
        events={events}
        canAttackHero={
          Boolean(selectedAttacker) &&
          !isMutating &&
          isPlayerTurn &&
          canInteract
        }
        onAttackHero={onAttackHero}
        onCancelSelection={() =>
          selectedAttacker && onSelectAttacker(selectedAttacker)
        }
        guide={guide}
        phase={phase}
        isMulliganPhase={isMulliganPhase}
        playerHasCompletedMulligan={playerHasCompletedMulligan}
        opponentHasCompletedMulligan={opponentHasCompletedMulligan}
        mulliganSelectionCount={mulliganSelectionCount}
      />

      <div className="stage__board stage__board--bottom">
        <BoardLane
          cards={playerBoard}
          ownerId={player.id}
          variant="player"
          selectedCardId={selectedAttacker?.id ?? null}
          disabled={!isPlayerTurn || isMutating || !canInteract}
          onCardClick={onSelectAttacker}
        />
        <HeroBadge player={player} position="bottom" active={isPlayerTurn} />
      </div>
    </div>
  );
});

Stage.displayName = "Stage";

interface BoardLaneProps {
  cards: Card[];
  ownerId: number;
  variant: "player" | "opponent";
  onCardClick: (card: Card) => void;
  disabled: boolean;
  selectedCardId?: number | null;
}

const BoardLane = ({
  cards,
  ownerId,
  variant,
  onCardClick,
  disabled,
  selectedCardId,
}: BoardLaneProps) => {
  return (
    <div
      className="board-lane"
      data-variant={variant}
      aria-label={variant === "player" ? "己方战场" : "对手战场"}
    >
      {cards.map((card) => (
        <CardSummary
          key={card.id}
          card={card}
          variant={variant === "player" ? "board-player" : "board-opponent"}
          selected={selectedCardId === card.id}
          disabled={disabled}
          onClick={() => onCardClick(card)}
        />
      ))}
      {cards.length < BOARD_SLOT_COUNT &&
        Array.from({ length: BOARD_SLOT_COUNT - cards.length }).map(
          (_, index) => <BoardSlot key={`${ownerId}-slot-${index}`} />
        )}
    </div>
  );
};

const BoardSlot = () => <div className="board-slot" aria-hidden />;

interface HeroBadgeProps {
  player: NonNullable<UseGameStateResult["state"]>["players"][number];
  position: "top" | "bottom";
  active: boolean;
}

const HeroBadge = ({ player, position, active }: HeroBadgeProps) => (
  <div className="hero-badge" data-position={position} data-active={active}>
    <div className="hero-badge__avatar" aria-hidden>
      <span>{position === "top" ? "敌" : "我"}</span>
    </div>
    <div className="hero-badge__info">
      <strong>#{player.id}</strong>
      <div>
        <span>❤ {player.health}</span>
        <span>🛡 {player.armor}</span>
        <span>🔷 {player.mana}</span>
        <span>🃏 {player.deck?.length ?? 0}</span>
      </div>
    </div>
  </div>
);

interface ActionBannerProps {
  selectedAttacker: Card | null;
  interactionMessage: string | null;
  error: Error | null;
  events: GameEvent[];
  canAttackHero: boolean;
  onAttackHero: () => void;
  onCancelSelection: () => void;
  guide?: ScenarioGuide & {
    name: string;
    summary: string;
    keyCardDetails: CardDefinition[];
  };
  phase: GamePhase;
  isMulliganPhase: boolean;
  playerHasCompletedMulligan: boolean;
  opponentHasCompletedMulligan: boolean;
  mulliganSelectionCount: number;
}

const ActionBanner = ({
  selectedAttacker,
  interactionMessage,
  error,
  events,
  canAttackHero,
  onAttackHero,
  onCancelSelection,
  guide,
  phase,
  isMulliganPhase,
  playerHasCompletedMulligan,
  opponentHasCompletedMulligan,
  mulliganSelectionCount,
}: ActionBannerProps) => {
  const phaseLabelMap: Record<GamePhase, string> = {
    Mulligan: "调度阶段",
    Main: "主阶段",
    Combat: "战斗阶段",
    End: "结束阶段",
  };
  const phaseLabel = phaseLabelMap[phase] ?? phase;
  const recentEvents =
    events
      .slice(-3)
      .map((event) => event.type)
      .join(" · ") || "无";

  if (isMulliganPhase) {
    const waitingForOpponent =
      playerHasCompletedMulligan && !opponentHasCompletedMulligan;
    return (
      <div className="battlefield__banner">
        <strong>{guide?.title ?? "起手调度"}</strong>
        {guide && <p className="battlefield__objective">{guide.objective}</p>}
        <p className="battlefield__phase-info">当前阶段：{phaseLabel}</p>
        {!playerHasCompletedMulligan ? (
          <p>
            请选择想要替换的卡牌，当前已选择
            <span className="battlefield__highlight">
              {" "}
              {mulliganSelectionCount}{" "}
            </span>
            张。完成选择后，请在弹出的窗口中确认换牌或保留全部。
          </p>
        ) : (
          <p>
            {waitingForOpponent
              ? "调度已提交，正在等待对手…"
              : "调度完成，等待进入主阶段"}
          </p>
        )}
        {interactionMessage && (
          <p className="battlefield__info">{interactionMessage}</p>
        )}
        {error && <p className="battlefield__error">{error.message}</p>}
        <p className="battlefield__events">最近事件：{recentEvents}</p>
      </div>
    );
  }

  return (
    <div className="battlefield__banner">
      <strong>{guide?.title ?? "作战指引"}</strong>
      {guide && <p className="battlefield__objective">{guide.objective}</p>}
      <p className="battlefield__phase-info">当前阶段：{phaseLabel}</p>
      {selectedAttacker ? (
        <p>
          当前选择：
          <span className="battlefield__highlight">
            {selectedAttacker.name}
          </span>{" "}
          · 选择攻击目标或点击英雄键。
        </p>
      ) : (
        <p>从手牌中选择卡牌或点击己方随从发起攻击。</p>
      )}
      {interactionMessage && (
        <p className="battlefield__info">{interactionMessage}</p>
      )}
      {error && <p className="battlefield__error">{error.message}</p>}
      <p className="battlefield__events">最近事件：{recentEvents}</p>
      <div className="battlefield__actions">
        <button
          type="button"
          className="battlefield__action"
          disabled={!canAttackHero}
          onClick={onAttackHero}
        >
          攻击敌方英雄
        </button>
        <button
          type="button"
          className="battlefield__action"
          disabled={!selectedAttacker}
          onClick={onCancelSelection}
        >
          取消选择
        </button>
      </div>
    </div>
  );
};

interface HandZoneProps {
  cards: Card[];
  disabled: boolean;
  onPlayCard: (card: Card) => void;
  playerMana: number;
}

const HandZone = ({
  cards,
  disabled,
  onPlayCard,
  playerMana,
}: HandZoneProps) => {
  const handGeometry = useMemo(() => {
    const total = cards.length;
    if (total === 0) {
      return [] as Array<{ angle: number; offsetX: number }>;
    }
    const angleSpread = Math.min(70, Math.max(16, total * 12));
    const translateSpread = Math.min(180, total * 24);
    if (total === 1) {
      return [{ angle: 0, offsetX: 0 }];
    }
    const angleStart = -angleSpread / 2;
    const angleStep = angleSpread / (total - 1);
    const translateStart = -translateSpread / 2;
    const translateStep = translateSpread / (total - 1);
    return Array.from({ length: total }, (_, index) => ({
      angle: angleStart + index * angleStep,
      offsetX: translateStart + index * translateStep,
    }));
  }, [cards]);

  return (
    <div className="hand-zone" aria-label="手牌">
      {cards.length === 0 ? (
        <div className="hand-zone__empty">等待抽牌…</div>
      ) : (
        <div className="hand-zone__fan">
          {cards.map((card, index) => (
            <div
              key={card.id}
              className="hand-zone__card"
              style={
                {
                  "--hand-angle": `${handGeometry[index].angle}deg`,
                  "--hand-offset": `${
                    Math.abs(handGeometry[index].angle) * 0.12
                  }rem`,
                  "--hand-translate": `${handGeometry[index].offsetX}px`,
                } as CSSProperties
              }
            >
              <CardSummary
                card={card}
                variant="hand"
                disabled={disabled}
                playerMana={playerMana}
                onClick={() => !disabled && onPlayCard(card)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface QuickStatsProps {
  turn: number;
  phase: GamePhase;
  events: GameEvent[];
  guide?: ScenarioGuide;
}

const QuickStats = ({ turn, phase, events, guide }: QuickStatsProps) => {
  const lastEvent =
    events.length > 0 ? events[events.length - 1]?.type : undefined;
  return (
    <div className="quick-stats" aria-label="战况摘要">
      <h3>战况</h3>
      <span>回合 {turn}</span>
      <span>阶段 {phase}</span>
      <span>事件 {events.length}</span>
      <span>最近：{lastEvent ?? "无"}</span>
      {guide && <span>任务：{guide.title}</span>}
    </div>
  );
};

interface ScenarioGuidePanelProps {
  guide: ScenarioGuide & {
    name: string;
    summary: string;
    keyCardDetails: CardDefinition[];
  };
}

const ScenarioGuidePanel = ({ guide }: ScenarioGuidePanelProps) => (
  <section className="guide-panel" aria-label="关卡指引">
    <header>
      <h3>{guide.name}</h3>
      <p>{guide.summary}</p>
    </header>
    <div className="guide-panel__objective">
      <strong>目标</strong>
      <p>{guide.objective}</p>
    </div>
    {guide.keyCardDetails.length > 0 && (
      <div className="guide-panel__cards" aria-label="关键卡牌">
        {guide.keyCardDetails.map((card) => (
          <span key={card.slug}>{card.name}</span>
        ))}
      </div>
    )}
    {guide.tips.length > 0 && (
      <ul className="guide-panel__tips">
        {guide.tips.map((tip, index) => (
          <li key={index}>{tip}</li>
        ))}
      </ul>
    )}
  </section>
);

interface SettingsOverlayProps {
  onClose: () => void;
  updateMode: "replace" | "incremental";
  setUpdateMode: (mode: "replace" | "incremental") => void;
  clearEvents: () => void;
  reload: () => Promise<void>;
}

const SettingsOverlay = ({
  onClose,
  updateMode,
  setUpdateMode,
  clearEvents,
  reload,
}: SettingsOverlayProps) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.72)",
      display: "grid",
      placeItems: "center",
      zIndex: 50,
    }}
    role="dialog"
    aria-modal="true"
    aria-label="高级设置"
  >
    <div
      style={{
        width: "min(420px, 90vw)",
        background: "rgba(2, 6, 23, 0.95)",
        borderRadius: 20,
        border: "1px solid rgba(148,163,184,0.35)",
        padding: 24,
        display: "grid",
        gap: 16,
      }}
    >
      <h2 style={{ margin: 0 }}>调试设置</h2>
      <fieldset
        style={{ border: "none", padding: 0, display: "grid", gap: 12 }}
      >
        <legend style={{ marginBottom: 8 }}>状态更新模式</legend>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="update-mode"
            value="replace"
            checked={updateMode === "replace"}
            onChange={() => setUpdateMode("replace")}
          />
          完整替换
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="update-mode"
            value="incremental"
            checked={updateMode === "incremental"}
            onChange={() => setUpdateMode("incremental")}
          />
          增量合并
        </label>
      </fieldset>
      <EventDebugger limit={24} />
      <div style={{ display: "grid", gap: 12 }}>
        <button
          type="button"
          className="action-panel__button action-panel__button--primary"
          onClick={onClose}
        >
          关闭
        </button>
        <button
          type="button"
          className="action-panel__button action-panel__button--secondary"
          onClick={() => {
            clearEvents();
            void reload();
            onClose();
          }}
        >
          清空事件并刷新
        </button>
      </div>
    </div>
  </div>
);

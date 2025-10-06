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
  const [mulliganSelection, setMulliganSelection] = useState<Set<number>>(new Set());
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
    }
  }, [isMulliganPhase]);

  useEffect(() => {
    if (isMulliganPhase && playerHasCompletedMulligan) {
      setMulliganSelection(new Set());
    }
  }, [isMulliganPhase, playerHasCompletedMulligan]);

  const handleEndTurn = useCallback(async () => {
    if (!player || !opponent || !state) {
      return;
    }
    try {
      await ensurePhase("End");
      await endTurn(); // endTurn现在会直接处理回合转换
      setInteractionMessage("等待对手行动…");
    } catch (err) {
      setInteractionMessage(err instanceof Error ? err.message : String(err));
    }
  }, [ensurePhase, endTurn, player, opponent, state]);

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
      isPlayerTurn,
      opponent,
      player,
    ]
  );

  const handleSelectAttacker = useCallback(
    (card: Card) => {
      if (!player || !isPlayerTurn || isMutating) {
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
    [isMutating, isPlayerTurn, player]
  );

  const handleAttackTarget = useCallback(
    (target: { ownerId: number; card?: Card } | null) => {
      if (
        !player ||
        !opponent ||
        !selectedAttacker ||
        !isPlayerTurn ||
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
              onSelectAttacker={handleSelectAttacker}
              onAttackTarget={handleAttackTarget}
              onAttackHero={() => handleAttackTarget({ ownerId: opponent.id })}
            />
            <HandZone
              cards={playerHand}
              disabled={!isPlayerTurn || isMutating}
              onPlayCard={handlePlayCard}
              playerMana={player.mana}
            />
          </div>

          <aside className="battle-layout__sidebar battle-layout__sidebar--right">
            <div className="sidebar-panel sidebar-panel--actions">
              <ActionPanel
                onEndTurn={handleEndTurn}
                onSettings={toggleSettings}
                disabled={isMutating}
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
          disabled={!selectedAttacker || isMutating || !isPlayerTurn}
          onCardClick={(card) => onAttackTarget({ ownerId: opponent.id, card })}
        />
      </div>

      <ActionBanner
        selectedAttacker={selectedAttacker}
        interactionMessage={interactionMessage}
        error={error}
        events={events}
        canAttackHero={Boolean(selectedAttacker) && !isMutating && isPlayerTurn}
        onAttackHero={onAttackHero}
        onCancelSelection={() =>
          selectedAttacker && onSelectAttacker(selectedAttacker)
        }
        guide={guide}
        phase={phase}
      />

      <div className="stage__board stage__board--bottom">
        <BoardLane
          cards={playerBoard}
          ownerId={player.id}
          variant="player"
          selectedCardId={selectedAttacker?.id ?? null}
          disabled={!isPlayerTurn || isMutating}
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
}: ActionBannerProps) => (
  <div className="battlefield__banner">
    <strong>{guide?.title ?? "作战指引"}</strong>
    {guide && <p className="battlefield__objective">{guide.objective}</p>}
    <p className="battlefield__phase-info">当前阶段：{phase}</p>
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
    <p className="battlefield__events">
      最近事件：
      {events
        .slice(-3)
        .map((event) => event.type)
        .join(" · ") || "无"}
    </p>
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

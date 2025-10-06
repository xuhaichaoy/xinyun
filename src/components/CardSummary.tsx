import type { Card } from "@/types/domain";
import { getCardDefinition } from "@/data/cards";

export type CardSummaryVariant =
  | "hand"
  | "board-player"
  | "board-opponent"
  | "sidebar";

export interface CardSummaryProps {
  card: Card;
  variant: CardSummaryVariant;
  disabled?: boolean;
  selected?: boolean;
  onClick?: (card: Card) => void;
  playerMana?: number;
}

const getStatBadgeStyle = (kind: "attack" | "health") => {
  const base = {
    borderRadius: 12,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } as const;
  if (kind === "attack") {
    return {
      ...base,
      background: "rgba(59,130,246,0.2)",
      color: "#93c5fd",
    };
  }
  return {
    ...base,
    background: "rgba(16,185,129,0.22)",
    color: "#6ee7b7",
  };
};

export const CardSummary = ({
  card,
  variant,
  disabled = false,
  selected = false,
  onClick,
  playerMana,
}: CardSummaryProps) => {
  const definition = getCardDefinition(card.id);
  const isUnit = card.card_type === "Unit";
  const isExhausted = isUnit && Boolean(card.exhausted);
  const isBoardVariant = variant.startsWith("board");
  const isOpponentSide = variant === "board-opponent";
  const shouldRespectExhausted = isBoardVariant && !isOpponentSide;
  const cannotAfford = variant === "hand" && typeof playerMana === "number" && card.cost > playerMana;
  const showStatusOverlay = cannotAfford || (shouldRespectExhausted && isExhausted);
  const unavailable = disabled || showStatusOverlay;
  const showDescription = variant === "hand";
  const showTags = showDescription && (definition?.tags?.length ?? 0) > 0;
  const effectCount = card.effects?.length ?? 0;
  const showEffectBadge = effectCount > 0 && isBoardVariant;

  const handleClick = () => {
    if (onClick && !unavailable) {
      onClick(card);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={unavailable}
      className="card-summary"
      data-variant={variant}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
    >
      <span className="card-summary__cost" aria-label="法力消耗">
        {card.cost}
      </span>
      <span className="card-summary__name" title={card.name}>
        {card.name}
      </span>

      {showEffectBadge && (
        <span className="card-summary__badge" aria-label="效果数量">
          x{effectCount}
        </span>
      )}

      {isBoardVariant ? (
        <div className="card-summary__board">
          {isUnit ? (
            <div className="card-summary__board-stats">
              <span className="card-summary__stat card-summary__stat--attack">{card.attack}</span>
              <span className="card-summary__stat-divider" aria-hidden="true" />
              <span className="card-summary__stat card-summary__stat--health">{card.health}</span>
            </div>
          ) : (
            <p className="card-summary__board-text">法术</p>
          )}
        </div>
      ) : (
        <>
          <dl className="card-summary__stats" aria-hidden={!isUnit}>
            {isUnit && (
              <div style={getStatBadgeStyle("attack")}>
                <span aria-label="攻击">⚔</span>
                <span>{card.attack}</span>
              </div>
            )}
            {isUnit && (
              <div style={getStatBadgeStyle("health")}>
                <span aria-label="生命">❤</span>
                <span>{card.health}</span>
              </div>
            )}
          </dl>
          {showDescription && (
            <p className="card-summary__text">
              {definition?.description ?? "这张卡牌等待设计文案。"}
            </p>
          )}
          {showTags && (
            <footer className="card-summary__tags" aria-label="关键词">
              {definition?.tags?.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </footer>
          )}
        </>
      )}

      {showStatusOverlay && (
        <aside className="card-summary__status">
          {cannotAfford && <span>法力不足</span>}
          {isExhausted && !cannotAfford && <span>已行动</span>}
        </aside>
      )}
    </button>
  );
};

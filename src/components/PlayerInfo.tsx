import type { FC } from "react";

import type { GameState, Player } from "@/types/domain";

interface PlayerInfoProps {
  player: Player;
  isActive: boolean;
  isOpponent?: boolean;
  handSize: number;
}

export const PlayerInfo: FC<PlayerInfoProps> = ({ player, isActive, isOpponent = false, handSize }) => {
  return (
    <article
      className="player-info"
      role="region"
      aria-label={isOpponent ? "对手信息" : "玩家信息"}
    >
      <header className="player-info__header">
        <h2 className="player-info__name">
          {isOpponent ? "对手" : "你"} · #{player.id}
        </h2>
        {isActive && <span aria-live="polite">当前回合</span>}
      </header>
      <div className="player-info__stats">
        <Stat label="生命" value={player.health} ariaLabel="生命值" />
        <Stat label="护甲" value={player.armor} ariaLabel="护甲值" />
        <Stat label="法力" value={player.mana} ariaLabel="法力值" />
        <Stat label="手牌" value={handSize} ariaLabel="手牌数量" />
      </div>
    </article>
  );
};

interface StatProps {
  label: string;
  value: number;
  ariaLabel?: string;
}

const Stat: FC<StatProps> = ({ label, value, ariaLabel }) => (
  <div className="player-info__stat" role="presentation">
    <span>{label}</span>
    <span className="player-info__value" aria-label={ariaLabel}>
      {value}
    </span>
  </div>
);

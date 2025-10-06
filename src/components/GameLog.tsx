import { memo, useMemo } from "react";

import type { GameEvent } from "@/types/domain";

interface GameLogProps {
  events: GameEvent[];
}

export const GameLog = memo(({ events }: GameLogProps) => {
  const logItems = useMemo(() => events.map(renderEvent), [events]);

  return (
    <aside className="game-log" aria-live="polite" role="log">
      <h3 className="game-log__title">战斗记录</h3>
      <ol className="game-log__list">
        {logItems.map((item, index) => (
          <li key={index} className="game-log__item">
            {item}
          </li>
        ))}
      </ol>
    </aside>
  );
});

GameLog.displayName = "GameLog";

function renderEvent(event: GameEvent): string {
  switch (event.type) {
    case "CardPlayed": {
      const target = event.target_id != null ? `，目标 #${event.target_id}` : "";
      return `玩家 #${event.player_id} 使用了卡牌 #${event.card_id}${target}`;
    }
    case "CardDrawn":
      return `玩家 #${event.player_id} 抽到了卡牌 #${event.card_id}`;
    case "AttackDeclared": {
      const defender = event.defender_id != null ? `卡牌 #${event.defender_id}` : "英雄";
      return `玩家 #${event.attacker_owner} 的卡牌 #${event.attacker_id} 攻击了玩家 #${event.defender_owner} 的 ${defender}`;
    }
    case "DamageResolved": {
      const source = event.source_card != null ? `卡牌 #${event.source_card}` : "技能";
      const target = event.target_card != null ? `卡牌 #${event.target_card}` : "英雄";
      return `${source} 对玩家 #${event.target_player} 的 ${target} 造成了 ${event.amount} 点伤害`;
    }
    case "CardDestroyed":
      return `玩家 #${event.player_id} 的卡牌 #${event.card.id} 被摧毁`;
    case "CardHealed": {
      const target = event.card_id != null ? `卡牌 #${event.card_id}` : "英雄";
      return `玩家 #${event.player_id} 的 ${target} 恢复了 ${event.amount} 点生命`;
    }
    case "TurnEnded":
      return `玩家 #${event.player_id} 结束了回合`;
    case "GameWon":
      return `玩家 #${event.winner} 获胜 (${event.reason.type})`;
    default:
      return event.type;
  }
}

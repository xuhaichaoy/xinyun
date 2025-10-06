import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { AiDecision, GameEvent, VictoryState } from "@/types/domain";

interface ResultsLocationState {
  outcome?: VictoryState;
  events?: GameEvent[];
}

export const ResultsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as ResultsLocationState | undefined) ?? {};

  useEffect(() => {
    if (!state.outcome) {
      navigate("/", { replace: true });
    }
  }, [state.outcome, navigate]);

  if (!state.outcome) {
    return null;
  }

  return (
    <div className="game-app">
      <section className="game-board" aria-label="结算页面">
        <header className="game-board__top">
          <h1 style={{ gridColumn: "span 12", margin: 0 }}>战斗结算</h1>
        </header>
        <main className="game-board__main">
          <div className="game-board__surface" style={{ alignContent: "center", padding: 16 }}>
            <div>
              <h2 style={{ marginTop: 0 }}>玩家 #{state.outcome.winner} 获胜</h2>
              <p>原因：{renderReason(state.outcome)}</p>
            </div>
          </div>
          <aside className="game-log" aria-label="近期事件">
            <h3 className="game-log__title">关键事件</h3>
            <ol className="game-log__list">
              {(state.events ?? []).map((event, index) => (
                <li key={index} className="game-log__item">
                  {event.type}
                </li>
              ))}
            </ol>
          </aside>
          <div className="action-panel">
            <button
              type="button"
              className="action-panel__button action-panel__button--primary"
              onClick={() => navigate("/game", { replace: true })}
            >
              再来一局
            </button>
            <button
              type="button"
              className="action-panel__button action-panel__button--secondary"
              onClick={() => navigate("/", { replace: true })}
            >
              返回主菜单
            </button>
          </div>
        </main>
      </section>
    </div>
  );
};

function renderReason(outcome: VictoryState): string {
  switch (outcome.reason.type) {
    case "HealthDepleted":
      return `玩家 #${outcome.reason.loser} 生命归零`;
    case "DeckOut":
      return `玩家 #${outcome.reason.loser} 的牌库耗尽`;
    case "Special":
      return outcome.reason.reason;
    default:
      return outcome.reason.type;
  }
}

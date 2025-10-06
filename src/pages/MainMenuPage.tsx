import { useNavigate } from "react-router-dom";

export const MainMenuPage = () => {
  const navigate = useNavigate();

  return (
    <div className="game-app">
      <section className="game-board" aria-label="主菜单">
        <header className="game-board__top">
          <h1 style={{ gridColumn: "span 12", margin: 0 }}>星云卡牌 · 主菜单</h1>
        </header>
        <main className="game-board__main" style={{ gridColumn: "span 12" }}>
          <div className="game-board__surface" style={{ alignContent: "center" }}>
            <div>
              <p>欢迎来到移动优先的卡牌对战体验。</p>
              <p>请从下面的选项开始冒险。</p>
            </div>
          </div>
          <nav className="action-panel" aria-label="主菜单操作">
            <button
              type="button"
              className="action-panel__button action-panel__button--primary"
              onClick={() => navigate("/game")}
            >
              开始游戏
            </button>
            <button
              type="button"
              className="action-panel__button action-panel__button--secondary"
              onClick={() => navigate("/levels")}
            >
              关卡选择
            </button>
            <button
              type="button"
              className="action-panel__button action-panel__button--secondary"
              onClick={() => navigate("/settings")}
            >
              设置
            </button>
          </nav>
        </main>
        <footer className="game-board__bottom" style={{ gridColumn: "span 12" }}>
          <article className="game-log" aria-label="关于游戏">
            <h3 className="game-log__title">关于</h3>
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              《星云卡牌》是一款基于 Rust + WASM 的策略游戏。我们正在构建全新的移动端体验，支持实时热重载和 AI 对手。敬请期待后续更新！
            </p>
          </article>
        </footer>
      </section>
    </div>
  );
};

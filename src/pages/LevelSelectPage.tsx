import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGamePersistence } from "@/hooks/useGamePersistence";
import { LEVEL_CONFIGS } from "@/data/levels";

const DIFFICULTIES = [
  { value: "easy", label: "休闲" },
  { value: "normal", label: "标准" },
  { value: "hard", label: "挑战" },
  { value: "expert", label: "专家" },
];

export const LevelSelectPage = () => {
  const navigate = useNavigate();
  const persistence = useGamePersistence();
  const unlockedSet = useMemo(
    () => new Set(persistence.activeSlot.progress.unlockedLevels),
    [persistence.activeSlot.progress.unlockedLevels]
  );
  const levels = useMemo(
    () =>
      LEVEL_CONFIGS.map((level) => ({
        ...level,
        unlocked: unlockedSet.has(level.id),
      })),
    [unlockedSet]
  );

  const initialLevel = useMemo(
    () => levels.find((level) => level.unlocked) ?? levels[0],
    [levels]
  );

  const [selectedLevelId, setSelectedLevelId] = useState<number>(initialLevel.id);
  const [difficulty, setDifficulty] = useState<string>(initialLevel.recommendedDifficulty);

  useEffect(() => {
    const currentLevel = levels.find((level) => level.id === selectedLevelId);
    if (!currentLevel) {
      return;
    }
    if (!currentLevel.unlocked) {
      const fallback = levels.find((level) => level.unlocked) ?? levels[0];
      setSelectedLevelId(fallback.id);
      setDifficulty(fallback.recommendedDifficulty);
    } else {
      setDifficulty(currentLevel.recommendedDifficulty);
    }
  }, [levels, selectedLevelId]);

  const selectedLevel = useMemo(
    () => levels.find((level) => level.id === selectedLevelId) ?? levels[0],
    [levels, selectedLevelId]
  );

  const difficultyLabel = useMemo(
    () => DIFFICULTIES.find((item) => item.value === difficulty)?.label ?? "标准",
    [difficulty]
  );

  const handleStart = () => {
    if (!selectedLevel.unlocked) {
      return;
    }
    navigate("/game", { state: { levelId: selectedLevel.id, difficulty } });
  };

  return (
    <div className="game-app">
      <section className="game-board" aria-label="关卡选择">
        <header className="game-board__top" style={{ alignItems: "center" }}>
          <h1 style={{ gridColumn: "span 12", margin: 0 }}>选择关卡</h1>
        </header>
        <main className="game-board__main">
          <div className="game-board__surface" style={{ alignContent: "start", padding: 16 }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, width: "100%" }}>
              {levels.map((level) => {
                const unlocked = level.unlocked;
                return (
                  <li key={level.id} style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      className="action-panel__button"
                      style={{ width: "100%" }}
                      disabled={!unlocked}
                      aria-current={selectedLevel.id === level.id}
                      onClick={() => {
                        setSelectedLevelId(level.id);
                        setDifficulty(level.recommendedDifficulty);
                      }}
                    >
                      {level.name} {unlocked ? "" : "(未解锁)"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <aside className="game-log" aria-label="关卡详情">
            <h3 className="game-log__title">关卡详情</h3>
            <p>当前选择：{selectedLevel.name}</p>
            <p style={{ opacity: 0.75, lineHeight: 1.6 }}>{selectedLevel.description}</p>
            <p>推荐难度：{difficultyLabel}</p>
            {selectedLevel.unlockOnWin && (
              <p style={{ opacity: 0.75 }}>
                胜利奖励：解锁关卡 #{selectedLevel.unlockOnWin}
              </p>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <label>
                <span style={{ display: "block", marginBottom: 4 }}>选择难度</span>
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 12 }}
                >
                  {DIFFICULTIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </aside>
          <div className="action-panel">
            <button
              type="button"
              className="action-panel__button action-panel__button--primary"
              onClick={handleStart}
              disabled={!selectedLevel.unlocked}
            >
              进入关卡
            </button>
            <button
              type="button"
              className="action-panel__button action-panel__button--secondary"
              onClick={() => navigate("/")}
            >
              返回主菜单
            </button>
          </div>
        </main>
      </section>
    </div>
  );
};

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGamePersistence } from "@/hooks/useGamePersistence";
import type { GameSettings, AiDifficulty } from "@/types/domain";

const difficulties = [
  { value: "easy", label: "休闲 (Easy)" },
  { value: "normal", label: "标准 (Normal)" },
  { value: "hard", label: "挑战 (Hard)" },
  { value: "expert", label: "专家 (Expert)" },
];

export const SettingsPage = () => {
  const navigate = useNavigate();
  const persistence = useGamePersistence();
  const activeSlot = persistence.activeSlot;

  const [soundEnabled, setSoundEnabled] = useState(activeSlot.settings.soundEnabled);
  const [graphicsQuality, setGraphicsQuality] = useState(activeSlot.settings.graphicsQuality);
  const [aiDifficulty, setAiDifficulty] = useState(activeSlot.settings.aiDifficulty);
  const [volume, setVolume] = useState(activeSlot.settings.volume);
  const [controlScheme, setControlScheme] = useState(activeSlot.settings.controlScheme);

  return (
    <div className="game-app">
      <section className="game-board" aria-label="设置">
        <header className="game-board__top" style={{ alignItems: "center" }}>
          <h1 style={{ gridColumn: "span 12", margin: 0 }}>设置</h1>
        </header>
        <main className="game-board__main">
          <form
            className="game-board__surface"
            style={{ alignContent: "start", padding: 20, gap: 16 }}
            aria-describedby="settings-hint"
          >
            <div style={{ display: "grid", gap: 6 }}>
              <span>当前存档槽</span>
              <select
                value={activeSlot.id}
                onChange={(event) => persistence.setActiveSlot(event.target.value)}
                style={{ padding: 10, borderRadius: 12 }}
              >
                {persistence.state.slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.name}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ display: "grid", gap: 8 }}>
              <span>音效</span>
              <select
                value={soundEnabled ? "on" : "off"}
                onChange={(event) => setSoundEnabled(event.target.value === "on")}
                style={{ padding: 10, borderRadius: 12 }}
              >
                <option value="on">开启</option>
                <option value="off">关闭</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>音量</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>画质</span>
              <select
                value={graphicsQuality}
                onChange={(event) => setGraphicsQuality(event.target.value)}
                style={{ padding: 10, borderRadius: 12 }}
              >
                <option value="low">流畅优先</option>
                <option value="medium">均衡</option>
                <option value="high">画质优先</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>AI 难度</span>
              <select
                value={aiDifficulty}
                onChange={(event) => setAiDifficulty(event.target.value)}
                style={{ padding: 10, borderRadius: 12 }}
              >
                {difficulties.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 8 }}>
              <span>操作方式</span>
              <select
                value={controlScheme}
                onChange={(event) => setControlScheme(event.target.value as typeof controlScheme)}
                style={{ padding: 10, borderRadius: 12 }}
              >
                <option value="auto">自动</option>
                <option value="touch">触屏优先</option>
                <option value="keyboard">键盘/手柄</option>
              </select>
            </label>

            <p id="settings-hint" style={{ marginTop: 8, color: "rgba(191, 219, 254, 0.8)" }}>
              设置将会保存在本地存储（TODO），当前仅用于演示。
            </p>
          </form>
          <div className="action-panel" style={{ gridColumn: "span 12" }}>
            <button
              type="button"
              className="action-panel__button action-panel__button--primary"
              onClick={() => {
                persistence.updateSettings({
                  soundEnabled,
                  graphicsQuality: graphicsQuality as GameSettings["graphicsQuality"],
                  aiDifficulty: aiDifficulty as AiDifficulty,
                  volume,
                  controlScheme,
                });
                navigate("/game", { state: { aiDifficulty } });
              }}
            >
              保存并返回游戏
            </button>
            <button
              type="button"
              className="action-panel__button action-panel__button--secondary"
              onClick={() => navigate(-1)}
            >
              取消
            </button>
          </div>
        </main>
      </section>
    </div>
  );
};

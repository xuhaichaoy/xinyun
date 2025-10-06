import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useWasm } from "@/hooks/useWasm";
import { useGameState } from "@/hooks/useGameState";
import { useGamePersistence } from "@/hooks/useGamePersistence";
import { GameEngineService } from "@/wasm";
import { GameBoard } from "@/components/GameBoard";
import { LoadingScreen } from "@/components/LoadingScreen";
import { gameEventBus } from "@/events/GameEvents";
import { DebugOverlay } from "@/debug";
import type { AiDifficulty } from "@/types/domain";
import { getLevelConfig } from "@/data/levels";
import { buildScenarioByLevelId } from "@/data/scenarios";

interface LocationState {
  levelId?: number;
  difficulty?: string;
}

export const GamePage = () => {
  const { ready, loading, error, module } = useWasm();
  const [service, setService] = useState<GameEngineService | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | undefined;
  const persistence = useGamePersistence();
  const { updateProgress, unlockLevel, addAchievement } = persistence;

  const unlockedLevels = persistence.activeSlot.progress.unlockedLevels;
  const fallbackLevelId = unlockedLevels.length > 0 ? unlockedLevels[unlockedLevels.length - 1] : 1;
  const effectiveLevelId = typeof locationState?.levelId === "number" && locationState.levelId > 0 ? locationState.levelId : fallbackLevelId;

  const levelConfig = useMemo(
    () => getLevelConfig(effectiveLevelId) ?? getLevelConfig(1),
    [effectiveLevelId]
  );

  const scenario = useMemo(() => {
    return buildScenarioByLevelId(effectiveLevelId) ?? buildScenarioByLevelId(1);
  }, [effectiveLevelId]);

  const initialStateJson = useMemo(() => (scenario?.state ? JSON.stringify(scenario.state) : undefined), [scenario?.state]);

  useEffect(() => {
    let disposed = false;
    if (!ready || !module) {
      return;
    }

    GameEngineService.create({ eventBus: gameEventBus, initialStateJson })
      .then((engine) => {
        if (!disposed) {
          setService(engine);
        } else {
          engine.dispose();
        }
      })
      .catch((err) => {
        console.error("Failed to create GameEngineService", err);
      });

    return () => {
      disposed = true;
      setService((engine) => {
        engine?.dispose();
        return null;
      });
    };
  }, [ready, module, initialStateJson]);

  const gameStateHook = useGameState({ service, updateMode: "incremental" });
  const { state, events, isMutating, applyAiMove, mulligan, startTurn } = gameStateHook;

  const aiDifficulty = useMemo<AiDifficulty>(() => {
    const value = locationState?.difficulty;
    if (value === "easy" || value === "normal" || value === "hard" || value === "expert") {
      return value;
    }
    if (levelConfig) {
      return levelConfig.recommendedDifficulty;
    }
    return persistence.activeSlot.settings.aiDifficulty;
  }, [levelConfig, locationState?.difficulty, persistence.activeSlot.settings.aiDifficulty]);

  const aiTurnRef = useRef<string | null>(null);
  const outcomeHandledRef = useRef(false);
  const initialTurnStartedRef = useRef(false);

  useEffect(() => {
    aiTurnRef.current = null;
    outcomeHandledRef.current = false;
    initialTurnStartedRef.current = false;
  }, [initialStateJson]);

  useEffect(() => {
    if (!state || state.phase !== "Mulligan" || isMutating) {
      return;
    }
    const aiPlayer = state.players?.[1];
    if (!aiPlayer) {
      return;
    }
    const completed = new Set(state.mulligan_completed ?? []);
    if (!completed.has(aiPlayer.id)) {
      void mulligan({ player_id: aiPlayer.id, replacements: [] }).catch((error) => {
        console.error("AI mulligan failed", error);
      });
    }
  }, [isMutating, mulligan, state]);

  useEffect(() => {
    if (!state || state.phase !== "Main" || isMutating) {
      if (state?.phase !== "Main") {
        initialTurnStartedRef.current = false;
      }
      return;
    }
    if (initialTurnStartedRef.current) {
      return;
    }
    const completed = state.mulligan_completed ?? [];
    if (state.players && completed.length === state.players.length) {
      initialTurnStartedRef.current = true;
      void startTurn(state.current_player).catch((error) => {
        console.error("Failed to start initial turn", error);
        initialTurnStartedRef.current = false;
      });
    }
  }, [isMutating, startTurn, state]);

  useEffect(() => {
    if (!state || state.outcome) {
      return;
    }
    const players = state.players ?? [];
    const aiPlayer = players[1];
    if (!aiPlayer) {
      return;
    }
    if (state.current_player !== aiPlayer.id) {
      return;
    }
    if (isMutating) {
      return;
    }

    const marker = `${state.turn}-${state.current_player}-${events.length}`;
    if (aiTurnRef.current === marker) {
      return;
    }
    aiTurnRef.current = marker;

    void applyAiMove(aiPlayer.id, { difficulty: aiDifficulty }).catch((err) => {
      console.error("AI move failed", err);
    });
  }, [aiDifficulty, applyAiMove, events.length, isMutating, state]);

  useEffect(() => {
    const outcome = state?.outcome;
    if (!outcome) {
      outcomeHandledRef.current = false;
      return;
    }

    if (outcomeHandledRef.current) {
      return;
    }
    outcomeHandledRef.current = true;

    const levelId = effectiveLevelId;
    const players = state.players ?? [];
    const humanPlayer = players[0];
    let unlockedLevelId: number | null = null;
    if (humanPlayer && outcome.winner === humanPlayer.id) {
      if (typeof levelId === "number") {
        updateProgress({ lastCompletedLevel: levelId });
        const unlockTarget = (() => {
          if (levelConfig?.unlockOnWin && levelConfig.unlockOnWin > 0) {
            return levelConfig.unlockOnWin;
          }
          const candidate = levelId + 1;
          return getLevelConfig(candidate) ? candidate : undefined;
        })();
        if (typeof unlockTarget === "number" && !unlockedLevels.includes(unlockTarget)) {
          unlockLevel(unlockTarget);
          unlockedLevelId = unlockTarget;
        }
        addAchievement(`clear-level-${levelId}`);
      }
    }

    navigate("/results", {
      replace: true,
      state: {
        outcome,
        events: events.slice(-10),
        levelId,
        unlockedLevelId,
      },
    });
  }, [addAchievement, effectiveLevelId, events, levelConfig, navigate, state, unlockLevel, unlockedLevels, updateProgress]);

  const loadingMessage = useMemo(() => {
    if (!ready) return "正在加载 WASM 模块…";
    if (!service) return "正在初始化游戏引擎…";
    return "";
  }, [ready, service]);

  if (loading || !service) {
    return (
      <LoadingScreen
        message={loadingMessage}
        hint={error ? error.message : "请稍候，正在初始化游戏环境"}
      />
    );
  }

  return (
    <>
      <GameBoard gameStateHook={gameStateHook} scenarioGuide={scenario?.guide} />
      {import.meta.env.DEV && <DebugOverlay gameStateHook={gameStateHook} />}
    </>
  );
};

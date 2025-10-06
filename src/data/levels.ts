import type { AiDifficulty } from "@/types/domain";

export interface LevelConfig {
  id: number;
  name: string;
  description: string;
  recommendedDifficulty: AiDifficulty;
  enemyDeckId: string;
  scenarioId: string;
  unlockOnWin?: number;
}

export const LEVEL_CONFIGS: LevelConfig[] = [
  {
    id: 1,
    name: "星港外围",
    description: "与星港守卫进行教学对决，熟悉操作节奏。",
    recommendedDifficulty: "easy",
    enemyDeckId: "bulwark-guard",
    scenarioId: "tutorial-intro",
    unlockOnWin: 2,
  },
  {
    id: 2,
    name: "学者试炼",
    description: "面对强调过牌与爆发的对手，学习资源管理。",
    recommendedDifficulty: "normal",
    enemyDeckId: "raider-assault",
    scenarioId: "tutorial-resource",
    unlockOnWin: 3,
  },
  {
    id: 3,
    name: "霜寒前线",
    description: "战场环境偏慢，考验中期场面运营能力。",
    recommendedDifficulty: "normal",
    enemyDeckId: "bulwark-guard",
    scenarioId: "tutorial-defense",
    unlockOnWin: 4,
  },
  {
    id: 4,
    name: "虚空裂口",
    description: "输出压力倍增，需要精准计算伤害窗口。",
    recommendedDifficulty: "hard",
    enemyDeckId: "raider-assault",
    scenarioId: "tutorial-offense",
    unlockOnWin: 5,
  },
  {
    id: 5,
    name: "星界议会",
    description: "多阶段战斗，善用治疗与防守手段。",
    recommendedDifficulty: "hard",
    enemyDeckId: "bulwark-guard",
    scenarioId: "tutorial-defense",
    unlockOnWin: 6,
  },
  {
    id: 6,
    name: "终焉幻境",
    description: "全力进攻的终极考验，挑战最高难度。",
    recommendedDifficulty: "expert",
    enemyDeckId: "raider-assault",
    scenarioId: "tutorial-offense",
  },
];

export const getLevelConfig = (id: number) => LEVEL_CONFIGS.find((config) => config.id === id);

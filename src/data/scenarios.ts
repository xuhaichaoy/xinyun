import type { Card, CardEffect, GameState } from "@/types/domain";

import {
  getCardBySlug,
  registerCardMetadata,
  type CardDefinition,
} from "./cards";
import {
  PLAYER_STARTER_DECK,
  ENEMY_DECKS,
  resolveDeckEntries,
  type DeckList,
} from "./decks";

interface BoardCardSpec {
  slug: string;
  attack?: number;
  health?: number;
  exhausted?: boolean;
}

interface ScenarioPlayerSpec {
  deckId: string;
  hero?: string;
  health?: number;
  armor?: number;
  mana?: number;
  hand?: string[];
  board?: BoardCardSpec[];
}

export interface ScenarioGuide {
  title: string;
  intro: string;
  objective: string;
  tips: string[];
  keyCards: string[];
}

interface ScenarioBlueprint {
  id: string;
  levelId: number;
  name: string;
  summary: string;
  player: ScenarioPlayerSpec;
  opponent: ScenarioPlayerSpec;
  guide: ScenarioGuide;
}

export interface ScenarioResult {
  state: GameState;
  guide: ScenarioGuide & {
    name: string;
    summary: string;
    keyCardDetails: CardDefinition[];
  };
}

const SCENARIO_BLUEPRINTS: ScenarioBlueprint[] = [
  {
    id: "tutorial-intro",
    levelId: 1,
    name: "星港外围",
    summary: "通过进攻守卫学习基础出牌与攻击节奏。",
    player: {
      deckId: PLAYER_STARTER_DECK.id,
      health: 30,
      mana: 3,
      hand: ["arcane-scholar", "fireball", "celestial-blessing"],
      board: [
        { slug: "vanguard-footman", attack: 1, health: 2, exhausted: false },
      ],
    },
    opponent: {
      deckId: "bulwark-guard",
      health: 30,
      mana: 2,
      board: [
        { slug: "steel-bulwark", attack: 2, health: 4, exhausted: false },
      ],
      hand: ["meteor-strike"],
    },
    guide: {
      title: "基础教学",
      intro: "使用随从与法术拆掉守卫并尝试攻击敌方英雄。",
      objective: "击破敌方守卫并造成伤害。",
      tips: [
        "先让随从攻击守卫，再用法术结束战斗。",
        "当手牌不足时，奥术学者可以帮你抽牌。",
      ],
      keyCards: ["vanguard-footman", "arcane-scholar", "fireball"],
    },
  },
  {
    id: "tutorial-resource",
    levelId: 2,
    name: "学者试炼",
    summary: "掌握法术与随从的配合，保持手牌优势。",
    player: {
      deckId: PLAYER_STARTER_DECK.id,
      health: 30,
      mana: 4,
      hand: ["arcane-scholar", "stormcaller-adept", "fireball"],
      board: [
        { slug: "radiant-healer", attack: 2, health: 4, exhausted: false },
      ],
    },
    opponent: {
      deckId: "raider-assault",
      health: 30,
      mana: 3,
      board: [
        { slug: "shadowblade-adept", attack: 4, health: 2, exhausted: true },
      ],
      hand: ["frost-bolt"],
    },
    guide: {
      title: "资源管理",
      intro: "保持场面与手牌优势，诱导对手交出爆发。",
      objective: "利用治疗与法术压制敌方输出。",
      tips: [
        "唤雷学徒会让法术更强，记得优先保护它。",
        "光辉医师配合法术可持续恢复血量。",
      ],
      keyCards: ["radiant-healer", "stormcaller-adept", "fireball"],
    },
  },
  {
    id: "tutorial-defense",
    levelId: 3,
    name: "霜寒前线",
    summary: "面对厚实防线，学会用治疗与控制减缓节奏。",
    player: {
      deckId: PLAYER_STARTER_DECK.id,
      health: 30,
      mana: 4,
      hand: ["frost-bolt", "celestial-blessing", "guardian-golem"],
      board: [
        { slug: "vanguard-footman", attack: 1, health: 2, exhausted: false },
      ],
    },
    opponent: {
      deckId: "bulwark-guard",
      health: 32,
      armor: 2,
      mana: 3,
      board: [
        { slug: "steel-bulwark", attack: 2, health: 4, exhausted: false },
        { slug: "radiant-healer", attack: 2, health: 4, exhausted: false },
      ],
      hand: ["celestial-blessing"],
    },
    guide: {
      title: "拖延与反击",
      intro: "利用寒霜法术与治疗拖住敌人，为后期傀儡争取时间。",
      objective: "构筑更厚的防线并寻找反击机会。",
      tips: [
        "优先用寒霜之矢削弱敌方高攻击随从。",
        "守护傀儡登场后记得用祈福为其回血。",
      ],
      keyCards: ["guardian-golem", "celestial-blessing", "frost-bolt"],
    },
  },
  {
    id: "tutorial-offense",
    levelId: 4,
    name: "虚空裂口",
    summary: "高压战斗：合理安排爆发伤害与斩杀顺序。",
    player: {
      deckId: PLAYER_STARTER_DECK.id,
      health: 28,
      mana: 5,
      hand: ["fireball", "meteor-strike", "shadowblade-adept"],
      board: [
        { slug: "stormcaller-adept", attack: 3, health: 3, exhausted: false },
      ],
    },
    opponent: {
      deckId: "raider-assault",
      health: 30,
      mana: 4,
      board: [
        { slug: "shadowblade-adept", attack: 4, health: 2, exhausted: false },
        { slug: "ember-phoenix", attack: 4, health: 4, exhausted: true },
      ],
      hand: ["fireball"],
    },
    guide: {
      title: "爆发对决",
      intro: "用流星与火球清线，抓住窗口一举击溃敌人。",
      objective: "在敌人发动致命一击前完成斩杀。",
      tips: [
        "先手打出流星削弱随从，再用刺客补刀英雄。",
        "注意余烬凤凰的亡语，提前规划血线。",
      ],
      keyCards: ["stormcaller-adept", "meteor-strike", "shadowblade-adept"],
    },
  },
  {
    id: "council-defense",
    levelId: 5,
    name: "星界议会",
    summary: "议会守卫布下多重回复，需要逐一瓦解。",
    player: {
      deckId: PLAYER_STARTER_DECK.id,
      health: 32,
      mana: 5,
      hand: ["guardian-golem", "celestial-blessing", "radiant-healer"],
      board: [
        { slug: "vanguard-footman", attack: 1, health: 2, exhausted: false },
        { slug: "arcane-scholar", attack: 2, health: 3, exhausted: true },
      ],
    },
    opponent: {
      deckId: "bulwark-guard",
      health: 34,
      armor: 3,
      mana: 4,
      board: [
        { slug: "steel-bulwark", attack: 2, health: 4, exhausted: false },
        { slug: "steel-bulwark", attack: 2, health: 4, exhausted: false },
        { slug: "radiant-healer", attack: 2, health: 4, exhausted: false },
      ],
      hand: ["celestial-blessing", "meteor-strike"],
    },
    guide: {
      title: "拆解守卫",
      intro: "逐步削弱双重护卫，再由傀儡完成终结。",
      objective: "利用守护傀儡的亡语治疗与其他回复抗住长线消耗。",
      tips: [
        "优先合力击破两个钢铁壁垒，避免护甲叠加。",
        "先铺前排护卫再考虑打英雄，保证血线安全。",
      ],
      keyCards: ["guardian-golem", "celestial-blessing", "radiant-healer"],
    },
  },
  {
    id: "final-horizon",
    levelId: 6,
    name: "终焉幻境",
    summary: "终极考验：敌人掌握高爆发与清场，必须快速斩杀。",
    player: {
      deckId: PLAYER_STARTER_DECK.id,
      health: 26,
      mana: 6,
      hand: ["fireball", "meteor-strike", "ember-phoenix"],
      board: [
        { slug: "stormcaller-adept", attack: 3, health: 3, exhausted: false },
        { slug: "shadowblade-adept", attack: 4, health: 2, exhausted: true },
      ],
    },
    opponent: {
      deckId: "raider-assault",
      health: 33,
      mana: 5,
      board: [
        { slug: "shadowblade-adept", attack: 4, health: 2, exhausted: false },
        { slug: "ember-phoenix", attack: 4, health: 4, exhausted: false },
      ],
      hand: ["fireball", "frost-bolt"],
    },
    guide: {
      title: "终极爆发",
      intro: "精准计算爆发伤害，在敌方凤凰亡语触发前完成击杀。",
      objective: "利用火球与流星组合造成致命伤害。",
      tips: [
        "唤雷学徒在场时先施放火球可打出 7 点伤害。",
        "留意对手的法术反击，必要时使用凤凰吸收伤害。",
      ],
      keyCards: ["meteor-strike", "stormcaller-adept", "ember-phoenix"],
    },
  },
];

export const listScenarios = () => SCENARIO_BLUEPRINTS.slice();

export const buildScenarioByLevelId = (
  levelId: number
): ScenarioResult | undefined => {
  const blueprint = SCENARIO_BLUEPRINTS.find(
    (scenario) => scenario.levelId === levelId
  );
  if (!blueprint) {
    return undefined;
  }

  const cardIdCounter = { value: 1000 };

  const playerData = instantiatePlayer(blueprint.player, 0, cardIdCounter);
  const opponentData = instantiatePlayer(blueprint.opponent, 1, cardIdCounter);

  const state: GameState = {
    players: [playerData.player, opponentData.player],
    current_player: 0,
    turn: 1,
    phase: "Main",
    event_log: [],
  };

  const keyCardDetails = blueprint.guide.keyCards
    .map((slug) => getCardBySlug(slug))
    .filter((card): card is CardDefinition => Boolean(card));

  return {
    state,
    guide: {
      ...blueprint.guide,
      name: blueprint.name,
      summary: blueprint.summary,
      keyCardDetails,
    },
  };
};

function instantiatePlayer(
  spec: ScenarioPlayerSpec,
  ownerId: number,
  counter: { value: number }
) {
  const deckBlueprint = getDeckById(spec.deckId);
  const deckPool = resolveDeckEntries(deckBlueprint);

  const pickCardFromPool = (slug: string) => {
    const index = deckPool.findIndex((entry) => entry === slug);
    if (index >= 0) {
      deckPool.splice(index, 1);
    }
    return createCardInstance(slug, counter, { ownerId });
  };

  const handCards: Card[] = [];
  for (const slug of spec.hand ?? []) {
    handCards.push(pickCardFromPool(slug));
  }

  const boardCards: Card[] = [];
  for (const slot of spec.board ?? []) {
    const card = createCardInstance(slot.slug, counter, {
      ownerId,
      attack: slot.attack,
      health: slot.health,
      exhausted: slot.exhausted ?? false,
    });
    boardCards.push(card);
    const index = deckPool.findIndex((entry) => entry === slot.slug);
    if (index >= 0) {
      deckPool.splice(index, 1);
    }
  }

  const deckCards: Card[] = deckPool.map((slug) =>
    createCardInstance(slug, counter, { ownerId })
  );

  return {
    player: {
      id: ownerId,
      health: spec.health ?? 30,
      armor: spec.armor ?? 0,
      mana: spec.mana ?? 3,
      hand: handCards,
      board: boardCards,
      deck: deckCards,
    },
  };
}

function createCardInstance(
  slug: string,
  counter: { value: number },
  options: {
    ownerId: number;
    attack?: number;
    health?: number;
    exhausted?: boolean;
  }
): Card {
  const definition = getCardBySlug(slug);
  if (!definition) {
    throw new Error(`Unknown card slug: ${slug}`);
  }

  const id = counter.value++;
  const attack = options.attack ?? definition.attack ?? 0;
  const health = options.health ?? definition.health ?? 0;
  const card: Card = {
    id,
    name: definition.name,
    cost: definition.cost,
    attack,
    health,
    card_type: definition.type,
    exhausted: options.exhausted ?? (definition.type === "Unit" ? false : true),
  };

  const effects = buildCardEffects(definition, id);
  if (effects.length > 0) {
    card.effects = effects;
  }

  registerCardMetadata(id, definition);

  return card;
}

function buildCardEffects(
  definition: CardDefinition,
  cardId: number
): CardEffect[] {
  const effectId = (suffix: number) => cardId * 10 + suffix;

  switch (definition.slug) {
    case "fireball":
      return [
        {
          id: effectId(1),
          description: "火焰冲击：对目标造成 6 点伤害。",
          trigger: "OnPlay",
          priority: 5,
          kind: {
            type: "DirectDamage",
            amount: 6,
            target: { type: "ContextTarget" },
          },
        },
      ];
    case "frost-bolt":
      return [
        {
          id: effectId(1),
          description: "寒霜打击：对目标造成 4 点伤害。",
          trigger: "OnPlay",
          priority: 5,
          kind: {
            type: "DirectDamage",
            amount: 4,
            target: { type: "ContextTarget" },
          },
        },
      ];
    case "arcane-scholar":
      return [
        {
          id: effectId(1),
          description: "研读：抽一张牌。",
          trigger: "OnPlay",
          priority: 4,
          kind: {
            type: "DrawCard",
            count: 1,
            target: { type: "SourcePlayer" },
          },
        },
      ];
    case "vanguard-footman":
      return [
        {
          id: effectId(1),
          description: "哨岗恢复：回合结束时为英雄恢复 1 点生命。",
          trigger: "OnTurnEnd",
          priority: 3,
          kind: { type: "Heal", amount: 1, target: { type: "SourcePlayer" } },
        },
      ];
    case "guardian-golem":
      return [
        {
          id: effectId(1),
          description: "守护余韵：亡语为英雄恢复 3 点生命。",
          trigger: "OnDeath",
          priority: 4,
          kind: { type: "Heal", amount: 3, target: { type: "SourcePlayer" } },
        },
      ];
    case "celestial-blessing":
      return [
        {
          id: effectId(1),
          description: "祈福：恢复目标 5 点生命。",
          trigger: "OnPlay",
          priority: 5,
          kind: { type: "Heal", amount: 5, target: { type: "ContextTarget" } },
        },
      ];
    case "radiant-healer":
      return [
        {
          id: effectId(1),
          description: "光辉治疗：回合结束时为英雄恢复 2 点生命。",
          trigger: "OnTurnEnd",
          priority: 3,
          kind: { type: "Heal", amount: 2, target: { type: "SourcePlayer" } },
        },
      ];
    case "stormcaller-adept":
      return [
        {
          id: effectId(1),
          description: "雷鸣脉冲：回合开始时对敌方英雄造成 1 点伤害。",
          trigger: "OnTurnStart",
          priority: 3,
          kind: {
            type: "DirectDamage",
            amount: 1,
            target: { type: "OpponentOfSource" },
          },
        },
      ];
    case "meteor-strike":
      return [
        {
          id: effectId(1),
          description: "流星轰击：对敌方英雄造成 3 点伤害并抽一张牌。",
          trigger: "OnPlay",
          priority: 5,
          kind: {
            type: "Composite",
            effects: [
              {
                type: "DirectDamage",
                amount: 3,
                target: { type: "OpponentOfSource" },
              },
              { type: "DrawCard", count: 1, target: { type: "SourcePlayer" } },
            ],
          },
        },
      ];
    case "shadowblade-adept":
      return [
        {
          id: effectId(1),
          description: "暗刃突袭：攻击时额外造成 2 点伤害。",
          trigger: "OnAttack",
          priority: 4,
          kind: {
            type: "DirectDamage",
            amount: 2,
            target: { type: "ContextTarget" },
          },
        },
      ];
    case "steel-bulwark":
      return [
        {
          id: effectId(1),
          description: "钢铁庇护：回合开始时为英雄恢复 2 点生命。",
          trigger: "OnTurnStart",
          priority: 3,
          kind: { type: "Heal", amount: 2, target: { type: "SourcePlayer" } },
        },
      ];
    case "ember-phoenix":
      return [
        {
          id: effectId(1),
          description: "焚羽余烬：亡语对敌方英雄造成 2 点伤害。",
          trigger: "OnDeath",
          priority: 4,
          kind: {
            type: "DirectDamage",
            amount: 2,
            target: { type: "OpponentOfSource" },
          },
        },
      ];
    default:
      return [];
  }
}

function getDeckById(id: string): DeckList {
  if (id === PLAYER_STARTER_DECK.id) {
    return PLAYER_STARTER_DECK;
  }
  return ENEMY_DECKS[id] ?? PLAYER_STARTER_DECK;
}

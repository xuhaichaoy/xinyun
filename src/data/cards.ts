import type { CardType } from "@/types/domain";

export type CardTargetSide = "self" | "ally" | "enemy" | "any" | "none";

export interface CardDefinition {
  id: number;
  slug: string;
  name: string;
  type: CardType;
  cost: number;
  attack?: number;
  health?: number;
  ability?: string;
  description: string;
  lore?: string;
  guide?: string;
  tags?: string[];
  keywords?: string[];
  target?: CardTargetSide;
}

const CARD_LIBRARY: CardDefinition[] = [
  {
    id: 1,
    slug: "fireball",
    name: "火球术",
    type: "Spell",
    cost: 4,
    ability: "目标角色：造成 6 点火焰伤害。",
    description: "精准的直伤法术，常用于终结或解场。",
    guide: "留给残血英雄或高威胁随从，确保造成致命打击。",
    tags: ["终结", "直伤"],
    keywords: ["法术", "爆发"],
    target: "enemy",
  },
  {
    id: 2,
    slug: "frost-bolt",
    name: "寒霜之矢",
    type: "Spell",
    cost: 2,
    ability: "目标角色：造成 4 点寒霜伤害。",
    description: "低费解场法术，及时削弱对手关键单位。",
    guide: "搭配随从补刀，稳定处理高威胁目标。",
    tags: ["控制", "直伤"],
    keywords: ["法术"],
    target: "enemy",
  },
  {
    id: 3,
    slug: "arcane-scholar",
    name: "奥术学者",
    type: "Unit",
    cost: 2,
    attack: 2,
    health: 3,
    ability: "战吼：抽一张牌。",
    description: "低费补牌点，既能占场又能循环卡牌。",
    guide: "最佳 2 费行动，若有法术配合可延续强度。",
    tags: ["节奏", "过牌"],
    keywords: ["战吼"],
  },
  {
    id: 4,
    slug: "vanguard-footman",
    name: "先锋步兵",
    type: "Unit",
    cost: 1,
    attack: 1,
    health: 2,
    ability: "哨岗：你的回合结束时为英雄恢复 1 点生命。",
    description: "稳定的护卫，持续为英雄回复血量。",
    guide: "前期站场拖住攻势，同时逐回合抬血。",
    tags: ["基础", "续航"],
    keywords: ["回复"],
  },
  {
    id: 5,
    slug: "guardian-golem",
    name: "守护傀儡",
    type: "Unit",
    cost: 5,
    attack: 5,
    health: 6,
    ability: "亡语：为你的英雄恢复 3 点生命。",
    description: "结实的守卫，即使倒下也能回补英雄血量。",
    guide: "吸收关键伤害后亡语回血，为后续法术赢得空间。",
    tags: ["后期", "续航"],
    keywords: ["亡语", "回复"],
  },
  {
    id: 6,
    slug: "celestial-blessing",
    name: "天体祈福",
    type: "Spell",
    cost: 3,
    ability: "恢复任意目标 5 点生命。",
    description: "指向治疗，快速修补英雄或核心随从血量。",
    guide: "优先拯救高价值单位，或在关键时刻抬高英雄血量。",
    tags: ["治疗", "防守"],
    keywords: ["法术", "治疗"],
    target: "ally",
  },
  {
    id: 7,
    slug: "radiant-healer",
    name: "光辉医师",
    type: "Unit",
    cost: 3,
    attack: 2,
    health: 4,
    ability: "光辉：你的回合结束时为英雄恢复 2 点生命。",
    description: "持续治疗的辅助随从，稳步抬升英雄血量。",
    guide: "守住场面，让每个回合的光辉治疗积累优势。",
    tags: ["治疗", "辅助"],
    keywords: ["回复"],
  },
  {
    id: 8,
    slug: "stormcaller-adept",
    name: "唤雷学徒",
    type: "Unit",
    cost: 4,
    attack: 3,
    health: 3,
    ability: "雷鸣：在你的回合开始时对敌方英雄造成 1 点伤害。",
    description: "步步紧逼的电击学徒，让对手血线持续承压。",
    guide: "搭配直伤法术迅速推进节奏，迫使敌方进入斩杀线。",
    tags: ["爆发", "推进"] ,
    keywords: ["直伤"],
  },
  {
    id: 9,
    slug: "meteor-strike",
    name: "流星打击",
    type: "Spell",
    cost: 6,
    ability: "对敌方英雄造成 3 点伤害并抽一张牌。",
    description: "兼具爆发与过牌的终结法术，压低敌方血线。",
    guide: "用于推进斩杀或补牌续航，打出后保持领先节奏。",
    tags: ["爆发", "直伤"],
    keywords: ["法术"],
    target: "none",
  },
  {
    id: 10,
    slug: "shadowblade-adept",
    name: "暗刃刺客",
    type: "Unit",
    cost: 3,
    attack: 4,
    health: 2,
    ability: "突袭：攻击时额外对目标造成 2 点伤害。",
    description: "灵活的刺客，发动攻击即爆发额外伤害。",
    guide: "抓准窗口攻击英雄或换掉关键随从，实现高额爆发。",
    tags: ["爆发", "刺客"],
    keywords: ["直伤"],
  },
  {
    id: 11,
    slug: "steel-bulwark",
    name: "钢铁壁垒",
    type: "Unit",
    cost: 2,
    attack: 2,
    health: 4,
    ability: "壁垒：你的回合开始时为英雄恢复 2 点生命。",
    description: "可靠的防线，每回合稳定抬高英雄血线。",
    guide: "站稳前排，让持续回复为后续法术争取时间。",
    tags: ["防御", "续航"],
    keywords: ["回复"],
  },
  {
    id: 12,
    slug: "ember-phoenix",
    name: "余烬凤凰",
    type: "Unit",
    cost: 5,
    attack: 4,
    health: 4,
    ability: "亡语：对敌方英雄造成 2 点伤害。",
    description: "即使倒下也会留下灼烧，逼迫敌方注意血线。",
    guide: "逼近斩杀线时登场，让亡语成为最后的补刀。",
    tags: ["亡语", "爆发"],
    keywords: ["亡语", "直伤"],
  },
];

const CARDS_BY_ID = new Map(CARD_LIBRARY.map((card) => [card.id, card]));
const CARDS_BY_SLUG = new Map(CARD_LIBRARY.map((card) => [card.slug, card]));
const CARD_INSTANCE_METADATA = new Map<number, CardDefinition>();

export const registerCardMetadata = (id: number, definition: CardDefinition) => {
  CARD_INSTANCE_METADATA.set(id, definition);
};

export const getCardDefinition = (id: number) =>
  CARDS_BY_ID.get(id) ?? CARD_INSTANCE_METADATA.get(id);

export const getCardBySlug = (slug: string) => CARDS_BY_SLUG.get(slug);

export const listCardDefinitions = () => CARD_LIBRARY.slice();

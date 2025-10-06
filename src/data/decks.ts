import { getCardBySlug, listCardDefinitions, type CardDefinition } from "./cards";

export interface DeckCardEntry {
  slug: string;
  copies: number;
}

export interface DeckList {
  id: string;
  name: string;
  description: string;
  hero?: string;
  playstyle: string;
  cards: DeckCardEntry[];
  tags?: string[];
}

export const PLAYER_STARTER_DECK: DeckList = {
  id: "starter-mage",
  name: "学者训练套牌",
  description: "围绕过牌、守护与法术爆发构建的入门组合。",
  playstyle: "控制节奏，利用法术斩杀。",
  hero: "艾琳·星辉",
  cards: [
    { slug: "vanguard-footman", copies: 2 },
    { slug: "arcane-scholar", copies: 2 },
    { slug: "fireball", copies: 2 },
    { slug: "frost-bolt", copies: 2 },
    { slug: "guardian-golem", copies: 1 },
    { slug: "celestial-blessing", copies: 2 },
    { slug: "radiant-healer", copies: 1 },
    { slug: "stormcaller-adept", copies: 1 },
    { slug: "ember-phoenix", copies: 1 },
  ],
  tags: ["入门", "节奏", "法术"],
};

export const ENEMY_DECKS: Record<string, DeckList> = {
  "bulwark-guard": {
    id: "bulwark-guard",
    name: "壁垒守卫",
    description: "厚实的护卫与治疗链，让敌人难以突破。",
    playstyle: "高护甲守护，消耗对手资源。",
    hero: "星港哨兵",
    cards: [
      { slug: "steel-bulwark", copies: 2 },
      { slug: "radiant-healer", copies: 2 },
      { slug: "guardian-golem", copies: 2 },
      { slug: "celestial-blessing", copies: 2 },
      { slug: "meteor-strike", copies: 1 },
    ],
    tags: ["防守", "回复"],
  },
  "raider-assault": {
    id: "raider-assault",
    name: "乱袭之矛",
    description: "大量爆发随从与直伤法术，追求快速击杀。",
    playstyle: "侵略性站场，利用潜行与高攻终结。",
    hero: "血矛游侠",
    cards: [
      { slug: "shadowblade-adept", copies: 2 },
      { slug: "stormcaller-adept", copies: 1 },
      { slug: "fireball", copies: 2 },
      { slug: "frost-bolt", copies: 2 },
      { slug: "meteor-strike", copies: 1 },
      { slug: "ember-phoenix", copies: 1 },
    ],
    tags: ["进攻", "爆发"],
  },
};

export const getDeckList = (id: string) =>
  id === PLAYER_STARTER_DECK.id ? PLAYER_STARTER_DECK : ENEMY_DECKS[id];

export const listDecks = () => [PLAYER_STARTER_DECK, ...Object.values(ENEMY_DECKS)];

export const getCardPoolForDeck = (deck: DeckList) =>
  deck.cards
    .flatMap((entry) =>
      Array.from({ length: entry.copies }, () => getCardBySlug(entry.slug) ?? null)
    )
    .filter((definition): definition is CardDefinition => Boolean(definition));

export const resolveDeckEntries = (deck: DeckList) =>
  deck.cards.flatMap((entry) => Array(entry.copies).fill(entry.slug));

use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const DEFAULT_MAX_HAND_SIZE: u8 = 10;
const DEFAULT_MAX_BOARD_SIZE: u8 = 7;

use super::effects::{
    EffectCondition, EffectContext, EffectEngine, EffectKind, EffectTarget, EffectTrigger,
};

/// 全局唯一的卡牌标识。
pub type CardId = u32;
/// 玩家标识。
pub type PlayerId = u8;
/// 卡牌效果标识。
pub type EffectId = u32;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum VictoryReason {
    HealthDepleted { loser: PlayerId },
    DeckOut { loser: PlayerId },
    Special { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VictoryState {
    pub winner: PlayerId,
    pub reason: VictoryReason,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CardType {
    Unit,
    Spell,
}

impl Default for CardType {
    fn default() -> Self {
        CardType::Unit
    }
}

/// 卡牌附带的效果描述。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CardEffect {
    pub id: EffectId,
    pub description: String,
    #[serde(default)]
    pub trigger: EffectTrigger,
    #[serde(default)]
    pub priority: i8,
    pub kind: EffectKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub condition: Option<EffectCondition>,
}

impl CardEffect {
    pub fn new(
        id: EffectId,
        description: impl Into<String>,
        trigger: EffectTrigger,
        priority: i8,
        kind: EffectKind,
    ) -> Self {
        Self {
            id,
            description: description.into(),
            trigger,
            priority,
            kind,
            condition: None,
        }
    }

    pub fn with_condition(mut self, condition: EffectCondition) -> Self {
        self.condition = Some(condition);
        self
    }

    pub fn direct_damage(
        id: EffectId,
        description: impl Into<String>,
        trigger: EffectTrigger,
        priority: i8,
        amount: i16,
        target: EffectTarget,
    ) -> Self {
        Self::new(
            id,
            description,
            trigger,
            priority,
            EffectKind::DirectDamage { amount, target },
        )
    }

    pub fn heal(
        id: EffectId,
        description: impl Into<String>,
        trigger: EffectTrigger,
        priority: i8,
        amount: i16,
        target: EffectTarget,
    ) -> Self {
        Self::new(
            id,
            description,
            trigger,
            priority,
            EffectKind::Heal { amount, target },
        )
    }

    pub fn draw_card(
        id: EffectId,
        description: impl Into<String>,
        trigger: EffectTrigger,
        priority: i8,
        count: u8,
        target: EffectTarget,
    ) -> Self {
        Self::new(
            id,
            description,
            trigger,
            priority,
            EffectKind::DrawCard { count, target },
        )
    }
}

/// 战斗中使用的卡牌数据。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Card {
    pub id: CardId,
    pub name: String,
    pub cost: u8,
    pub attack: i16,
    pub health: i16,
    #[serde(default)]
    pub card_type: CardType,
    #[serde(default)]
    pub exhausted: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub effects: Vec<CardEffect>,
}

impl Card {
    pub fn new(
        id: CardId,
        name: impl Into<String>,
        cost: u8,
        attack: i16,
        health: i16,
        card_type: CardType,
        effects: Vec<CardEffect>,
    ) -> Self {
        Self {
            id,
            name: name.into(),
            cost,
            attack,
            health,
            card_type,
            exhausted: matches!(card_type, CardType::Unit),
            effects,
        }
    }
}

/// 玩家状态，包括手牌、战场等信息。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Player {
    pub id: PlayerId,
    pub health: i16,
    #[serde(default)]
    pub armor: u8,
    pub mana: u8,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub hand: Vec<Card>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub board: Vec<Card>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deck: Vec<Card>,
}

impl Player {
    pub fn new(
        id: PlayerId,
        health: i16,
        armor: u8,
        mana: u8,
        hand: Vec<Card>,
        board: Vec<Card>,
        deck: Vec<Card>,
    ) -> Self {
        Self {
            id,
            health,
            armor,
            mana,
            hand,
            board,
            deck,
        }
    }

    pub fn find_card_in_hand_index(&self, card_id: CardId) -> Option<usize> {
        self.hand.iter().position(|card| card.id == card_id)
    }

    pub fn remove_card_from_hand(&mut self, card_id: CardId) -> Option<Card> {
        let idx = self.find_card_in_hand_index(card_id)?;
        Some(self.hand.remove(idx))
    }

    pub fn find_card_on_board_mut(&mut self, card_id: CardId) -> Option<&mut Card> {
        self.board.iter_mut().find(|card| card.id == card_id)
    }

    pub fn ready_board(&mut self) {
        for card in &mut self.board {
            card.exhausted = false;
        }
    }
}

/// 游戏阶段。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum GamePhase {
    Mulligan,
    Main,
    Combat,
    End,
}

impl Default for GamePhase {
    fn default() -> Self {
        Self::Mulligan
    }
}

/// 游戏事件流。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum GameEvent {
    CardDrawn {
        player_id: PlayerId,
        card_id: CardId,
    },
    CardPlayed {
        player_id: PlayerId,
        card_id: CardId,
        #[serde(skip_serializing_if = "Option::is_none")]
        target_id: Option<CardId>,
    },
    AttackDeclared {
        attacker_owner: PlayerId,
        attacker_id: CardId,
        defender_owner: PlayerId,
        #[serde(skip_serializing_if = "Option::is_none")]
        defender_id: Option<CardId>,
    },
    DamageResolved {
        source_player: PlayerId,
        #[serde(skip_serializing_if = "Option::is_none")]
        source_card: Option<CardId>,
        target_player: PlayerId,
        #[serde(skip_serializing_if = "Option::is_none")]
        target_card: Option<CardId>,
        amount: i16,
    },
    CardHealed {
        player_id: PlayerId,
        #[serde(skip_serializing_if = "Option::is_none")]
        card_id: Option<CardId>,
        amount: i16,
    },
    CardDestroyed {
        player_id: PlayerId,
        card: Card,
    },
    CardBurned {
        player_id: PlayerId,
        card: Card,
    },
    MulliganApplied {
        player_id: PlayerId,
        replaced: Vec<CardId>,
    },
    TurnEnded {
        player_id: PlayerId,
    },
    GameWon {
        winner: PlayerId,
        reason: VictoryReason,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum IntegrityError {
    InvalidPlayerIndex { player_id: PlayerId },
    DuplicateCardId { card_id: CardId },
    NegativeHealth { player_id: PlayerId, value: i16 },
    ManaOutOfRange { player_id: PlayerId, value: u8 },
}

/// 游戏整体状态。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GameState {
    #[serde(default)]
    pub players: Vec<Player>,
    pub current_player: PlayerId,
    pub turn: u32,
    pub phase: GamePhase,
    #[serde(default)]
    pub max_hand_size: u8,
    #[serde(default)]
    pub max_board_size: u8,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mulligan_completed: Vec<PlayerId>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub event_log: Vec<GameEvent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outcome: Option<VictoryState>,
}

impl GameState {
    pub fn new(players: Vec<Player>, current_player: PlayerId) -> Self {
        Self {
            players,
            current_player,
            turn: 1,
            phase: GamePhase::default(),
            max_hand_size: DEFAULT_MAX_HAND_SIZE,
            max_board_size: DEFAULT_MAX_BOARD_SIZE,
            mulligan_completed: Vec::new(),
            event_log: Vec::new(),
            outcome: None,
        }
    }

    pub fn with_phase(mut self, phase: GamePhase) -> Self {
        self.phase = phase;
        self
    }

    pub fn record_event(&mut self, event: GameEvent) {
        self.event_log.push(event);
    }

    pub fn reset_for_mulligan(&mut self) {
        self.phase = GamePhase::Mulligan;
        self.turn = 0;
        self.mulligan_completed.clear();
    }

    pub fn mark_mulligan_completed(&mut self, player_id: PlayerId) {
        if !self.mulligan_completed.contains(&player_id) {
            self.mulligan_completed.push(player_id);
        }
    }

    pub fn mulligan_completed(&self, player_id: PlayerId) -> bool {
        self.mulligan_completed.contains(&player_id)
    }

    pub fn all_mulligans_completed(&self) -> bool {
        self.players
            .iter()
            .all(|player| self.mulligan_completed.contains(&player.id))
    }

    pub fn get_player(&self, id: PlayerId) -> Option<&Player> {
        self.players.iter().find(|player| player.id == id)
    }

    pub fn get_player_mut(&mut self, id: PlayerId) -> Option<&mut Player> {
        self.players.iter_mut().find(|player| player.id == id)
    }

    pub fn player_index(&self, id: PlayerId) -> Option<usize> {
        self.players.iter().position(|player| player.id == id)
    }

    pub fn opponent_of(&self, player_id: PlayerId) -> Option<PlayerId> {
        self.players
            .iter()
            .find(|player| player.id != player_id)
            .map(|player| player.id)
    }

    pub fn is_finished(&self) -> bool {
        self.outcome.is_some()
    }

    pub fn damage_player(
        &mut self,
        source_player: PlayerId,
        source_card: Option<CardId>,
        target_player: PlayerId,
        amount: i16,
    ) -> Option<GameEvent> {
        let player = self.get_player_mut(target_player)?;
        if amount <= 0 {
            return None;
        }

        let mut remaining = amount;
        if player.armor > 0 {
            let absorbed = remaining.min(player.armor as i16);
            player.armor = player.armor.saturating_sub(absorbed as u8);
            remaining -= absorbed;
        }

        if remaining > 0 {
            player.health -= remaining;
        }

        let event = GameEvent::DamageResolved {
            source_player,
            source_card,
            target_player,
            target_card: None,
            amount,
        };

        if player.health <= 0 {
            if let Some(winner) = self
                .players
                .iter()
                .find(|p| p.id != target_player)
                .map(|p| p.id)
            {
                self.declare_victory(
                    winner,
                    VictoryReason::HealthDepleted {
                        loser: target_player,
                    },
                );
            }
        }

        Some(event)
    }

    pub fn damage_card(
        &mut self,
        source_player: PlayerId,
        source_card: Option<CardId>,
        target_player: PlayerId,
        target_card: CardId,
        amount: i16,
    ) -> Vec<GameEvent> {
        let mut events = Vec::new();
        if amount <= 0 {
            return events;
        }

        if let Some(player) = self.get_player_mut(target_player) {
            if let Some(pos) = player.board.iter().position(|card| card.id == target_card) {
                let mut destroyed_card = None;
                if let Some(card) = player.board.get_mut(pos) {
                    card.health -= amount;
                    events.push(GameEvent::DamageResolved {
                        source_player,
                        source_card,
                        target_player,
                        target_card: Some(target_card),
                        amount,
                    });
                    if card.health <= 0 {
                        destroyed_card = Some(card.clone());
                    }
                }
                if let Some(dead_card) = destroyed_card {
                    player.board.remove(pos);
                    events.push(GameEvent::CardDestroyed {
                        player_id: target_player,
                        card: dead_card,
                    });
                }
            }
        }

        events
    }

    pub fn heal_player(&mut self, player_id: PlayerId, amount: i16) -> Option<GameEvent> {
        if amount <= 0 {
            return None;
        }
        let player = self.get_player_mut(player_id)?;
        player.health = player.health.saturating_add(amount);
        let event = GameEvent::CardHealed {
            player_id,
            card_id: None,
            amount,
        };
        Some(event)
    }

    pub fn heal_card(
        &mut self,
        player_id: PlayerId,
        card_id: CardId,
        amount: i16,
    ) -> Option<GameEvent> {
        if amount <= 0 {
            return None;
        }
        let player = self.get_player_mut(player_id)?;
        if let Some(card) = player.find_card_on_board_mut(card_id) {
            card.health = card.health.saturating_add(amount);
            let event = GameEvent::CardHealed {
                player_id,
                card_id: Some(card_id),
                amount,
            };
            return Some(event);
        }
        None
    }

    pub fn draw_card(&mut self, player_id: PlayerId) -> Option<GameEvent> {
        let max_hand_size = self.max_hand_size;
        let player = self.get_player_mut(player_id)?;
        if player.deck.is_empty() {
            if let Some(winner) = self.opponent_of(player_id) {
                self.declare_victory(winner, VictoryReason::DeckOut { loser: player_id });
            }
            return None;
        }

        let card = player.deck.pop()?;
        let card_id = card.id;
        if player.hand.len() as u8 >= max_hand_size {
            let burned = GameEvent::CardBurned { player_id, card };
            Some(burned)
        } else {
            player.hand.push(card);
            let event = GameEvent::CardDrawn { player_id, card_id };
            Some(event)
        }
    }

    pub fn put_card_on_bottom_of_deck(&mut self, player_id: PlayerId, card: Card) {
        if let Some(player) = self.get_player_mut(player_id) {
            player.deck.insert(0, card);
        }
    }

    pub fn draw_initial_hand(&mut self, cards: u8) -> Vec<GameEvent> {
        let mut events = Vec::new();
        if cards == 0 {
            return events;
        }

        let player_ids: Vec<PlayerId> = self.players.iter().map(|player| player.id).collect();
        for _ in 0..cards {
            for player_id in &player_ids {
                if let Some(event) = self.draw_card(*player_id) {
                    self.record_event(event.clone());
                    events.push(event);
                }
            }
        }
        events
    }

    pub fn ready_player(&mut self, player_id: PlayerId) {
        if let Some(player) = self.get_player_mut(player_id) {
            player.ready_board();

            // 恢复法力（每回合+1，最大10）
            player.mana = (player.mana + 1).min(10);

            // 抽一张牌（只在牌库不为空时）
            if !player.deck.is_empty() {
                if let Some(event) = self.draw_card(player_id) {
                    self.record_event(event.clone());
                }
            }
        }
    }

    pub fn advance_phase(&mut self) {
        self.phase = match self.phase {
            GamePhase::Mulligan => GamePhase::Main,
            GamePhase::Main => GamePhase::Combat,
            GamePhase::Combat => GamePhase::End,
            GamePhase::End => GamePhase::Main,
        };
    }

    pub fn start_turn(&mut self, player_id: PlayerId) {
        self.current_player = player_id;
        self.phase = GamePhase::Main;
        // 回合数现在由end_turn处理，这里不需要增加
        self.ready_player(player_id);
    }

    pub fn end_turn(&mut self) {
        // 不调用advance_phase()，因为前端已经通过ensurePhase处理了阶段推进
        if let Some(next_player) = self.opponent_of(self.current_player) {
            self.current_player = next_player;
            self.turn += 1; // 增加回合数
            self.phase = GamePhase::Main; // 直接进入Main阶段
                                          // 准备下一个玩家的回合（恢复法力、抽牌等）
            self.ready_player(next_player);
        }
    }

    pub fn evaluate_victory(&mut self) -> Option<VictoryState> {
        if let Some(outcome) = &self.outcome {
            return Some(outcome.clone());
        }

        let defeated: Vec<PlayerId> = self
            .players
            .iter()
            .filter(|player| player.health <= 0)
            .map(|player| player.id)
            .collect();

        if defeated.len() == 1 {
            let loser = defeated[0];
            if let Some(winner) = self.opponent_of(loser) {
                return Some(self.declare_victory(winner, VictoryReason::HealthDepleted { loser }));
            }
        } else if defeated.len() > 1 {
            if let Some(first) = self.players.first() {
                return Some(self.declare_victory(
                    first.id,
                    VictoryReason::Special {
                        reason: "Simultaneous defeat".into(),
                    },
                ));
            }
        }

        self.outcome.clone()
    }

    pub fn declare_victory(&mut self, winner: PlayerId, reason: VictoryReason) -> VictoryState {
        let victory = VictoryState { winner, reason };
        if self.outcome.is_none() {
            self.record_event(GameEvent::GameWon {
                winner: victory.winner,
                reason: victory.reason.clone(),
            });
            self.outcome = Some(victory.clone());
        }
        victory
    }

    pub fn integrity_check(&self) -> Result<(), IntegrityError> {
        if !self.players.iter().any(|p| p.id == self.current_player) {
            return Err(IntegrityError::InvalidPlayerIndex {
                player_id: self.current_player,
            });
        }

        let mut seen = HashSet::new();
        for player in &self.players {
            if player.health < -99 {
                return Err(IntegrityError::NegativeHealth {
                    player_id: player.id,
                    value: player.health,
                });
            }
            if player.mana > 20 {
                return Err(IntegrityError::ManaOutOfRange {
                    player_id: player.id,
                    value: player.mana,
                });
            }
            for card in player
                .hand
                .iter()
                .chain(player.board.iter())
                .chain(player.deck.iter())
            {
                if !seen.insert(card.id) {
                    return Err(IntegrityError::DuplicateCardId { card_id: card.id });
                }
            }
        }

        Ok(())
    }

    pub fn sample() -> Self {
        let fireball_effect = CardEffect::direct_damage(
            101,
            "Ignite: deal 6 damage to a chosen target",
            EffectTrigger::OnPlay,
            5,
            6,
            EffectTarget::ContextTarget,
        );

        let draw_effect = CardEffect::draw_card(
            102,
            "Insight: draw a card",
            EffectTrigger::OnPlay,
            4,
            1,
            EffectTarget::SourcePlayer,
        );

        let blessing_effect = CardEffect::heal(
            103,
            "Blessing: restore 5 health to the target",
            EffectTrigger::OnPlay,
            5,
            5,
            EffectTarget::ContextTarget,
        );

        let footman_effect = CardEffect::heal(
            201,
            "Sentry: at turn end restore 1 health to your hero",
            EffectTrigger::OnTurnEnd,
            3,
            1,
            EffectTarget::SourcePlayer,
        );

        let guardian_death_effect = CardEffect::heal(
            202,
            "Last Stand: on death restore 3 health to your hero",
            EffectTrigger::OnDeath,
            4,
            3,
            EffectTarget::SourcePlayer,
        );

        let meteor_effect = CardEffect::new(
            203,
            "Meteor Strike: deal 3 to opposing hero and draw a card",
            EffectTrigger::OnPlay,
            5,
            EffectKind::Composite {
                effects: vec![
                    EffectKind::DirectDamage {
                        amount: 3,
                        target: EffectTarget::OpponentOfSource,
                    },
                    EffectKind::DrawCard {
                        count: 1,
                        target: EffectTarget::SourcePlayer,
                    },
                ],
            },
        );

        let shadowblade_effect = CardEffect::direct_damage(
            204,
            "Shadow Lunge: on attack deal 2 additional damage to the target",
            EffectTrigger::OnAttack,
            4,
            2,
            EffectTarget::ContextTarget,
        );

        let bulwark_effect = CardEffect::heal(
            205,
            "Bulwark: at turn start restore 2 health to your hero",
            EffectTrigger::OnTurnStart,
            3,
            2,
            EffectTarget::SourcePlayer,
        );

        let fireball_hand_p1 = Card::new(
            1,
            "Fireball",
            4,
            0,
            0,
            CardType::Spell,
            vec![fireball_effect.clone()],
        );

        let mut footman_board_p1 = Card::new(
            2,
            "Vanguard Footman",
            1,
            1,
            2,
            CardType::Unit,
            vec![footman_effect.clone()],
        );
        footman_board_p1.exhausted = false;

        let arcane_scholar_hand_p1 = Card::new(
            3,
            "Arcane Scholar",
            2,
            2,
            3,
            CardType::Unit,
            vec![draw_effect.clone()],
        );

        let guardian_golem_deck_p1 = Card::new(
            4,
            "Guardian Golem",
            5,
            5,
            6,
            CardType::Unit,
            vec![guardian_death_effect.clone()],
        );

        let celestial_blessing_deck_p1 = Card::new(
            5,
            "Celestial Blessing",
            3,
            0,
            0,
            CardType::Spell,
            vec![blessing_effect.clone()],
        );

        let meteor_strike_deck_p2 = Card::new(
            6,
            "Meteor Strike",
            4,
            0,
            0,
            CardType::Spell,
            vec![meteor_effect.clone()],
        );

        let shadowblade_hand_p2 = Card::new(
            7,
            "Shadowblade Adept",
            3,
            4,
            2,
            CardType::Unit,
            vec![shadowblade_effect.clone()],
        );

        let mut bulwark_board_p2 = Card::new(
            8,
            "Steel Bulwark",
            2,
            2,
            4,
            CardType::Unit,
            vec![bulwark_effect.clone()],
        );
        bulwark_board_p2.exhausted = false;

        let player_one = Player::new(
            0,
            30,
            0,
            5,
            vec![fireball_hand_p1.clone(), arcane_scholar_hand_p1.clone()],
            vec![footman_board_p1.clone()],
            vec![
                guardian_golem_deck_p1.clone(),
                celestial_blessing_deck_p1.clone(),
            ],
        );

        let player_two = Player::new(
            1,
            30,
            0,
            4,
            vec![shadowblade_hand_p2.clone()],
            vec![bulwark_board_p2.clone()],
            vec![meteor_strike_deck_p2.clone()],
        );

        let mut state = GameState::new(vec![player_one, player_two], 0).with_phase(GamePhase::Main);
        state.record_event(GameEvent::CardDrawn {
            player_id: 0,
            card_id: arcane_scholar_hand_p1.id,
        });
        state.record_event(GameEvent::CardPlayed {
            player_id: 0,
            card_id: arcane_scholar_hand_p1.id,
            target_id: None,
        });
        state.record_event(GameEvent::CardPlayed {
            player_id: 1,
            card_id: shadowblade_hand_p2.id,
            target_id: None,
        });

        let mut engine = EffectEngine::default();
        let context = EffectContext::new(EffectTrigger::OnPlay, 0, state.current_player)
            .with_source_card(arcane_scholar_hand_p1.id);
        engine.queue_card_effects(&arcane_scholar_hand_p1, context);
        let _ = engine.resolve_all(&mut state);
        state
    }
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            players: Vec::new(),
            current_player: 0,
            turn: 1,
            phase: GamePhase::default(),
            max_hand_size: DEFAULT_MAX_HAND_SIZE,
            max_board_size: DEFAULT_MAX_BOARD_SIZE,
            mulligan_completed: Vec::new(),
            event_log: Vec::new(),
            outcome: None,
        }
    }
}

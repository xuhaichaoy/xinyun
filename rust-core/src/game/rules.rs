use serde::{Deserialize, Serialize};

use super::{
    effects::{EffectContext, EffectEngine, EffectKind, EffectTarget, EffectTrigger},
    state::{
        Card, CardId, CardType, GameEvent, GamePhase, GameState, IntegrityError, PlayerId,
        VictoryState,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlayCardAction {
    pub player_id: PlayerId,
    pub card_id: CardId,
    #[serde(default)]
    pub target_player: Option<PlayerId>,
    #[serde(default)]
    pub target_card: Option<CardId>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AttackAction {
    pub attacker_owner: PlayerId,
    pub attacker_id: CardId,
    pub defender_owner: PlayerId,
    #[serde(default)]
    pub defender_card: Option<CardId>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MulliganAction {
    pub player_id: PlayerId,
    #[serde(default)]
    pub replacements: Vec<CardId>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DiscardCardAction {
    pub player_id: PlayerId,
    pub pending_id: u64,
    pub discard_card_id: CardId,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum RuleError {
    GameFinished,
    NotPlayerTurn,
    PlayerNotFound {
        player_id: PlayerId,
    },
    InvalidPhase {
        expected: GamePhase,
        actual: GamePhase,
    },
    CardNotFound {
        card_id: CardId,
    },
    InvalidTarget,
    InsufficientMana {
        required: u8,
        available: u8,
    },
    CardTypeMismatch {
        expected: CardType,
        actual: CardType,
    },
    UnitExhausted {
        card_id: CardId,
    },
    InvalidAttackTarget,
    AttackerNotFound {
        card_id: CardId,
    },
    ZeroAttackUnit {
        card_id: CardId,
    },
    BoardFull,
    MulliganPhaseOnly,
    MulliganAlreadyCompleted {
        player_id: PlayerId,
    },
    PendingDiscardNotFound {
        player_id: PlayerId,
        pending_id: u64,
    },
    IntegrityViolation {
        error: IntegrityError,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleResolution {
    pub state: GameState,
    pub events: Vec<GameEvent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub victory: Option<VictoryState>,
}

impl RuleResolution {
    pub fn new(state: GameState, mut events: Vec<GameEvent>) -> Self {
        let victory = state.outcome.clone();
        if let Some(ref outcome) = victory {
            let has_event = events
                .iter()
                .any(|event| matches!(event, GameEvent::GameWon { .. }));
            if !has_event {
                events.push(GameEvent::GameWon {
                    winner: outcome.winner,
                    reason: outcome.reason.clone(),
                });
            }
        }

        Self {
            state,
            events,
            victory,
        }
    }
}

#[derive(Default)]
pub struct RuleEngine {
    effect_engine: EffectEngine,
}

impl RuleEngine {
    pub fn new() -> Self {
        Self {
            effect_engine: EffectEngine::default(),
        }
    }

    fn ensure_play_phase(state: &GameState) -> Result<(), RuleError> {
        if state.phase != GamePhase::Main {
            return Err(RuleError::InvalidPhase {
                expected: GamePhase::Main,
                actual: state.phase.clone(),
            });
        }
        Ok(())
    }

    fn ensure_combat_phase(state: &GameState) -> Result<(), RuleError> {
        if state.phase != GamePhase::Combat {
            return Err(RuleError::InvalidPhase {
                expected: GamePhase::Combat,
                actual: state.phase.clone(),
            });
        }
        Ok(())
    }

    fn ensure_mulligan_phase(state: &GameState) -> Result<(), RuleError> {
        if state.phase != GamePhase::Mulligan {
            return Err(RuleError::MulliganPhaseOnly);
        }
        Ok(())
    }

    fn ensure_turn_owner(state: &GameState, player_id: PlayerId) -> Result<(), RuleError> {
        if state.current_player != player_id {
            return Err(RuleError::NotPlayerTurn);
        }
        Ok(())
    }

    fn ensure_integrity(state: &GameState) -> Result<(), RuleError> {
        state
            .integrity_check()
            .map_err(|error| RuleError::IntegrityViolation { error })
    }

    fn requires_target(card: &Card) -> bool {
        card.effects.iter().any(|effect| match &effect.kind {
            EffectKind::DirectDamage { target, .. }
            | EffectKind::Heal { target, .. }
            | EffectKind::DrawCard { target, .. } => matches!(target, EffectTarget::ContextTarget),
            EffectKind::Composite { effects } => effects.iter().any(Self::requires_target_kind),
            EffectKind::Conditional { effect, .. } => Self::requires_target_kind(effect),
        })
    }

    fn requires_target_kind(kind: &EffectKind) -> bool {
        match kind {
            EffectKind::DirectDamage { target, .. }
            | EffectKind::Heal { target, .. }
            | EffectKind::DrawCard { target, .. } => matches!(target, EffectTarget::ContextTarget),
            EffectKind::Composite { effects } => effects.iter().any(Self::requires_target_kind),
            EffectKind::Conditional { effect, .. } => Self::requires_target_kind(effect),
        }
    }

    fn build_context(action: &PlayCardAction, state: &GameState) -> EffectContext {
        let mut ctx = EffectContext::new(
            EffectTrigger::OnPlay,
            action.player_id,
            state.current_player,
        )
        .with_source_card(action.card_id);
        if let Some(target_player) = action.target_player {
            if let Some(target_card) = action.target_card {
                ctx = ctx.with_target_card(target_player, target_card);
            } else {
                ctx = ctx.with_target_player(target_player);
            }
        }
        ctx
    }

    fn process_turn_start(
        &mut self,
        state: &mut GameState,
        player_id: PlayerId,
    ) -> Result<Vec<GameEvent>, RuleError> {
        state.current_player = player_id;
        state.phase = GamePhase::Main;

        Self::ensure_integrity(state)?;

        let mut events = Vec::new();

        if let Some(index) = state.player_index(player_id) {
            let board_snapshot: Vec<Card> = state.players[index].board.clone();
            for card in &board_snapshot {
                let ctx = EffectContext::new(EffectTrigger::OnTurnStart, player_id, state.current_player)
                    .with_source_card(card.id);
                self.effect_engine.queue_card_effects(card, ctx);
            }
        }

        let mut trigger_events = self.effect_engine.resolve_all(state);
        events.append(&mut trigger_events);

        if state.is_finished() {
            return Ok(events);
        }

        state.ready_player(player_id);

        if let Some(outcome) = state.evaluate_victory() {
            events.push(GameEvent::GameWon {
                winner: outcome.winner,
                reason: outcome.reason.clone(),
            });
        }

        Ok(events)
    }

    pub fn play_card(
        &mut self,
        state: &mut GameState,
        action: PlayCardAction,
    ) -> Result<Vec<GameEvent>, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }

        Self::ensure_integrity(state)?;
        Self::ensure_turn_owner(state, action.player_id)?;
        Self::ensure_play_phase(state)?;

        if action.target_card.is_some() && action.target_player.is_none() {
            return Err(RuleError::InvalidTarget);
        }
        if let Some(target_player) = action.target_player {
            state
                .get_player(target_player)
                .ok_or(RuleError::InvalidTarget)?;
            if let Some(target_card) = action.target_card {
                let target_exists = state
                    .get_player(target_player)
                    .and_then(|player| player.board.iter().find(|card| card.id == target_card))
                    .is_some();
                if !target_exists {
                    return Err(RuleError::InvalidTarget);
                }
            }
        }

        let player_index = state
            .player_index(action.player_id)
            .ok_or(RuleError::CardNotFound {
                card_id: action.card_id,
            })?;

        let available_mana = state.players[player_index].mana;
        let hand_index = state.players[player_index]
            .find_card_in_hand_index(action.card_id)
            .ok_or(RuleError::CardNotFound {
                card_id: action.card_id,
            })?;

        let cost = state.players[player_index].hand[hand_index].cost;
        if available_mana < cost {
            return Err(RuleError::InsufficientMana {
                required: cost,
                available: available_mana,
            });
        }

        let pending_card_type = state.players[player_index].hand[hand_index]
            .card_type
            .clone();
        if pending_card_type == CardType::Unit
            && state.players[player_index].board.len() as u8 >= state.max_board_size
        {
            return Err(RuleError::BoardFull);
        }

        let mut card = state.players[player_index].hand.remove(hand_index);

        if Self::requires_target(&card)
            && action.target_player.is_none()
            && action.target_card.is_none()
        {
            return Err(RuleError::InvalidTarget);
        }
        state.players[player_index].mana -= cost;

        let mut events = Vec::new();
        let play_event = GameEvent::CardPlayed {
            player_id: action.player_id,
            card_id: card.id,
            target_id: action.target_card,
        };
        state.record_event(play_event.clone());
        events.push(play_event);

        let context = Self::build_context(&action, state);

        match card.card_type {
            CardType::Unit => {
                card.exhausted = true;
                state.players[player_index].board.push(card);
                if let Some(board_card) = state.players[player_index].board.last() {
                    self.effect_engine.queue_card_effects(board_card, context);
                }
            }
            CardType::Spell => {
                self.effect_engine.queue_card_effects(&card, context);
            }
        }

        let mut effect_events = self.effect_engine.resolve_all(state);
        events.append(&mut effect_events);

        if let Some(outcome) = state.evaluate_victory() {
            events.push(GameEvent::GameWon {
                winner: outcome.winner,
                reason: outcome.reason.clone(),
            });
        }

        Ok(events)
    }

    pub fn attack(
        &mut self,
        state: &mut GameState,
        action: AttackAction,
    ) -> Result<Vec<GameEvent>, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }

        Self::ensure_integrity(state)?;
        Self::ensure_turn_owner(state, action.attacker_owner)?;
        Self::ensure_combat_phase(state)?;

        if state.player_index(action.defender_owner).is_none() {
            return Err(RuleError::InvalidTarget);
        }
        if action.defender_owner == action.attacker_owner {
            return Err(RuleError::InvalidAttackTarget);
        }

        let attacker_index =
            state
                .player_index(action.attacker_owner)
                .ok_or(RuleError::AttackerNotFound {
                    card_id: action.attacker_id,
                })?;

        let attacker_pos = state.players[attacker_index]
            .board
            .iter()
            .position(|card| card.id == action.attacker_id)
            .ok_or(RuleError::AttackerNotFound {
                card_id: action.attacker_id,
            })?;

        // 先获取攻击者卡牌的信息
        let attacker_card_info = state.players[attacker_index].board[attacker_pos].clone();
        if attacker_card_info.card_type != CardType::Unit {
            return Err(RuleError::CardTypeMismatch {
                expected: CardType::Unit,
                actual: attacker_card_info.card_type.clone(),
            });
        }
        if attacker_card_info.exhausted {
            return Err(RuleError::UnitExhausted {
                card_id: attacker_card_info.id,
            });
        }
        if attacker_card_info.attack <= 0 {
            return Err(RuleError::ZeroAttackUnit {
                card_id: attacker_card_info.id,
            });
        }

        let mut events = Vec::new();
        let mut attack_ctx = EffectContext::new(
            EffectTrigger::OnAttack,
            action.attacker_owner,
            state.current_player,
        )
        .with_source_card(attacker_card_info.id);
        if let Some(defender_card_id) = action.defender_card {
            attack_ctx = attack_ctx.with_target_card(action.defender_owner, defender_card_id);
        } else {
            attack_ctx = attack_ctx.with_target_player(action.defender_owner);
        }
        self.effect_engine
            .queue_card_effects(&attacker_card_info, attack_ctx);
        let attack_event = GameEvent::AttackDeclared {
            attacker_owner: action.attacker_owner,
            attacker_id: action.attacker_id,
            defender_owner: action.defender_owner,
            defender_id: action.defender_card,
        };
        state.record_event(attack_event.clone());
        events.push(attack_event);

        let attacker_attack = attacker_card_info.attack;
        // 现在设置攻击者卡牌为疲惫状态
        state.players[attacker_index].board[attacker_pos].exhausted = true;

        if let Some(defender_card_id) = action.defender_card {
            let defender_index = state
                .player_index(action.defender_owner)
                .ok_or(RuleError::InvalidTarget)?;
            let defender_card_opt = state.players[defender_index]
                .board
                .iter()
                .find(|card| card.id == defender_card_id)
                .cloned();
            let defender_card = defender_card_opt.ok_or(RuleError::InvalidTarget)?;

            let mut dmg_events = state.damage_card(
                action.attacker_owner,
                Some(attacker_card_info.id),
                action.defender_owner,
                defender_card_id,
                attacker_attack,
            );
            for event in &dmg_events {
                state.record_event(event.clone());
            }
            events.append(&mut dmg_events);

            if defender_card.card_type == CardType::Unit && defender_card.attack > 0 {
                let mut retaliate_events = state.damage_card(
                    action.defender_owner,
                    Some(defender_card.id),
                    action.attacker_owner,
                    action.attacker_id,
                    defender_card.attack,
                );
                for event in &retaliate_events {
                    state.record_event(event.clone());
                }
                events.append(&mut retaliate_events);
            }
        } else {
            let damage_event = state.damage_player(
                action.attacker_owner,
                Some(action.attacker_id),
                action.defender_owner,
                attacker_attack,
            );
            if let Some(event) = damage_event {
                state.record_event(event.clone());
                events.push(event);
            }
        }

        let mut effect_events = self.effect_engine.resolve_all(state);
        events.append(&mut effect_events);

        if let Some(outcome) = state.evaluate_victory() {
            events.push(GameEvent::GameWon {
                winner: outcome.winner,
                reason: outcome.reason.clone(),
            });
        }

        Ok(events)
    }

    pub fn resolve_pending_discard(
        &mut self,
        state: &mut GameState,
        action: DiscardCardAction,
    ) -> Result<Vec<GameEvent>, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }

        Self::ensure_integrity(state)?;

        let player_index = state
            .player_index(action.player_id)
            .ok_or(RuleError::PlayerNotFound {
                player_id: action.player_id,
            })?;

        let pending = state
            .take_pending_discard(action.player_id, action.pending_id)
            .ok_or(RuleError::PendingDiscardNotFound {
                player_id: action.player_id,
                pending_id: action.pending_id,
            })?;

        let mut events = Vec::new();

        if action.discard_card_id == pending.drawn_card.id {
            let discard_event = GameEvent::CardDiscarded {
                player_id: action.player_id,
                card: pending.drawn_card,
            };
            state.record_event(discard_event.clone());
            events.push(discard_event);
            return Ok(events);
        }

        let player = &mut state.players[player_index];
        if let Some(pos) = player.find_card_in_hand_index(action.discard_card_id) {
            let discarded_card = player.hand.remove(pos);
            let discard_event = GameEvent::CardDiscarded {
                player_id: action.player_id,
                card: discarded_card,
            };
            state.record_event(discard_event.clone());
            events.push(discard_event);

            player.hand.push(pending.drawn_card.clone());
            let draw_event = GameEvent::CardDrawn {
                player_id: action.player_id,
                card_id: pending.drawn_card.id,
            };
            state.record_event(draw_event.clone());
            events.push(draw_event);

            Ok(events)
        } else {
            state.pending_discards.push(pending);
            Err(RuleError::CardNotFound {
                card_id: action.discard_card_id,
            })
        }
    }

    pub fn mulligan(
        &mut self,
        state: &mut GameState,
        action: MulliganAction,
    ) -> Result<Vec<GameEvent>, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }

        Self::ensure_integrity(state)?;
        Self::ensure_mulligan_phase(state)?;

        let player_index =
            state
                .player_index(action.player_id)
                .ok_or(RuleError::PlayerNotFound {
                    player_id: action.player_id,
                })?;

        if state.mulligan_completed(action.player_id) {
            return Err(RuleError::MulliganAlreadyCompleted {
                player_id: action.player_id,
            });
        }

        let mut replaced_ids = Vec::new();
        {
            let player = &mut state.players[player_index];
            let mut unique_replacements = action.replacements.clone();
            unique_replacements.sort_unstable();
            unique_replacements.dedup();

            for card_id in unique_replacements {
                if let Some(pos) = player.hand.iter().position(|card| card.id == card_id) {
                    let card = player.hand.remove(pos);
                    player.deck.insert(0, card);
                    replaced_ids.push(card_id);
                } else {
                    return Err(RuleError::CardNotFound { card_id });
                }
            }
        }

        let mut events = Vec::new();

        for _ in 0..replaced_ids.len() {
            if let Some(event) = state.draw_card(action.player_id) {
                state.record_event(event.clone());
                events.push(event);
            }
        }

        let mulligan_event = GameEvent::MulliganApplied {
            player_id: action.player_id,
            replaced: replaced_ids,
        };
        state.mark_mulligan_completed(action.player_id);
        state.record_event(mulligan_event.clone());
        events.push(mulligan_event);

        if state.all_mulligans_completed() {
            if state.turn == 0 {
                state.turn = 1;
            }
            // 不要直接跳到Main阶段，让正常的阶段流程处理
            // 这样确保OnTurnStart效果能正确触发
        }

        Ok(events)
    }

    pub fn start_turn(
        &mut self,
        state: &mut GameState,
        player_id: PlayerId,
    ) -> Result<Vec<GameEvent>, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }
        Self::ensure_integrity(state)?;
        if state.player_index(player_id).is_none() {
            return Err(RuleError::PlayerNotFound { player_id });
        }

        self.process_turn_start(state, player_id)
    }

    pub fn end_turn(&mut self, state: &mut GameState) -> Result<Vec<GameEvent>, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }
        Self::ensure_integrity(state)?;

        let current = state.current_player;
        let mut events = Vec::new();

        if let Some(index) = state.player_index(current) {
            let board_snapshot: Vec<Card> = state.players[index].board.clone();
            for card in &board_snapshot {
                let ctx =
                    EffectContext::new(EffectTrigger::OnTurnEnd, current, state.current_player)
                        .with_source_card(card.id);
                self.effect_engine.queue_card_effects(card, ctx);
            }
        }

        let mut trigger_events = self.effect_engine.resolve_all(state);
        events.append(&mut trigger_events);

        let end_event = GameEvent::TurnEnded { player_id: current };
        state.record_event(end_event.clone());
        events.push(end_event);

        if let Some(outcome) = state.evaluate_victory() {
            events.push(GameEvent::GameWon {
                winner: outcome.winner,
                reason: outcome.reason.clone(),
            });
            return Ok(events);
        }

        let next_player = state.opponent_of(current);
        state.end_turn();

        if state.is_finished() {
            return Ok(events);
        }

        if let Some(next_player) = next_player {
            if state.player_index(next_player).is_some() {
                let mut start_events = self.process_turn_start(state, next_player)?;
                events.append(&mut start_events);
            }
        }

        Ok(events)
    }

    pub fn check_victory(state: &mut GameState) -> Option<VictoryState> {
        state.evaluate_victory()
    }

    pub fn advance_phase(state: &mut GameState) -> Result<GamePhase, RuleError> {
        if state.is_finished() {
            return Err(RuleError::GameFinished);
        }
        Self::ensure_integrity(state)?;
        state.advance_phase();
        Ok(state.phase.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_state() -> GameState {
        let mut state = GameState::sample();
        state.phase = GamePhase::Combat;
        state
    }

    #[test]
    fn unit_attack_reduces_hero_health() {
        let mut engine = RuleEngine::new();
        let mut state = setup_state();

        let initial_health = state.get_player(1).expect("defender should exist").health;

        let action = AttackAction {
            attacker_owner: 0,
            attacker_id: 2,
            defender_owner: 1,
            defender_card: None,
        };

        let _events = engine
            .attack(&mut state, action)
            .expect("attack should succeed");

        let updated_health = state.get_player(1).expect("defender should exist").health;

        assert!(
            updated_health < initial_health,
            "defender health should be reduced"
        );
    }

    #[test]
    fn unit_attack_trades_with_opponent_unit() {
        let mut engine = RuleEngine::new();
        let mut state = setup_state();

        // Ensure defender unit exists on player 1 board (id 8 in sample state)
        let defender_before = state
            .get_player(1)
            .and_then(|player| player.board.iter().find(|card| card.id == 8))
            .expect("defender unit should exist")
            .health;

        let action = AttackAction {
            attacker_owner: 0,
            attacker_id: 2,
            defender_owner: 1,
            defender_card: Some(8),
        };

        let _events = engine
            .attack(&mut state, action)
            .expect("attack should succeed");

        let defender_after = state
            .get_player(1)
            .and_then(|player| player.board.iter().find(|card| card.id == 8))
            .map(|card| card.health)
            .unwrap_or_default();

        assert!(
            defender_after < defender_before,
            "defender unit health should drop"
        );

        let attacker_after = state
            .get_player(0)
            .and_then(|player| player.board.iter().find(|card| card.id == 2))
            .map(|card| card.health)
            .unwrap_or_default();

        assert!(
            attacker_after < 2,
            "attacker should also take retaliation damage"
        );
    }

    #[test]
    fn end_turn_triggers_next_player_start_effects() {
        let mut engine = RuleEngine::new();

        let healer_effect = CardEffect::heal(
            9001,
            "Healer",
            EffectTrigger::OnTurnStart,
            1,
            2,
            EffectTarget::SourcePlayer,
        );

        let mut healer = Card::new(100, "Turn Healer", 2, 2, 3, CardType::Unit, vec![healer_effect]);
        healer.exhausted = true;

        let deck_card_one = Card::new(101, "Deck Filler A", 1, 1, 1, CardType::Unit, Vec::new());
        let deck_card_two = Card::new(102, "Deck Filler B", 1, 1, 1, CardType::Unit, Vec::new());

        let player_one = Player::new(0, 30, 0, 3, Vec::new(), Vec::new(), vec![deck_card_one]);
        let player_two = Player::new(1, 25, 0, 3, Vec::new(), vec![healer.clone()], vec![deck_card_two]);

        let mut state = GameState::new(vec![player_one, player_two], 0).with_phase(GamePhase::Main);

        let events = engine
            .end_turn(&mut state)
            .expect("end_turn should succeed and start next turn");

        assert_eq!(state.current_player, 1, "turn should pass to next player");
        assert!(
            events.iter().any(|event| matches!(
                event,
                GameEvent::CardHealed {
                    player_id: 1,
                    card_id: None,
                    amount: 2
                }
            )),
            "start-of-turn heal should trigger"
        );

        let player_two_state = state.get_player(1).expect("player two should exist");
        assert!(
            player_two_state
                .board
                .iter()
                .all(|card| !card.exhausted),
            "board units should be refreshed"
        );
        assert_eq!(
            player_two_state.hand.len(),
            1,
            "next player should draw a card on turn start"
        );
    }
}

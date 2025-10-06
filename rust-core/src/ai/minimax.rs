use std::str::FromStr;
use std::time::Duration;
use web_sys::js_sys::Date;

use rand::rngs::SmallRng;
use rand::seq::SliceRandom;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};

use crate::game::{
    AttackAction, Card, CardId, CardType, EffectKind, EffectTarget, GameEvent, GameState,
    MulliganAction, PlayCardAction, PlayerId, RuleEngine, RuleError, RuleResolution,
};

#[derive(Debug, Clone, Copy)]
struct WasmInstant {
    timestamp: f64,
}

impl WasmInstant {
    fn now() -> Self {
        Self {
            timestamp: Date::now(),
        }
    }

    fn elapsed(&self) -> Duration {
        let elapsed_ms = Date::now() - self.timestamp;
        Duration::from_millis(elapsed_ms as u64)
    }
}

impl std::ops::Add<Duration> for WasmInstant {
    type Output = WasmInstant;

    fn add(self, duration: Duration) -> Self::Output {
        Self {
            timestamp: self.timestamp + duration.as_millis() as f64,
        }
    }
}

impl PartialOrd for WasmInstant {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.timestamp.partial_cmp(&other.timestamp)
    }
}

impl PartialEq for WasmInstant {
    fn eq(&self, other: &Self) -> bool {
        self.timestamp == other.timestamp
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type")]
pub enum GameAction {
    PlayCard { action: PlayCardAction },
    Mulligan { action: MulliganAction },
    Attack { action: AttackAction },
    EndTurn,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AiStrategy {
    Aggressive,
    Control,
    Combo,
    Random,
    Adaptive,
}

impl FromStr for AiStrategy {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "aggressive" | "aggro" => Ok(AiStrategy::Aggressive),
            "control" => Ok(AiStrategy::Control),
            "combo" => Ok(AiStrategy::Combo),
            "random" => Ok(AiStrategy::Random),
            "adaptive" | "balanced" => Ok(AiStrategy::Adaptive),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiDifficulty {
    Easy,
    Normal,
    Hard,
    Expert,
}

impl FromStr for AiDifficulty {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "easy" => Ok(AiDifficulty::Easy),
            "normal" | "medium" => Ok(AiDifficulty::Normal),
            "hard" => Ok(AiDifficulty::Hard),
            "expert" | "extreme" => Ok(AiDifficulty::Expert),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub depth: u8,
    pub randomness: f64,
    pub time_limit: Duration,
    pub strategy: AiStrategy,
}

impl AiConfig {
    pub fn from_difficulty(difficulty: AiDifficulty) -> Self {
        match difficulty {
            AiDifficulty::Easy => Self {
                depth: 1,
                randomness: 1.2,
                time_limit: Duration::from_millis(40),
                strategy: AiStrategy::Random,
            },
            AiDifficulty::Normal => Self {
                depth: 2,
                randomness: 0.6,
                time_limit: Duration::from_millis(90),
                strategy: AiStrategy::Control,
            },
            AiDifficulty::Hard => Self {
                depth: 3,
                randomness: 0.2,
                time_limit: Duration::from_millis(160),
                strategy: AiStrategy::Aggressive,
            },
            AiDifficulty::Expert => Self {
                depth: 4,
                randomness: 0.0,
                time_limit: Duration::from_millis(260),
                strategy: AiStrategy::Adaptive,
            },
        }
    }

    pub fn with_strategy(mut self, strategy: AiStrategy) -> Self {
        self.strategy = strategy;
        if matches!(self.strategy, AiStrategy::Random) {
            self.randomness = self.randomness.max(1.0);
        }
        self
    }
}

impl Default for AiConfig {
    fn default() -> Self {
        AiConfig::from_difficulty(AiDifficulty::Normal)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDecision {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<GameAction>,
    pub evaluation: f64,
    pub depth_reached: u8,
    pub nodes: u64,
    pub timed_out: bool,
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolution: Option<RuleResolution>,
    pub strategy: AiStrategy,
}

struct SearchStats {
    nodes: u64,
    depth_reached: u8,
    timed_out: bool,
}

impl SearchStats {
    fn new() -> Self {
        Self {
            nodes: 0,
            depth_reached: 0,
            timed_out: false,
        }
    }
}

pub struct AiAgent {
    config: AiConfig,
    rng: SmallRng,
}

impl AiAgent {
    pub fn new(config: AiConfig) -> Self {
        Self {
            config,
            rng: SmallRng::from_entropy(),
        }
    }

    pub fn with_seed(config: AiConfig, seed: u64) -> Self {
        Self {
            config,
            rng: SmallRng::seed_from_u64(seed),
        }
    }

    fn random_decision(
        &mut self,
        state: &GameState,
        player_id: PlayerId,
        start: WasmInstant,
        deadline: Option<WasmInstant>,
    ) -> AiDecision {
        let mut transitions = self.generate_transitions(state, state.current_player, deadline);
        if transitions.is_empty() {
            return AiDecision {
                action: None,
                evaluation: self.evaluate(state, player_id),
                depth_reached: 0,
                nodes: 0,
                timed_out: false,
                duration_ms: start.elapsed().as_millis() as u64,
                resolution: None,
                strategy: AiStrategy::Random,
            };
        }

        transitions.shuffle(&mut self.rng);
        let (action, new_state) = transitions.swap_remove(0);
        let resolution = self.simulate_resolution(state, &action).ok();

        AiDecision {
            action: Some(action),
            evaluation: self.evaluate(&new_state, player_id),
            depth_reached: 1,
            nodes: 1,
            timed_out: false,
            duration_ms: start.elapsed().as_millis() as u64,
            resolution,
            strategy: AiStrategy::Random,
        }
    }

    pub fn decide_action(&mut self, state: &GameState, player_id: PlayerId) -> AiDecision {
        let mut stats = SearchStats::new();
        let start = WasmInstant::now();
        let deadline = if self.config.time_limit.is_zero() {
            None
        } else {
            Some(start + self.config.time_limit)
        };

        let strategy = self.config.strategy;

        if strategy == AiStrategy::Random {
            return self.random_decision(state, player_id, start, deadline);
        }

        let mut best_action = None;
        let mut best_score = f64::NEG_INFINITY;
        let mut best_cmp = f64::NEG_INFINITY;

        if state.is_finished() {
            return AiDecision {
                action: None,
                evaluation: self.evaluate(state, player_id),
                depth_reached: 0,
                nodes: 0,
                timed_out: false,
                duration_ms: start.elapsed().as_millis() as u64,
                resolution: None,
                strategy,
            };
        }

        let depth = self.config.depth.saturating_sub(1);
        let maximizing = state.current_player == player_id;
        let mut transitions = self.generate_transitions(state, state.current_player, deadline);
        self.prioritize_actions(state, &mut transitions, strategy, player_id);

        if transitions.is_empty() {
            return AiDecision {
                action: None,
                evaluation: self.evaluate(state, player_id),
                depth_reached: stats.depth_reached,
                nodes: stats.nodes,
                timed_out: stats.timed_out,
                duration_ms: start.elapsed().as_millis() as u64,
                resolution: None,
                strategy,
            };
        }

        let mut alpha = f64::NEG_INFINITY;
        let mut beta = f64::INFINITY;

        for (action, child_state) in transitions {
            let score = self.minimax_rec(
                &child_state,
                depth,
                alpha,
                beta,
                player_id,
                deadline,
                &mut stats,
            );

            if stats.timed_out {
                break;
            }

            if maximizing {
                alpha = alpha.max(score);
            } else {
                beta = beta.min(score);
            }

            let comparison_score = if self.config.randomness > 0.0 {
                score + self.random_noise()
            } else {
                score
            };

            if comparison_score > best_cmp {
                best_cmp = comparison_score;
                best_score = score;
                best_action = Some(action);
            }

            if alpha >= beta {
                break;
            }
        }

        let resolution = best_action
            .as_ref()
            .and_then(|action| self.simulate_resolution(state, action).ok());

        if best_action.is_none() {
            best_score = self.evaluate(state, player_id);
        }

        AiDecision {
            action: best_action,
            evaluation: best_score,
            depth_reached: stats.depth_reached,
            nodes: stats.nodes,
            timed_out: stats.timed_out,
            duration_ms: start.elapsed().as_millis() as u64,
            resolution,
            strategy,
        }
    }

    fn minimax_rec(
        &mut self,
        state: &GameState,
        depth_remaining: u8,
        mut alpha: f64,
        mut beta: f64,
        root_player: PlayerId,
        deadline: Option<WasmInstant>,
        stats: &mut SearchStats,
    ) -> f64 {
        stats.nodes += 1;
        let depth_explored = self.config.depth.saturating_sub(depth_remaining);
        if depth_explored > stats.depth_reached {
            stats.depth_reached = depth_explored;
        }

        if let Some(deadline) = deadline {
            if WasmInstant::now() >= deadline {
                stats.timed_out = true;
                return self.evaluate(state, root_player);
            }
        }

        if depth_remaining == 0 || state.is_finished() {
            return self.evaluate(state, root_player);
        }

        let actor = state.current_player;
        let maximizing_player = actor == root_player;
        let mut transitions = self.generate_transitions(state, actor, deadline);
        self.prioritize_actions(state, &mut transitions, self.config.strategy, root_player);
        if transitions.is_empty() {
            return self.evaluate(state, root_player);
        }

        if maximizing_player {
            let mut value = f64::NEG_INFINITY;
            for (_, child_state) in transitions {
                let score = self.minimax_rec(
                    &child_state,
                    depth_remaining.saturating_sub(1),
                    alpha,
                    beta,
                    root_player,
                    deadline,
                    stats,
                );
                value = value.max(score);
                alpha = alpha.max(value);
                if stats.timed_out || beta <= alpha {
                    break;
                }
            }
            value
        } else {
            let mut value = f64::INFINITY;
            for (_, child_state) in transitions {
                let score = self.minimax_rec(
                    &child_state,
                    depth_remaining.saturating_sub(1),
                    alpha,
                    beta,
                    root_player,
                    deadline,
                    stats,
                );
                value = value.min(score);
                beta = beta.min(value);
                if stats.timed_out || beta <= alpha {
                    break;
                }
            }
            value
        }
    }

    fn generate_transitions(
        &mut self,
        state: &GameState,
        actor: PlayerId,
        deadline: Option<WasmInstant>,
    ) -> Vec<(GameAction, GameState)> {
        let mut seen: Vec<GameAction> = Vec::new();
        let mut actions = Vec::new();

        if let Some(deadline) = deadline {
            if WasmInstant::now() >= deadline {
                return actions;
            }
        }

        if state.current_player != actor {
            if let Ok(new_state) = self.simulate_state(state, &GameAction::EndTurn) {
                actions.push((GameAction::EndTurn, new_state));
            }
            return actions;
        }

        if let Some(player) = state.get_player(actor) {
            // Playable cards
            for card in &player.hand {
                if let Some(deadline) = deadline {
                    if WasmInstant::now() >= deadline {
                        break;
                    }
                }
                if card.cost > player.mana {
                    continue;
                }

                let mut candidates: Vec<PlayCardAction> = Vec::new();
                candidates.push(PlayCardAction {
                    player_id: actor,
                    card_id: card.id,
                    target_player: None,
                    target_card: None,
                });

                if let Some(opponent) = state.opponent_of(actor) {
                    candidates.push(PlayCardAction {
                        player_id: actor,
                        card_id: card.id,
                        target_player: Some(opponent),
                        target_card: None,
                    });

                    if let Some(opponent_player) = state.get_player(opponent) {
                        for target in opponent_player.board.iter().take(4) {
                            candidates.push(PlayCardAction {
                                player_id: actor,
                                card_id: card.id,
                                target_player: Some(opponent),
                                target_card: Some(target.id),
                            });
                        }
                    }
                }

                for action in candidates {
                    let play_action = GameAction::PlayCard {
                        action: action.clone(),
                    };
                    if !seen.contains(&play_action) {
                        match self.simulate_state(state, &play_action) {
                            Ok(new_state) => {
                                seen.push(play_action.clone());
                                actions.push((play_action, new_state));
                            }
                            Err(_) => {}
                        }
                    }
                }
            }

            // Attacks
            if let Some(opponent) = state.opponent_of(actor) {
                let defender_board: Vec<CardId> = state
                    .get_player(opponent)
                    .map(|p| p.board.iter().map(|c| c.id).collect())
                    .unwrap_or_default();

                for card in &player.board {
                    if let Some(deadline) = deadline {
                        if WasmInstant::now() >= deadline {
                            break;
                        }
                    }
                    if card.exhausted || card.attack <= 0 {
                        continue;
                    }

                    let mut candidates: Vec<AttackAction> = Vec::new();
                    candidates.push(AttackAction {
                        attacker_owner: actor,
                        attacker_id: card.id,
                        defender_owner: opponent,
                        defender_card: None,
                    });

                    for defender_card in defender_board.iter().take(4) {
                        candidates.push(AttackAction {
                            attacker_owner: actor,
                            attacker_id: card.id,
                            defender_owner: opponent,
                            defender_card: Some(*defender_card),
                        });
                    }

                    for action in candidates {
                        let attack_action = GameAction::Attack {
                            action: action.clone(),
                        };
                        if !seen.contains(&attack_action) {
                            match self.simulate_state(state, &attack_action) {
                                Ok(new_state) => {
                                    seen.push(attack_action.clone());
                                    actions.push((attack_action, new_state));
                                }
                                Err(_) => {}
                            }
                        }
                    }
                }
            }
        }

        if !seen.contains(&GameAction::EndTurn) {
            if let Ok(new_state) = self.simulate_state(state, &GameAction::EndTurn) {
                actions.push((GameAction::EndTurn, new_state));
            }
        }

        if self.config.randomness > 0.0 {
            actions.shuffle(&mut self.rng);
        }

        actions
    }

    fn prioritize_actions(
        &mut self,
        base_state: &GameState,
        actions: &mut Vec<(GameAction, GameState)>,
        strategy: AiStrategy,
        player_id: PlayerId,
    ) {
        if actions.len() <= 1 {
            return;
        }

        match strategy {
            AiStrategy::Random => {}
            AiStrategy::Aggressive => actions.sort_by(|a, b| {
                aggressive_score(base_state, b, player_id)
                    .partial_cmp(&aggressive_score(base_state, a, player_id))
                    .unwrap_or(std::cmp::Ordering::Equal)
            }),
            AiStrategy::Control => actions.sort_by(|a, b| {
                control_score(base_state, b, player_id)
                    .partial_cmp(&control_score(base_state, a, player_id))
                    .unwrap_or(std::cmp::Ordering::Equal)
            }),
            AiStrategy::Combo => actions.sort_by(|a, b| {
                combo_score(base_state, b, player_id)
                    .partial_cmp(&combo_score(base_state, a, player_id))
                    .unwrap_or(std::cmp::Ordering::Equal)
            }),
            AiStrategy::Adaptive => actions.sort_by(|a, b| {
                let score_b = self.evaluate(&b.1, player_id);
                let score_a = self.evaluate(&a.1, player_id);
                score_b
                    .partial_cmp(&score_a)
                    .unwrap_or(std::cmp::Ordering::Equal)
            }),
        }
    }

    fn simulate_state(
        &mut self,
        state: &GameState,
        action: &GameAction,
    ) -> Result<GameState, RuleError> {
        let mut next_state = state.clone();
        let mut engine = RuleEngine::new();
        let result: Result<Vec<GameEvent>, RuleError> = match action {
            GameAction::PlayCard { action } => engine.play_card(&mut next_state, action.clone()),
            GameAction::Mulligan { action } => engine.mulligan(&mut next_state, action.clone()),
            GameAction::Attack { action } => engine.attack(&mut next_state, action.clone()),
            GameAction::EndTurn => engine.end_turn(&mut next_state),
        };
        match result {
            Ok(_) => Ok(next_state),
            Err(err) => Err(err),
        }
    }

    fn simulate_resolution(
        &mut self,
        state: &GameState,
        action: &GameAction,
    ) -> Result<RuleResolution, RuleError> {
        let mut next_state = state.clone();
        let mut engine = RuleEngine::new();
        let events = match action {
            GameAction::PlayCard { action } => engine.play_card(&mut next_state, action.clone())?,
            GameAction::Mulligan { action } => engine.mulligan(&mut next_state, action.clone())?,
            GameAction::Attack { action } => engine.attack(&mut next_state, action.clone())?,
            GameAction::EndTurn => engine.end_turn(&mut next_state)?,
        };
        Ok(RuleResolution::new(next_state, events))
    }

    fn evaluate(&self, state: &GameState, player_id: PlayerId) -> f64 {
        if let Some(outcome) = &state.outcome {
            if outcome.winner == player_id {
                return 1_000_000.0;
            } else {
                return -1_000_000.0;
            }
        }

        let Some(player) = state.get_player(player_id) else {
            return -1_000_000.0;
        };
        let opponent_id = state.opponent_of(player_id).unwrap_or(player_id);
        let opponent = state.get_player(opponent_id);

        let (hero_diff, board_diff, hand_diff, mana_diff, combo_value) =
            evaluation_components(state, player_id);

        let weights = match self.config.strategy {
            AiStrategy::Aggressive => StrategyWeights {
                hero: 3.0,
                board: 1.2,
                hand: 0.6,
                mana: 0.4,
                combo: 0.4,
            },
            AiStrategy::Control => StrategyWeights {
                hero: 1.2,
                board: 2.4,
                hand: 1.6,
                mana: 0.8,
                combo: 0.5,
            },
            AiStrategy::Combo => StrategyWeights {
                hero: 1.0,
                board: 1.4,
                hand: 1.8,
                mana: 0.9,
                combo: 2.6,
            },
            AiStrategy::Adaptive => adaptive_weights(hero_diff, board_diff),
            AiStrategy::Random => StrategyWeights {
                hero: 1.0,
                board: 1.0,
                hand: 1.0,
                mana: 0.5,
                combo: 0.3,
            },
        };

        let armor_bonus =
            (player.armor as f64 - opponent.map(|p| p.armor as f64).unwrap_or(0.0)) * 0.6;
        let turn_bonus = if state.current_player == player_id {
            0.3
        } else {
            -0.3
        };

        hero_diff * weights.hero
            + board_diff * weights.board
            + hand_diff * weights.hand
            + mana_diff * weights.mana
            + combo_value * weights.combo
            + armor_bonus
            + turn_bonus
    }

    fn random_noise(&mut self) -> f64 {
        if self.config.randomness <= 0.0 {
            0.0
        } else {
            (self.rng.gen::<f64>() - 0.5) * 2.0 * self.config.randomness
        }
    }
}

fn board_value(cards: &[Card]) -> f64 {
    cards
        .iter()
        .map(|card| {
            let atk = card.attack.max(0) as f64;
            let hp = card.health.max(0) as f64;
            atk * 1.6 + hp
        })
        .sum()
}

fn combo_potential(cards: &[Card]) -> f64 {
    cards
        .iter()
        .map(|card| {
            let effect_score = card.effects.len() as f64;
            let spell_bonus = if card.card_type == CardType::Spell {
                1.0
            } else {
                0.0
            };
            effect_score * 0.8 + spell_bonus
        })
        .sum()
}

fn aggressive_score(
    base: &GameState,
    action_state: &(GameAction, GameState),
    player_id: PlayerId,
) -> f64 {
    let (_, new_state) = action_state;
    let opponent_before = base
        .opponent_of(player_id)
        .and_then(|id| base.get_player(id))
        .map(|p| (p.health + p.armor as i16) as f64)
        .unwrap_or(0.0);
    let opponent_after = new_state
        .opponent_of(player_id)
        .and_then(|id| new_state.get_player(id))
        .map(|p| (p.health + p.armor as i16) as f64)
        .unwrap_or(0.0);
    let damage = opponent_before - opponent_after;
    let attacker_board = new_state
        .get_player(player_id)
        .map(|p| board_value(&p.board))
        .unwrap_or(0.0);
    damage + attacker_board
}

fn control_score(
    base: &GameState,
    action_state: &(GameAction, GameState),
    player_id: PlayerId,
) -> f64 {
    let (_, new_state) = action_state;
    let board_before = base
        .get_player(player_id)
        .map(|p| board_value(&p.board))
        .unwrap_or(0.0);
    let board_after = new_state
        .get_player(player_id)
        .map(|p| board_value(&p.board))
        .unwrap_or(0.0);
    let opponent_board = new_state
        .opponent_of(player_id)
        .and_then(|id| new_state.get_player(id))
        .map(|p| board_value(&p.board))
        .unwrap_or(0.0);
    (board_after - board_before) - opponent_board
}

fn combo_score(
    base: &GameState,
    action_state: &(GameAction, GameState),
    player_id: PlayerId,
) -> f64 {
    let (_, new_state) = action_state;
    let combo_before = base
        .get_player(player_id)
        .map(|p| combo_potential(&p.hand))
        .unwrap_or(0.0);
    let combo_after = new_state
        .get_player(player_id)
        .map(|p| combo_potential(&p.hand))
        .unwrap_or(0.0);
    let board_combo = new_state
        .get_player(player_id)
        .map(|p| combo_potential(&p.board))
        .unwrap_or(0.0);
    combo_before - combo_after + board_combo
}

fn evaluation_components(state: &GameState, player_id: PlayerId) -> (f64, f64, f64, f64, f64) {
    let player = match state.get_player(player_id) {
        Some(p) => p,
        None => return (0.0, 0.0, 0.0, 0.0, 0.0),
    };
    let opponent_id = state.opponent_of(player_id).unwrap_or(player_id);
    let opponent = state.get_player(opponent_id);

    let hero_diff = (player.health + player.armor as i16) as f64
        - opponent
            .map(|p| (p.health + p.armor as i16) as f64)
            .unwrap_or(0.0);
    let board_diff =
        board_value(&player.board) - opponent.map(|p| board_value(&p.board)).unwrap_or(0.0);
    let hand_diff = player.hand.len() as f64 - opponent.map(|p| p.hand.len() as f64).unwrap_or(0.0);
    let mana_diff = player.mana as f64 - opponent.map(|p| p.mana as f64).unwrap_or(0.0);
    let combo_value = combo_potential(&player.hand);

    (hero_diff, board_diff, hand_diff, mana_diff, combo_value)
}

#[derive(Debug, Clone, Copy)]
struct StrategyWeights {
    hero: f64,
    board: f64,
    hand: f64,
    mana: f64,
    combo: f64,
}

fn adaptive_weights(hero_diff: f64, board_diff: f64) -> StrategyWeights {
    let hero_weight = if hero_diff < 0.0 { 2.6 } else { 1.4 };
    let board_weight = if board_diff < 0.0 { 2.8 } else { 1.6 };
    StrategyWeights {
        hero: hero_weight,
        board: board_weight,
        hand: 1.3,
        mana: 0.9,
        combo: 1.1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{
        Card, CardEffect, CardType, EffectKind, EffectTarget, EffectTrigger, GameState, Player,
        VictoryReason,
    };

    #[test]
    fn ai_handles_finished_game() {
        let mut state = GameState::sample();
        state.declare_victory(
            0,
            VictoryReason::Special {
                reason: "Test".into(),
            },
        );
        let mut agent = AiAgent::new(AiConfig::from_difficulty(AiDifficulty::Easy));
        let decision = agent.decide_action(&state, 0);
        assert!(decision.action.is_none());
        assert!(decision.evaluation > 0.0);
    }
}
